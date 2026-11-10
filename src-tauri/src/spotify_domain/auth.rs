use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use reqwest::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::RwLock;

use crate::error::AppError;
use crate::spotify_protocol::endpoints::{ENDPOINT_AUTHORIZE, ENDPOINT_TOKEN};
use crate::spotify_protocol::models::{AuthSessionDto, TokenBundleDto};

const REDIRECT_URI: &str = "http://127.0.0.1:8888/callback";
const SPOTIFY_SCOPES: &str = "streaming user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-email user-read-private playlist-read-private playlist-read-collaborative user-top-read user-library-read";

#[derive(Clone)]
pub struct SpotifyAuth {
    http_client: Client,
    client_id: Arc<RwLock<String>>,
    tokens: Arc<RwLock<Option<TokenBundleDto>>>,
    storage_path: PathBuf,
}

impl SpotifyAuth {
    pub fn new() -> Self {
        let storage_path = dirs_storage_path();
        let http_client = Client::builder()
            .connect_timeout(Duration::from_secs(4))
            .timeout(Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| Client::new());

        let auth = Self {
            http_client,
            client_id: Arc::new(RwLock::new(String::new())),
            tokens: Arc::new(RwLock::new(None)),
            storage_path,
        };
        auth.load_from_disk();
        auth
    }

    fn now_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    fn load_from_disk(&self) {
        if let Ok(content) = fs::read_to_string(&self.storage_path) {
            if let Ok(saved) = serde_json::from_str::<SavedAuthData>(&content) {
                if let Ok(mut cid) = self.client_id.try_write() {
                    *cid = saved.client_id;
                }
                if let Ok(mut tokens) = self.tokens.try_write() {
                    *tokens = Some(saved.tokens);
                }
            }
        }
    }

    fn persist_to_disk(&self, client_id: &str, tokens: &TokenBundleDto) {
        let data = SavedAuthData {
            client_id: client_id.to_string(),
            tokens: tokens.clone(),
        };
        if let Ok(serialized) = serde_json::to_string_pretty(&data) {
            let _ = fs::write(&self.storage_path, serialized);
        }
    }

    pub async fn get_auth_session(&self) -> AuthSessionDto {
        let cid = self.client_id.read().await.clone();
        let tokens_guard = self.tokens.read().await;
        let (is_auth, exp) = match &*tokens_guard {
            Some(t) => (t.expires_at > Self::now_secs() || t.refresh_token.is_some(), t.expires_at),
            None => (false, 0),
        };
        AuthSessionDto {
            is_authenticated: is_auth,
            client_id: cid,
            expires_at: exp,
        }
    }

    pub async fn get_tokens(&self) -> Option<TokenBundleDto> {
        let tokens = self.tokens.read().await;
        tokens.clone()
    }

    pub async fn logout(&self) {
        let mut tokens = self.tokens.write().await;
        *tokens = None;
        let _ = fs::remove_file(&self.storage_path);
    }

    /// Returns a valid access token, auto-refreshing if expired or within 60s of expiration
    pub async fn get_valid_access_token(&self) -> Result<String, AppError> {
        let (token, needs_refresh) = {
            let tokens_guard = self.tokens.read().await;
            match &*tokens_guard {
                Some(bundle) => {
                    let now = Self::now_secs();
                    (bundle.access_token.clone(), now + 60 >= bundle.expires_at)
                }
                None => return Err(AppError::Auth("Not authenticated. Please log in first.".into())),
            }
        };

        if needs_refresh {
            let refreshed = self.refresh_access_token().await?;
            Ok(refreshed.access_token)
        } else {
            Ok(token)
        }
    }

    /// Refresh token flow
    pub async fn refresh_access_token(&self) -> Result<TokenBundleDto, AppError> {
        let (client_id, refresh_token) = {
            let cid = self.client_id.read().await.clone();
            let tokens = self.tokens.read().await;
            let rt = tokens
                .as_ref()
                .and_then(|t| t.refresh_token.clone())
                .ok_or_else(|| AppError::Auth("No refresh token available".into()))?;
            (cid, rt)
        };

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
            ("client_id", &client_id),
        ];

