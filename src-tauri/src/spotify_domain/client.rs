use std::sync::Arc;
use std::time::Duration;
use reqwest::Client;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::spotify_protocol::endpoints::{
    parse_devices_list, parse_player_state_json, parse_playlists_list, parse_search_results,
    parse_top_tracks, seek_url, volume_url, with_device_id, ENDPOINT_DEVICES, ENDPOINT_NEXT,
    ENDPOINT_PAUSE, ENDPOINT_PLAY, ENDPOINT_PLAYER, ENDPOINT_PLAYLISTS, ENDPOINT_PREVIOUS,
    ENDPOINT_SEARCH, ENDPOINT_TOP_TRACKS, ENDPOINT_TRANSFER,
};
use crate::spotify_protocol::models::{
    DeviceDto, PlayerStateDto, PlaylistDto, SearchResultDto, TrackDto,
};
use super::auth::{urlencoding, SpotifyAuth};

#[derive(Clone)]
pub struct SpotifyRemoteClient {
    auth: Arc<SpotifyAuth>,
    http_client: Client,
}

impl SpotifyRemoteClient {
    pub fn new(auth: Arc<SpotifyAuth>) -> Self {
        let http_client = Client::builder()
            .connect_timeout(Duration::from_secs(4))
            .timeout(Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            auth,
            http_client,
        }
    }

    pub fn auth(&self) -> Arc<SpotifyAuth> {
        self.auth.clone()
    }

    async fn bearer_header(&self) -> Result<String, AppError> {
        let token = self.auth.get_valid_access_token().await?;
        Ok(format!("Bearer {token}"))
    }

    /// GET /v1/me/player
    pub async fn get_player_state(&self) -> Result<Option<PlayerStateDto>, AppError> {
        let auth_hdr = self.bearer_header().await?;
        let resp = self
            .http_client
            .get(ENDPOINT_PLAYER)
            .header("Authorization", auth_hdr)
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(None);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(AppError::Spotify(format!("Get player state returned {status}: {err_text}")));
        }

