use tauri::State;
use crate::error::AppError;
use crate::spotify_protocol::models::{AuthSessionDto, TokenBundleDto};
use crate::state::AppState;

#[tauri::command]
pub async fn spotify_login(
    client_id: String,
    state: State<'_, AppState>,
) -> Result<TokenBundleDto, AppError> {
    state.auth.start_pkce_login(&client_id).await
}

#[tauri::command]
pub async fn spotify_logout(state: State<'_, AppState>) -> Result<(), AppError> {
    state.auth.logout().await;
    Ok(())
}

#[tauri::command]
pub async fn spotify_get_tokens(
    state: State<'_, AppState>,
) -> Result<Option<TokenBundleDto>, AppError> {
    Ok(state.auth.get_tokens().await)
}

#[tauri::command]
pub async fn spotify_get_session(
    state: State<'_, AppState>,
) -> Result<AuthSessionDto, AppError> {
    Ok(state.auth.get_auth_session().await)
}

#[tauri::command]
pub async fn spotify_refresh_token(
    state: State<'_, AppState>,
) -> Result<TokenBundleDto, AppError> {
    state.auth.refresh_access_token().await
}
