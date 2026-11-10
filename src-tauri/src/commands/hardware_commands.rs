use tauri::State;
use crate::error::AppError;
use crate::hardware_domain::models::{HardwareInputEvent, HardwareStatusDto};
use crate::hardware_domain::traits::HardwareBridge;
use crate::state::AppState;

#[tauri::command]
pub fn hardware_get_status(state: State<'_, AppState>) -> Result<HardwareStatusDto, AppError> {
    Ok(state.hardware_bridge.status())
}

#[tauri::command]
pub async fn hardware_simulate_input(
    event: HardwareInputEvent,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.hardware_bridge.dispatch_mock_input(event).await
}

#[tauri::command]
pub async fn resolve_hostname(hostname: String) -> Result<String, AppError> {
    use std::net::ToSocketAddrs;
    let target = hostname.trim();
    if target.is_empty() {
        return Ok("10.26.152.127".to_string());
    }
    let addr_str = if target.contains(':') {
        target.to_string()
    } else {
        format!("{target}:81")
    };
    if let Ok(mut addrs) = addr_str.to_socket_addrs() {
        if let Some(addr) = addrs.next() {
            let ip = addr.ip().to_string();
            println!("[mDNS] Resolved '{target}' -> '{ip}'");
            return Ok(ip);
        }
    }
    Ok(target.to_string())
}
