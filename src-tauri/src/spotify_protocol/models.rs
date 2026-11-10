use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrackDto {
    pub id: String,
    pub uri: String,
    pub name: String,
    pub artists: Vec<String>,
    pub album_name: String,
    pub album_art_url: String,
    pub duration_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub id: String,
    pub name: String,
    pub device_type: String,
    pub is_active: bool,
    pub volume_percent: u8,
    pub is_restricted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStateDto {
    pub is_playing: bool,
    pub progress_ms: u32,
    pub duration_ms: u32,
    pub track: Option<TrackDto>,
    pub device: Option<DeviceDto>,
    pub repeat_mode: String,
    pub shuffle_state: bool,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenBundleDto {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    pub expires_at: u64,
    pub token_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionDto {
    pub is_authenticated: bool,
    pub client_id: String,
    pub expires_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub image_url: String,
    pub track_count: u32,
    pub uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultDto {
    pub tracks: Vec<TrackDto>,
    pub playlists: Vec<PlaylistDto>,
}
