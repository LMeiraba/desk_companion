//! Pure Spotify Web API endpoint definitions and response parsers.
//! This module has zero dependency on desktop frameworks (Tauri, Windows)
//! and serves as the 1:1 blueprint for porting to C/C++ on ESP32-C3.

use super::models::{DeviceDto, PlayerStateDto, PlaylistDto, SearchResultDto, TrackDto};
use serde_json::Value;

pub const SPOTIFY_ACCOUNTS_BASE: &str = "https://accounts.spotify.com";
pub const SPOTIFY_API_BASE: &str = "https://api.spotify.com/v1";

pub const ENDPOINT_AUTHORIZE: &str = "https://accounts.spotify.com/authorize";
pub const ENDPOINT_TOKEN: &str = "https://accounts.spotify.com/api/token";
pub const ENDPOINT_PLAYER: &str = "https://api.spotify.com/v1/me/player?additional_types=track,episode";
pub const ENDPOINT_PLAY: &str = "https://api.spotify.com/v1/me/player/play";
pub const ENDPOINT_PAUSE: &str = "https://api.spotify.com/v1/me/player/pause";
pub const ENDPOINT_NEXT: &str = "https://api.spotify.com/v1/me/player/next";
pub const ENDPOINT_PREVIOUS: &str = "https://api.spotify.com/v1/me/player/previous";
pub const ENDPOINT_SEEK: &str = "https://api.spotify.com/v1/me/player/seek";
pub const ENDPOINT_VOLUME: &str = "https://api.spotify.com/v1/me/player/volume";
pub const ENDPOINT_DEVICES: &str = "https://api.spotify.com/v1/me/player/devices";
pub const ENDPOINT_TRANSFER: &str = "https://api.spotify.com/v1/me/player";
pub const ENDPOINT_PLAYLISTS: &str = "https://api.spotify.com/v1/me/playlists";
pub const ENDPOINT_SEARCH: &str = "https://api.spotify.com/v1/search";
pub const ENDPOINT_TOP_TRACKS: &str = "https://api.spotify.com/v1/me/top/tracks";

/// Formats the query string for endpoint actions that optionally target a specific device
pub fn with_device_id(base_url: &str, device_id: Option<&str>) -> String {
    match device_id {
        Some(id) if !id.trim().is_empty() => format!("{base_url}?device_id={id}"),
        _ => base_url.to_string(),
    }
}

/// Formats the seek endpoint with position in milliseconds
pub fn seek_url(position_ms: u32, device_id: Option<&str>) -> String {
    match device_id {
        Some(id) if !id.trim().is_empty() => {
            format!("{ENDPOINT_SEEK}?position_ms={position_ms}&device_id={id}")
        }
        _ => format!("{ENDPOINT_SEEK}?position_ms={position_ms}"),
    }
}

/// Formats the volume endpoint with volume percent (0-100)
pub fn volume_url(volume_percent: u8, device_id: Option<&str>) -> String {
    let clamped = volume_percent.min(100);
    match device_id {
        Some(id) if !id.trim().is_empty() => {
            format!("{ENDPOINT_VOLUME}?volume_percent={clamped}&device_id={id}")
        }
        _ => format!("{ENDPOINT_VOLUME}?volume_percent={clamped}"),
    }
}

/// Parses Spotify's `GET /v1/me/player` JSON payload into `PlayerStateDto`
pub fn parse_player_state_json(val: &Value) -> Option<PlayerStateDto> {
    if val.is_null() {
        return None;
    }

    let is_playing = val.get("is_playing").and_then(Value::as_bool).unwrap_or(false);
    let progress_ms = val.get("progress_ms").and_then(Value::as_u64).unwrap_or(0) as u32;
    let repeat_mode = val.get("repeat_state").and_then(Value::as_str).unwrap_or("off").to_string();
    let shuffle_state = val.get("shuffle_state").and_then(Value::as_bool).unwrap_or(false);
    let timestamp = val.get("timestamp").and_then(Value::as_u64).unwrap_or(0);

    let device = val.get("device").and_then(parse_single_device);
    let track = val.get("item").and_then(parse_single_track);
    let duration_ms = track.as_ref().map(|t| t.duration_ms).unwrap_or(0);

    Some(PlayerStateDto {
        is_playing,
        progress_ms,
        duration_ms,
        track,
        device,
        repeat_mode,
        shuffle_state,
        timestamp,
    })
}

