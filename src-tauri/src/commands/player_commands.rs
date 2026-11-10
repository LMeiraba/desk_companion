use tauri::State;
use crate::error::AppError;
use crate::lyrics_domain::LyricsDto;
use crate::spotify_protocol::models::{DeviceDto, PlayerStateDto, PlaylistDto, SearchResultDto, TrackDto};
use crate::state::AppState;

#[tauri::command]
pub async fn set_sdk_active(
    active: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.sdk_active_tx.send_if_modified(|current| {
        if *current != active {
            *current = active;
            true
        } else {
            false
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn spotify_get_state(
    state: State<'_, AppState>,
) -> Result<Option<PlayerStateDto>, AppError> {
    state.client.get_player_state().await
}

#[tauri::command]
pub async fn spotify_play(
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.play(device_id.as_deref()).await
}

#[tauri::command]
pub async fn spotify_pause(
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.pause(device_id.as_deref()).await
}

#[tauri::command]
pub async fn spotify_toggle_play(
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.toggle_play(device_id.as_deref()).await
}

#[tauri::command]
pub async fn spotify_next(
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.next(device_id.as_deref()).await
}

#[tauri::command]
pub async fn spotify_previous(
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.previous(device_id.as_deref()).await
}

#[tauri::command]
pub async fn spotify_seek(
    position_ms: u32,
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.seek(position_ms, device_id.as_deref()).await
}

#[tauri::command]
pub async fn spotify_set_volume(
    volume_percent: u8,
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.set_volume(volume_percent, device_id.as_deref()).await
}

#[tauri::command]
pub async fn spotify_get_devices(
    state: State<'_, AppState>,
) -> Result<Vec<DeviceDto>, AppError> {
    state.client.get_devices().await
}

#[tauri::command]
pub async fn spotify_transfer_playback(
    device_id: String,
    play: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.transfer_playback(&device_id, play).await
}

#[tauri::command]
pub async fn spotify_play_uri(
    uri: String,
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.client.play_uri(&uri, device_id.as_deref()).await
}

#[tauri::command]
pub async fn spotify_get_playlists(
    state: State<'_, AppState>,
) -> Result<Vec<PlaylistDto>, AppError> {
    state.client.get_user_playlists().await
}

#[tauri::command]
pub async fn spotify_get_top_tracks(
    state: State<'_, AppState>,
) -> Result<Vec<TrackDto>, AppError> {
    state.client.get_top_tracks().await
}

#[tauri::command]
pub async fn spotify_search(
    query: String,
    state: State<'_, AppState>,
) -> Result<SearchResultDto, AppError> {
    state.client.search(&query).await
}

#[tauri::command]
pub async fn lyrics_get(
    track_name: String,
    artist_name: String,
    album_name: Option<String>,
    duration_ms: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Option<LyricsDto>, AppError> {
    state
        .lyrics
        .get_lyrics(&track_name, &artist_name, album_name.as_deref(), duration_ms)
        .await
}

#[tauri::command]
pub async fn set_mini_player_window(
    enabled: bool,
    window: tauri::Window,
) -> Result<(), AppError> {
    use tauri::{LogicalSize, Size};
    if enabled {
        let _ = window.set_always_on_top(true);
        let _ = window.set_size(Size::Logical(LogicalSize { width: 380.0, height: 185.0 }));
    } else {
        let _ = window.set_always_on_top(false);
        let _ = window.set_size(Size::Logical(LogicalSize { width: 1200.0, height: 800.0 }));
    }
    Ok(())
}
