use crate::media_domain::models::UnifiedPlaybackState;
use super::models::{DisplayPayload, SystemNotification};
use super::traits::DisplayPayloadFormatter;

pub struct DefaultDisplayFormatter;

impl DefaultDisplayFormatter {
    pub fn new() -> Self {
        Self
    }
}

impl DisplayPayloadFormatter for DefaultDisplayFormatter {
    fn format_now_playing(&self, state: &UnifiedPlaybackState) -> DisplayPayload {
        let (title, artist, album) = match &state.track {
            Some(t) => (
                t.name.clone(),
                t.artists.join(", "),
                t.album_name.clone(),
            ),
            None => ("No Track Playing".to_string(), "Idle".to_string(), String::new()),
        };

        DisplayPayload {
            screen_mode: "NowPlaying".to_string(),
            title,
            artist,
            album,
            progress_ms: state.progress_ms,
            duration_ms: state.duration_ms,
            is_playing: state.is_playing,
            volume_percent: state.volume_percent,
            notification_toast: None,
        }
    }

    fn format_notification(&self, notif: &SystemNotification, state: Option<&UnifiedPlaybackState>) -> DisplayPayload {
        let mut payload = match state {
            Some(s) => self.format_now_playing(s),
            None => DisplayPayload::default(),
        };
        payload.screen_mode = "NotificationToast".to_string();
        payload.notification_toast = Some(format!("{}: {}", notif.title, notif.message));
        payload
    }
}