        let body: Value = resp.json().await?;
        Ok(parse_player_state_json(&body))
    }

    /// PUT /v1/me/player/play
    pub async fn play(&self, device_id: Option<&str>) -> Result<(), AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = with_device_id(ENDPOINT_PLAY, device_id);

        let resp = self
            .http_client
            .put(&url)
            .header("Authorization", auth_hdr)
            .header("Content-Length", 0)
            .send()
            .await?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            Err(AppError::Spotify(format!("Play failed ({status}): {err_text}")))
        }
    }

    /// PUT /v1/me/player/pause
    pub async fn pause(&self, device_id: Option<&str>) -> Result<(), AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = with_device_id(ENDPOINT_PAUSE, device_id);

        let resp = self
            .http_client
            .put(&url)
            .header("Authorization", auth_hdr)
            .header("Content-Length", 0)
            .send()
            .await?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            Err(AppError::Spotify(format!("Pause failed ({status}): {err_text}")))
        }
    }

    /// Toggles play / pause based on current state
    pub async fn toggle_play(&self, device_id: Option<&str>) -> Result<(), AppError> {
        let current = self.get_player_state().await?;
        match current {
            Some(state) if state.is_playing => self.pause(device_id).await,
            _ => self.play(device_id).await,
        }
    }

    /// POST /v1/me/player/next
    pub async fn next(&self, device_id: Option<&str>) -> Result<(), AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = with_device_id(ENDPOINT_NEXT, device_id);

        let resp = self
            .http_client
            .post(&url)
            .header("Authorization", auth_hdr)
            .header("Content-Length", 0)
            .send()
            .await?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            Err(AppError::Spotify(format!("Next failed ({status}): {err_text}")))
        }
    }

    /// POST /v1/me/player/previous
    pub async fn previous(&self, device_id: Option<&str>) -> Result<(), AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = with_device_id(ENDPOINT_PREVIOUS, device_id);

        let resp = self
            .http_client
            .post(&url)
            .header("Authorization", auth_hdr)
            .header("Content-Length", 0)
            .send()
            .await?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            Err(AppError::Spotify(format!("Previous failed ({status}): {err_text}")))
        }
    }

    /// PUT /v1/me/player/seek
    pub async fn seek(&self, position_ms: u32, device_id: Option<&str>) -> Result<(), AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = seek_url(position_ms, device_id);

        let resp = self
            .http_client
            .put(&url)
            .header("Authorization", auth_hdr.clone())
            .header("Content-Length", 0)
            .send()
            .await?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            println!("[SpotifyClient] Seek to {position_ms}ms (device: {:?}) -> OK (204)", device_id);
            return Ok(());
        }

        let first_status = resp.status();
        let first_err = resp.text().await.unwrap_or_default();
        eprintln!("[SpotifyClient] Targeted seek to {position_ms}ms failed ({first_status}): {first_err}");

        // If targeted device_id failed (e.g. 404 device not found or 403), retry targeting active device directly
        if device_id.is_some() {
            let fallback_url = seek_url(position_ms, None);
            let retry_resp = self
                .http_client
                .put(&fallback_url)
                .header("Authorization", auth_hdr)
                .header("Content-Length", 0)
                .send()
                .await?;

            if retry_resp.status().is_success() || retry_resp.status() == reqwest::StatusCode::NO_CONTENT {
                println!("[SpotifyClient] Fallback active-device seek to {position_ms}ms -> OK (204)");
                return Ok(());
            }

            let retry_status = retry_resp.status();
            let retry_err = retry_resp.text().await.unwrap_or_default();
            eprintln!("[SpotifyClient] Fallback seek failed ({retry_status}): {retry_err}");
            return Err(AppError::Spotify(format!("Seek failed ({retry_status}): {retry_err}")));
        }

        Err(AppError::Spotify(format!("Seek failed ({first_status}): {first_err}")))
    }

    /// PUT /v1/me/player/volume
    pub async fn set_volume(&self, volume_percent: u8, device_id: Option<&str>) -> Result<(), AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = volume_url(volume_percent, device_id);

        let resp = self
            .http_client
            .put(&url)
            .header("Authorization", auth_hdr)
            .header("Content-Length", 0)
            .send()
            .await?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            Err(AppError::Spotify(format!("Set volume failed ({status}): {err_text}")))
        }
    }

    /// GET /v1/me/player/devices
    pub async fn get_devices(&self) -> Result<Vec<DeviceDto>, AppError> {
        let auth_hdr = self.bearer_header().await?;

        let resp = self
            .http_client
            .get(ENDPOINT_DEVICES)
            .header("Authorization", auth_hdr)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(AppError::Spotify(format!("Get devices failed ({status}): {err_text}")));
        }

        let body: Value = resp.json().await?;
        Ok(parse_devices_list(&body))
    }

    /// PUT /v1/me/player (Transfer playback)
    pub async fn transfer_playback(&self, device_id: &str, play: bool) -> Result<(), AppError> {
        let auth_hdr = self.bearer_header().await?;
        let body = json!({
            "device_ids": [device_id],
            "play": play
        });

        let resp = self
            .http_client
            .put(ENDPOINT_TRANSFER)
            .header("Authorization", auth_hdr)
            .json(&body)
            .send()
            .await?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            Err(AppError::Spotify(format!("Transfer playback failed ({status}): {err_text}")))
        }
    }

    /// PUT /v1/me/player/play with specific track/playlist/album URI
    pub async fn play_uri(&self, uri: &str, device_id: Option<&str>) -> Result<(), AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = with_device_id(ENDPOINT_PLAY, device_id);

        let body = if uri.contains(":playlist:") || uri.contains(":album:") || uri.contains(":artist:") {
            json!({ "context_uri": uri })
        } else {
            json!({ "uris": [uri] })
        };

        let resp = self
            .http_client
            .put(&url)
            .header("Authorization", auth_hdr)
            .json(&body)
            .send()
            .await?;

        if resp.status().is_success() || resp.status() == reqwest::StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            Err(AppError::Spotify(format!("Play URI failed ({status}): {err_text}")))
        }
    }

    /// GET /v1/me/playlists
    pub async fn get_user_playlists(&self) -> Result<Vec<PlaylistDto>, AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = format!("{ENDPOINT_PLAYLISTS}?limit=30");

        let resp = self
            .http_client
            .get(&url)
            .header("Authorization", auth_hdr)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(AppError::Spotify(format!("Get playlists failed ({status}): {err_text}")));
        }

        let body: Value = resp.json().await?;
        Ok(parse_playlists_list(&body))
    }

    /// GET /v1/me/top/tracks
    pub async fn get_top_tracks(&self) -> Result<Vec<TrackDto>, AppError> {
        let auth_hdr = self.bearer_header().await?;
        let url = format!("{ENDPOINT_TOP_TRACKS}?limit=20");

        let resp = self
            .http_client
            .get(&url)
            .header("Authorization", auth_hdr)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(AppError::Spotify(format!("Get top tracks failed ({status}): {err_text}")));
        }

        let body: Value = resp.json().await?;
        Ok(parse_top_tracks(&body))
    }

    /// GET /v1/search
    pub async fn search(&self, query: &str) -> Result<SearchResultDto, AppError> {
        let auth_hdr = self.bearer_header().await?;
        let encoded_query = urlencoding::encode(query);
        let url = format!("{ENDPOINT_SEARCH}?q={encoded_query}&type=track,playlist&limit=15");

        let resp = self
            .http_client
            .get(&url)
            .header("Authorization", auth_hdr)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(AppError::Spotify(format!("Search failed ({status}): {err_text}")));
        }

        let body: Value = resp.json().await?;
        Ok(parse_search_results(&body))
    }
}