/// Parses a single track object from Spotify JSON
pub fn parse_single_track(item: &Value) -> Option<TrackDto> {
    if item.is_null() {
        return None;
    }

    let id = item.get("id").and_then(Value::as_str).unwrap_or("").to_string();
    let uri = item.get("uri").and_then(Value::as_str).unwrap_or("").to_string();
    let name = item.get("name").and_then(Value::as_str).unwrap_or("").to_string();
    let duration_ms = item.get("duration_ms").and_then(Value::as_u64).unwrap_or(0) as u32;

    let mut artists: Vec<String> = item
        .get("artists")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a.get("name").and_then(Value::as_str).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    if artists.is_empty() {
        if let Some(show_name) = item.get("show").and_then(|s| s.get("name")).and_then(Value::as_str) {
            artists.push(show_name.to_string());
        }
    }

    let album = item.get("album");
    let album_name = album
        .and_then(|a| a.get("name"))
        .and_then(Value::as_str)
        .or_else(|| item.get("show").and_then(|s| s.get("name")).and_then(Value::as_str))
        .unwrap_or("")
        .to_string();

    let album_art_url = album
        .and_then(|a| a.get("images"))
        .and_then(Value::as_array)
        .and_then(|images| images.first())
        .and_then(|img| img.get("url"))
        .or_else(|| {
            item.get("images")
                .and_then(Value::as_array)
                .and_then(|images| images.first())
                .and_then(|img| img.get("url"))
        })
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    Some(TrackDto {
        id,
        uri,
        name,
        artists,
        album_name,
        album_art_url,
        duration_ms,
    })
}

/// Parses a single device object from Spotify JSON
pub fn parse_single_device(d: &Value) -> Option<DeviceDto> {
    if d.is_null() {
        return None;
    }

    let id = d.get("id").and_then(Value::as_str).unwrap_or("").to_string();
    let name = d.get("name").and_then(Value::as_str).unwrap_or("").to_string();
    let device_type = d.get("type").and_then(Value::as_str).unwrap_or("Unknown").to_string();
    let is_active = d.get("is_active").and_then(Value::as_bool).unwrap_or(false);
    let volume_percent = d.get("volume_percent").and_then(Value::as_u64).unwrap_or(100) as u8;
    let is_restricted = d.get("is_restricted").and_then(Value::as_bool).unwrap_or(false);

    Some(DeviceDto {
        id,
        name,
        device_type,
        is_active,
        volume_percent,
        is_restricted,
    })
}

/// Parses devices list from `GET /v1/me/player/devices`
pub fn parse_devices_list(val: &Value) -> Vec<DeviceDto> {
    val.get("devices")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(parse_single_device).collect())
        .unwrap_or_default()
}

