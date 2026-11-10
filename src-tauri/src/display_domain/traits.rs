use async_trait::async_trait;
use tokio::sync::mpsc;
use crate::error::AppError;
use crate::media_domain::models::UnifiedPlaybackState;
use super::models::{DisplayPayload, SystemNotification};

pub trait DisplayPayloadFormatter: Send + Sync {
    fn format_now_playing(&self, state: &UnifiedPlaybackState) -> DisplayPayload;
    fn format_notification(&self, notif: &SystemNotification, state: Option<&UnifiedPlaybackState>) -> DisplayPayload;
}

#[async_trait]
pub trait NotificationListener: Send + Sync {
    async fn start_listening(&self, tx: mpsc::Sender<SystemNotification>) -> Result<(), AppError>;
}
