use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::spotify_domain::auth::urlencoding;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LyricsDto {
    pub id: Option<u64>,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    pub duration_seconds: Option<f64>,
    pub instrumental: bool,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
}

#[derive(Clone)]
pub struct LyricsService {
    http_client: Client,
    cache: Arc<RwLock<HashMap<String, LyricsDto>>>,
}

/// Helper function to strip noisy parenthetical / bracketed substrings from titles.
/// e.g. "(feat. ...)", "[Remastered]", etc.
fn strip_parenthetical(s: &str, open: char, close: char) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0;
    let mut temp = String::new();

    for ch in s.chars() {
        if ch == open {
            depth += 1;
            temp.clear();
        } else if ch == close && depth > 0 {
            depth -= 1;
            let lower = temp.to_lowercase();
            // If it's metadata noise (feat, remaster, bonus, etc.), drop it.
            // If it appears to be part of the actual song title, keep it.
            let is_noise = lower.starts_with("feat")
                || lower.starts_with("ft.")
                || lower.starts_with("with ")
                || lower.contains("remaster")
                || lower.contains("deluxe")
                || lower.contains("bonus track")
                || lower.contains("anniversary")
                || lower.contains("expanded")
                || lower.contains("radio edit")
                || lower.contains("single version")
                || lower.contains("live at")
                || lower.contains("live from");

            if !is_noise {
                out.push(open);
                out.push_str(&temp);
                out.push(close);
            }
            temp.clear();
        } else if depth > 0 {
            temp.push(ch);
        } else {
            out.push(ch);
        }
    }
    out
}

