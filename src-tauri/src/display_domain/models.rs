use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TftScreenMode {
    NowPlaying,
    NotificationToast,
    DeviceStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemNotification {
    pub id: String,
    pub app_name: String,
    pub title: String,
    pub message: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DisplayPayload {
    pub screen_mode: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub progress_ms: u32,
    pub duration_ms: u32,
    pub is_playing: bool,
    pub volume_percent: u8,
    pub notification_toast: Option<String>,
}