        let resp = self
            .http_client
            .post(ENDPOINT_TOKEN)
            .form(&params)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            return Err(AppError::Auth(format!("Token refresh failed: {err_text}")));
        }

        let body: Value = resp.json().await?;
        let access_token = body
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Auth("Missing access_token in refresh response".into()))?
            .to_string();

        let expires_in = body.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
        let new_refresh_token = body
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(|s| s.to_string())
            .or_else(|| Some(refresh_token.clone()));

        let new_tokens = TokenBundleDto {
            access_token,
            refresh_token: new_refresh_token,
            expires_in,
            expires_at: Self::now_secs() + expires_in,
            token_type: "Bearer".to_string(),
        };

        {
            let mut guard = self.tokens.write().await;
            *guard = Some(new_tokens.clone());
        }
        self.persist_to_disk(&client_id, &new_tokens);

        Ok(new_tokens)
    }

    /// Executes the full PKCE login loop
    pub async fn start_pkce_login(&self, client_id: &str) -> Result<TokenBundleDto, AppError> {
        let verifier = generate_code_verifier();
        let challenge = generate_code_challenge(&verifier);

        // Bind temporary loopback listener
        let listener = TcpListener::bind("127.0.0.1:8888")
            .await
            .map_err(|e| AppError::Auth(format!("Failed to bind 127.0.0.1:8888 for OAuth callback: {e}")))?;

        let auth_url = format!(
            "{ENDPOINT_AUTHORIZE}?client_id={client_id}&response_type=code&redirect_uri={}&code_challenge_method=S256&code_challenge={challenge}&scope={}",
            urlencoding::encode(REDIRECT_URI),
            urlencoding::encode(SPOTIFY_SCOPES)
        );

        // Open browser
        if let Err(e) = open::that(&auth_url) {
            eprintln!("Warning: Failed to launch browser automatically: {e}");
        }

        // Wait for single incoming connection on loopback listener
        let (mut socket, _) = listener
            .accept()
            .await
            .map_err(|e| AppError::Auth(format!("Callback listener accept failed: {e}")))?;

        let mut buffer = [0u8; 2048];
        let bytes_read = socket
            .read(&mut buffer)
            .await
            .map_err(|e| AppError::Auth(format!("Failed to read callback request: {e}")))?;

        let request_str = String::from_utf8_lossy(&buffer[..bytes_read]);
        let auth_code = extract_query_param(&request_str, "code")
            .ok_or_else(|| AppError::Auth("Callback did not contain authorization code".into()))?;

        // Send friendly HTML response to browser
        let html_response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!DOCTYPE html><html><body style='font-family:-apple-system,sans-serif;background:#09090b;color:#22c55e;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'><div style='text-align:center;'><h1>Desk Companion</h1><p style='color:#e4e4e7;'>Authentication successful! You can safely close this browser window.</p></div></body></html>";
        let _ = socket.write_all(html_response.as_bytes()).await;
        let _ = socket.flush().await;

        // Exchange code for tokens
        let params = [
            ("grant_type", "authorization_code"),
            ("code", &auth_code),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", client_id),
            ("code_verifier", &verifier),
        ];

        let resp = self
            .http_client
            .post(ENDPOINT_TOKEN)
            .form(&params)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            return Err(AppError::Auth(format!("Failed to exchange authorization code: {err_text}")));
        }

        let body: Value = resp.json().await?;
        let access_token = body
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Auth("Missing access_token in token response".into()))?
            .to_string();

        let refresh_token = body
            .get("refresh_token")
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        let expires_in = body.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);

        let tokens = TokenBundleDto {
            access_token,
            refresh_token,
            expires_in,
            expires_at: Self::now_secs() + expires_in,
            token_type: "Bearer".to_string(),
        };

        {
            let mut cid_guard = self.client_id.write().await;
            *cid_guard = client_id.to_string();
            let mut tok_guard = self.tokens.write().await;
            *tok_guard = Some(tokens.clone());
        }

        self.persist_to_disk(client_id, &tokens);
        Ok(tokens)
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SavedAuthData {
    client_id: String,
    tokens: TokenBundleDto,
}

fn dirs_storage_path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".spotify_auth_session.json")
}

fn generate_code_verifier() -> String {
    use std::time::SystemTime;
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut s = format!("{seed:x}_desk_companion_pkce_verifier_token_salt_entropy_string");
    while s.len() < 64 {
        s.push_str("0123456789abcdef");
    }
    s.truncate(64);
    s
}

fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(hash)
}

fn extract_query_param(http_req: &str, param: &str) -> Option<String> {
    let first_line = http_req.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.split('=');
        if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
            if k == param {
                return Some(urlencoding::decode(v).unwrap_or_default());
            }
        }
    }
    None
}

pub mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut encoded = String::new();
        for b in s.bytes() {
            match b {
                b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    encoded.push(b as char);
                }
                b' ' => encoded.push_str("%20"),
                _ => encoded.push_str(&format!("%{b:02X}")),
            }
        }
        encoded
    }

    pub fn decode(s: &str) -> Result<String, ()> {
        let mut res = String::new();
        let bytes = s.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' && i + 2 < bytes.len() {
                if let Ok(val) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..=i + 2]).map_err(|_| ())?, 16) {
                    res.push(val as char);
                    i += 3;
                    continue;
                }
            } else if bytes[i] == b'+' {
                res.push(' ');
                i += 1;
                continue;
            }
            res.push(bytes[i] as char);
            i += 1;
        }
        Ok(res)
    }
}