/// Parses playlists from `GET /v1/me/playlists`
pub fn parse_playlists_list(val: &Value) -> Vec<PlaylistDto> {
    val.get("items")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let id = p.get("id")?.as_str()?.to_string();
                    let name = p.get("name")?.as_str()?.to_string();
                    let description = p.get("description").and_then(Value::as_str).unwrap_or("").to_string();
                    let uri = p.get("uri")?.as_str()?.to_string();
                    let track_count = p.get("tracks")
                        .and_then(|t| t.get("total"))
                        .and_then(Value::as_u64)
                        .unwrap_or(0) as u32;
                    let image_url = p.get("images")
                        .and_then(Value::as_array)
                        .and_then(|imgs| imgs.first())
                        .and_then(|img| img.get("url"))
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    Some(PlaylistDto {
                        id,
                        name,
                        description,
                        image_url,
                        track_count,
                        uri,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Parses search result from `GET /v1/search`
pub fn parse_search_results(val: &Value) -> SearchResultDto {
    let tracks = val
        .get("tracks")
        .and_then(|t| t.get("items"))
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(parse_single_track).collect())
        .unwrap_or_default();

    let playlists = val
        .get("playlists")
        .map(parse_playlists_list)
        .unwrap_or_default();

    SearchResultDto { tracks, playlists }
}

/// Parses top tracks from `GET /v1/me/top/tracks`
pub fn parse_top_tracks(val: &Value) -> Vec<TrackDto> {
    val.get("items")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(parse_single_track).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_url_helpers() {
        assert_eq!(
            with_device_id(ENDPOINT_PLAY, Some("device_123")),
            "https://api.spotify.com/v1/me/player/play?device_id=device_123"
        );
        assert_eq!(
            with_device_id(ENDPOINT_PLAY, None),
            "https://api.spotify.com/v1/me/player/play"
        );
        assert_eq!(
            seek_url(45000, Some("dev_1")),
            "https://api.spotify.com/v1/me/player/seek?position_ms=45000&device_id=dev_1"
        );
        assert_eq!(
            volume_url(150, None),
            "https://api.spotify.com/v1/me/player/volume?volume_percent=100"
        );
    }

    #[test]
    fn test_parse_player_state_json() {
        let sample_json = json!({
            "is_playing": true,
            "progress_ms": 12345,
            "repeat_state": "track",
            "shuffle_state": true,
            "timestamp": 1699999999u64,
            "device": {
                "id": "dev_test",
                "name": "Living Room Speaker",
                "type": "Speaker",
                "is_active": true,
                "volume_percent": 85,
                "is_restricted": false
            },
            "item": {
                "id": "track_123",
                "uri": "spotify:track:track_123",
                "name": "Stairway to Heaven",
                "duration_ms": 482000,
                "artists": [{"name": "Led Zeppelin"}],
                "album": {
                    "name": "Led Zeppelin IV",
                    "images": [{"url": "https://i.scdn.co/image/ab67616d0000b273test"}]
                }
            }
        });

        let parsed = parse_player_state_json(&sample_json).expect("Expected valid state");
        assert!(parsed.is_playing);
        assert_eq!(parsed.progress_ms, 12345);
        assert_eq!(parsed.duration_ms, 482000);
        assert_eq!(parsed.repeat_mode, "track");
        assert!(parsed.shuffle_state);

        let track = parsed.track.expect("Expected track");
        assert_eq!(track.id, "track_123");
        assert_eq!(track.name, "Stairway to Heaven");
        assert_eq!(track.artists, vec!["Led Zeppelin"]);
        assert_eq!(track.album_name, "Led Zeppelin IV");
        assert_eq!(track.album_art_url, "https://i.scdn.co/image/ab67616d0000b273test");

        let device = parsed.device.expect("Expected device");
        assert_eq!(device.id, "dev_test");
        assert_eq!(device.name, "Living Room Speaker");
        assert_eq!(device.volume_percent, 85);
    }

    #[test]
    fn test_parse_devices_list() {
        let sample_json = json!({
            "devices": [
                {
                    "id": "phone_1",
                    "name": "Pixel 8",
                    "type": "Smartphone",
                    "is_active": true,
                    "volume_percent": 100,
                    "is_restricted": false
                },
                {
                    "id": "desktop_1",
                    "name": "Desk Companion Desktop",
                    "type": "Computer",
                    "is_active": false,
                    "volume_percent": 75,
                    "is_restricted": false
                }
            ]
        });

        let devices = parse_devices_list(&sample_json);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].name, "Pixel 8");
        assert!(devices[0].is_active);
        assert_eq!(devices[1].name, "Desk Companion Desktop");
        assert!(!devices[1].is_active);
    }
}
