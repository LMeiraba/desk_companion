use tauri::State;
use crate::error::AppError;
use crate::media_domain::models::{MediaAction, UnifiedPlaybackState};
use crate::media_domain::traits::MediaRouter;
use crate::state::AppState;

#[tauri::command]
pub async fn media_dispatch_action(
    action: MediaAction,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.media_router.dispatch_action(action).await
}

#[tauri::command]
pub async fn media_set_source(
    source_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.media_router.set_active_source(&source_id).await
}

#[tauri::command]
pub async fn media_get_state(
    state: State<'_, AppState>,
) -> Result<Option<UnifiedPlaybackState>, AppError> {
    let source_id = state.media_router.active_source_id();
    if source_id == "spotify" {
        let player_state = state.client.get_player_state().await?;
        Ok(player_state.map(|s| UnifiedPlaybackState {
            source_id: "spotify".to_string(),
            is_playing: s.is_playing,
            progress_ms: s.progress_ms,
            duration_ms: s.duration_ms,
            track: s.track,
            device: s.device,
            volume_percent: 100,
            timestamp: s.timestamp,
        }))
    } else {
        Ok(None)
    }
}
