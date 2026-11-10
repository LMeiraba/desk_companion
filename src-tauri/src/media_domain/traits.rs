use async_trait::async_trait;
use tokio::sync::broadcast;
use crate::error::AppError;
use super::models::{MediaAction, MediaEvent, UnifiedPlaybackState};

#[async_trait]
pub trait MediaSource: Send + Sync {
    /// Unique identifier for this media provider (e.g. "spotify", "gsmtc", "local")
    fn id(&self) -> &'static str;

    /// Human-friendly display name
    fn display_name(&self) -> &'static str;

    /// Fetches the latest snapshot of playback state
    async fn get_state(&self) -> Result<Option<UnifiedPlaybackState>, AppError>;

    /// Executes a media control action
    async fn execute_action(&self, action: MediaAction) -> Result<(), AppError>;

    /// Indicates whether this source is currently usable/connected
    async fn is_available(&self) -> bool;
}

#[async_trait]
pub trait MediaRouter: Send + Sync {
    /// Registers an additional media source
    fn register_source(&mut self, source: Box<dyn MediaSource>);

    /// Switches the active media source
    async fn set_active_source(&self, source_id: &str) -> Result<(), AppError>;

    /// Returns the currently active source ID
    fn active_source_id(&self) -> String;

    /// Dispatches an action to the currently active media source
    async fn dispatch_action(&self, action: MediaAction) -> Result<(), AppError>;

    /// Subscribes to unified media events across sources
    fn subscribe_events(&self) -> broadcast::Receiver<MediaEvent>;
}
