use std::sync::Arc;
use async_trait::async_trait;

use crate::error::AppError;
use crate::media_domain::models::{MediaAction, UnifiedPlaybackState};
use crate::media_domain::traits::MediaSource;
use super::client::SpotifyRemoteClient;

pub struct SpotifySource {
    client: Arc<SpotifyRemoteClient>,
}

impl SpotifySource {
    pub fn new(client: Arc<SpotifyRemoteClient>) -> Self {
        Self { client }
    }
}

#[async_trait]
impl MediaSource for SpotifySource {
    fn id(&self) -> &'static str {
        "spotify"
    }

    fn display_name(&self) -> &'static str {
        "Spotify"
    }

    async fn get_state(&self) -> Result<Option<UnifiedPlaybackState>, AppError> {
        let state = self.client.get_player_state().await?;
        Ok(state.map(|s| UnifiedPlaybackState {
            source_id: "spotify".to_string(),
            is_playing: s.is_playing,
            progress_ms: s.progress_ms,
            duration_ms: s.duration_ms,
            track: s.track,
            device: s.device,
            volume_percent: 100,
            timestamp: s.timestamp,
        }))
    }

    async fn execute_action(&self, action: MediaAction) -> Result<(), AppError> {
        match action {
            MediaAction::Play { device_id } => {
                self.client.play(device_id.as_deref()).await
            }
            MediaAction::Pause { device_id } => {
                self.client.pause(device_id.as_deref()).await
            }
            MediaAction::TogglePlayPause { device_id } => {
                self.client.toggle_play(device_id.as_deref()).await
            }
            MediaAction::NextTrack { device_id } => {
                self.client.next(device_id.as_deref()).await
            }
            MediaAction::PreviousTrack { device_id } => {
                self.client.previous(device_id.as_deref()).await
            }
            MediaAction::Seek { position_ms, device_id } => {
                self.client.seek(position_ms, device_id.as_deref()).await
            }
            MediaAction::SetVolume { volume_percent, device_id } => {
                self.client.set_volume(volume_percent, device_id.as_deref()).await
            }
            MediaAction::StepVolume { delta, device_id } => {
                let current_state = self.client.get_player_state().await?;
                let current_vol = current_state
                    .and_then(|s| s.device)
                    .map(|d| d.volume_percent)
                    .unwrap_or(50) as i32;
                let new_vol = (current_vol + delta).clamp(0, 100) as u8;
                self.client.set_volume(new_vol, device_id.as_deref()).await
            }
            MediaAction::TransferDevice { device_id, play } => {
                self.client.transfer_playback(&device_id, play).await
            }
        }
    }

    async fn is_available(&self) -> bool {
        self.client.auth().get_auth_session().await.is_authenticated
    }
}
