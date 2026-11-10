use serde::{Deserialize, Serialize};
use crate::spotify_protocol::models::{DeviceDto, TrackDto};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", content = "payload")]
pub enum MediaAction {
    Play { device_id: Option<String> },
    Pause { device_id: Option<String> },
    TogglePlayPause { device_id: Option<String> },
    NextTrack { device_id: Option<String> },
    PreviousTrack { device_id: Option<String> },
    Seek { position_ms: u32, device_id: Option<String> },
    SetVolume { volume_percent: u8, device_id: Option<String> },
    StepVolume { delta: i32, device_id: Option<String> },
    TransferDevice { device_id: String, play: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedPlaybackState {
    pub source_id: String,
    pub is_playing: bool,
    pub progress_ms: u32,
    pub duration_ms: u32,
    pub track: Option<TrackDto>,
    pub device: Option<DeviceDto>,
    pub volume_percent: u8,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum MediaEvent {
    StateChanged(UnifiedPlaybackState),
    SourceChanged(String),
}