/// Cleans track titles from Spotify metadata noise (remaster tags, featured artists, edition names)
pub fn clean_title(title: &str) -> String {
    let mut cleaned = title.trim();

    // 1. Strip trailing dash clauses: " - Remastered 2011", " - Live", " - Radio Edit"
    if let Some(idx) = cleaned.find(" - ") {
        let suffix = &cleaned[idx + 3..].to_lowercase();
        if suffix.contains("remaster")
            || suffix.contains("live")
            || suffix.contains("radio")
            || suffix.contains("single")
            || suffix.contains("bonus")
            || suffix.contains("deluxe")
            || suffix.contains("edit")
            || suffix.contains("mix")
            || suffix.contains("version")
            || suffix.contains("mono")
            || suffix.contains("stereo")
            || suffix.contains("acoustic")
            || suffix.contains("anniversary")
        {
            cleaned = cleaned[..idx].trim();
        }
    }

    // 2. Strip bracketed noise: (feat. ...), [feat. ...], (Remastered...)
    let mut result = cleaned.to_string();
    result = strip_parenthetical(&result, '(', ')');
    result = strip_parenthetical(&result, '[', ']');
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Cleans album names from Deluxe / Remaster noise
pub fn clean_album(album: &str) -> String {
    let mut cleaned = album.trim();
    if let Some(idx) = cleaned.find(" - ") {
        cleaned = cleaned[..idx].trim();
    }
    let mut result = cleaned.to_string();
    result = strip_parenthetical(&result, '(', ')');
    result = strip_parenthetical(&result, '[', ']');
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

impl LyricsService {
    pub fn new() -> Self {
        Self {
            http_client: Client::builder()
                .user_agent("DeskCompanion/1.0.0 (https://github.com/deskcompanion)")
                .connect_timeout(Duration::from_secs(4))
                .timeout(Duration::from_secs(8))
                .build()
                .unwrap_or_else(|_| Client::new()),
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn cache_key(track_name: &str, artist_name: &str) -> String {
        format!("{}-{}", track_name.to_lowercase().trim(), artist_name.to_lowercase().trim())
    }

    async fn fetch_exact_match(
        &self,
        track_name: &str,
        artist_name: &str,
        album_name: Option<&str>,
        duration_secs: Option<u32>,
    ) -> Option<LyricsDto> {
        let mut get_url = format!(
            "https://lrclib.net/api/get?track_name={}&artist_name={}",
            urlencoding::encode(track_name),
            urlencoding::encode(artist_name),
        );

        if let Some(album) = album_name {
            if !album.is_empty() {
                get_url.push_str(&format!("&album_name={}", urlencoding::encode(album)));
            }
        }
        if let Some(dur) = duration_secs {
            get_url.push_str(&format!("&duration={dur}"));
        }

        if let Ok(resp) = self.http_client.get(&get_url).send().await {
            if resp.status().is_success() {
                if let Ok(lyrics) = resp.json::<LyricsDto>().await {
                    if lyrics.synced_lyrics.is_some() || lyrics.plain_lyrics.is_some() {
                        return Some(lyrics);
                    }
                }
            }
        }
        None
    }

    pub async fn get_lyrics(
        &self,
        raw_track_name: &str,
        raw_artist_name: &str,
        raw_album_name: Option<&str>,
        duration_ms: Option<u32>,
    ) -> Result<Option<LyricsDto>, AppError> {
        let key = Self::cache_key(raw_track_name, raw_artist_name);

        // Check cache first
        if let Ok(cache) = self.cache.read() {
            if let Some(hit) = cache.get(&key) {
                return Ok(Some(hit.clone()));
            }
        }

        let duration_secs = duration_ms.map(|ms| ms / 1000);
        let sanitized_title = clean_title(raw_track_name);
        let sanitized_album = raw_album_name.map(clean_album);

        // Step 1: Try exact match with sanitized track title + album + duration
        if let Some(lyrics) = self
            .fetch_exact_match(
                &sanitized_title,
                raw_artist_name,
                sanitized_album.as_deref(),
                duration_secs,
            )
            .await
        {
            if let Ok(mut cache) = self.cache.write() {
                cache.insert(key, lyrics.clone());
            }
            return Ok(Some(lyrics));
        }

        // Step 2: Try exact match without album constraint (album names frequently mismatch on LRCLIB)
        if sanitized_album.is_some() {
            if let Some(lyrics) = self
                .fetch_exact_match(&sanitized_title, raw_artist_name, None, duration_secs)
                .await
            {
                if let Ok(mut cache) = self.cache.write() {
                    cache.insert(key, lyrics.clone());
                }
                return Ok(Some(lyrics));
            }
        }

        // Step 3: Try exact match with original raw strings as provided by Spotify
        if sanitized_title != raw_track_name {
            if let Some(lyrics) = self
                .fetch_exact_match(raw_track_name, raw_artist_name, raw_album_name, duration_secs)
                .await
            {
                if let Ok(mut cache) = self.cache.write() {
                    cache.insert(key, lyrics.clone());
                }
                return Ok(Some(lyrics));
            }
        }

        // Step 4: Fallback search with sanitized query: GET https://lrclib.net/api/search?q=...
        let query = format!("{sanitized_title} {raw_artist_name}");
        let search_url = format!(
            "https://lrclib.net/api/search?q={}",
            urlencoding::encode(&query)
        );

        if let Ok(search_resp) = self.http_client.get(&search_url).send().await {
            if search_resp.status().is_success() {
                if let Ok(items) = search_resp.json::<Vec<LyricsDto>>().await {
                    // Filter items to ensure we don't pick an acoustic/live mismatch with wrong duration!
                    if let Some(target_dur) = duration_secs {
                        // 4A: Look for synced lyrics matching track duration within +/- 3.5 seconds
                        if let Some(matched) = items.iter().find(|item| {
                            item.synced_lyrics.is_some()
                                && item
                                    .duration_seconds
                                    .map(|d| (d - target_dur as f64).abs() <= 3.5)
                                    .unwrap_or(false)
                        }) {
                            let found = matched.clone();
                            if let Ok(mut cache) = self.cache.write() {
                                cache.insert(key, found.clone());
                            }
                            return Ok(Some(found));
                        }

                        // 4B: Look for synced lyrics matching track duration within +/- 7.0 seconds
                        if let Some(matched) = items.iter().find(|item| {
                            item.synced_lyrics.is_some()
                                && item
                                    .duration_seconds
                                    .map(|d| (d - target_dur as f64).abs() <= 7.0)
                                    .unwrap_or(false)
                        }) {
                            let found = matched.clone();
                            if let Ok(mut cache) = self.cache.write() {
                                cache.insert(key, found.clone());
                            }
                            return Ok(Some(found));
                        }
                    }

                    // 4C: Last fallback - take the first synced lyric or first lyric overall
                    if let Some(best_match) = items
                        .iter()
                        .find(|item| item.synced_lyrics.is_some())
                        .or_else(|| items.first())
                    {
                        let found = best_match.clone();
                        if let Ok(mut cache) = self.cache.write() {
                            cache.insert(key, found.clone());
                        }
                        return Ok(Some(found));
                    }
                }
            }
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_title() {
        assert_eq!(clean_title("Bohemian Rhapsody - Remastered 2011"), "Bohemian Rhapsody");
        assert_eq!(clean_title("Empire State of Mind (feat. Alicia Keys)"), "Empire State of Mind");
        assert_eq!(clean_title("Stay (with Justin Bieber)"), "Stay");
        assert_eq!(clean_title("Hotel California - 2013 Remaster"), "Hotel California");
        assert_eq!(clean_title("Viva La Vida - Radio Edit"), "Viva La Vida");
        assert_eq!(clean_title("(I Can't Get No) Satisfaction"), "(I Can't Get No) Satisfaction");
    }
}
