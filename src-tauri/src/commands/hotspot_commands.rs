use tauri::State;
use crate::hotspot::HotspotStatus;
use crate::state::AppState;

#[tauri::command]
pub async fn hotspot_start(
    ssid: Option<String>,
    password: Option<String>,
    state: State<'_, AppState>,
) -> Result<HotspotStatus, String> {
    let ssid = ssid.unwrap_or_else(|| "DeskCompanion-Host".to_string());
    let password = password.unwrap_or_else(|| "12345678".to_string());

    if password.len() < 8 {
        return Err("Password must be at least 8 characters long".to_string());
    }

    state.hotspot.start(&ssid, &password)
}

#[tauri::command]
pub async fn hotspot_stop(
    state: State<'_, AppState>,
) -> Result<HotspotStatus, String> {
    state.hotspot.stop()
}

#[tauri::command]
pub async fn hotspot_get_status(
    state: State<'_, AppState>,
) -> Result<HotspotStatus, String> {
    Ok(state.hotspot.get_status())
}
