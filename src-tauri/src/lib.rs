pub mod commands;
pub mod display_domain;
pub mod error;
pub mod hardware_domain;
pub mod hotspot;
pub mod lyrics_domain;
pub mod media_domain;
pub mod spotify_domain;
pub mod spotify_protocol;
pub mod state;
pub mod windows_media;

use commands::*;
use state::AppState;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (app_state, poller) = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(move |app| {
            let handle = app.handle().clone();
            poller.start(handle);

            // System Tray Menu Setup
            let show_i = MenuItemBuilder::with_id("show", "Show Desk Companion").build(app)?;
            let play_i = MenuItemBuilder::with_id("play_pause", "Play / Pause").build(app)?;
            let next_i = MenuItemBuilder::with_id("next", "Next Track").build(app)?;
            let prev_i = MenuItemBuilder::with_id("prev", "Previous Track").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Quit Desk Companion").build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .items(&[&show_i, &play_i, &next_i, &prev_i, &quit_i])
                .build()?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("Desk Companion");

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "play_pause" => {
                        let _ = windows_media_play_pause();
                    }
                    "next" => {
                        let _ = windows_media_next();
                    }
                    "prev" => {
                        let _ = windows_media_previous();
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to tray on close
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            spotify_login,
            spotify_logout,
            spotify_get_tokens,
            spotify_get_session,
            spotify_refresh_token,
            // Player & Adaptive Sync commands
            set_sdk_active,
            spotify_get_state,
            spotify_play,
            spotify_pause,
            spotify_toggle_play,
            spotify_next,
            spotify_previous,
            spotify_seek,
            spotify_set_volume,
            spotify_get_devices,
            spotify_transfer_playback,
            spotify_play_uri,
            spotify_get_playlists,
            spotify_get_top_tracks,
            spotify_search,
            lyrics_get,
            set_mini_player_window,
            // Generic Media commands
            media_dispatch_action,
            media_set_source,
            media_get_state,
            // Hardware commands
            hardware_get_status,
            hardware_simulate_input,
            resolve_hostname,
            // Native Windows commands
            windows_set_volume,
            windows_get_volume,
            windows_volume_up,
            windows_volume_down,
            windows_toggle_mute,
            windows_media_play_pause,
            windows_media_next,
            windows_media_previous,
            windows_set_brightness,
            windows_get_brightness,
            windows_send_notification,
            windows_set_autostart,
            windows_get_autostart,
            windows_get_current_media,
            // Native Hotspot commands (Wi-Fi Direct Legacy AP on 2.4GHz)
            hotspot_start,
            hotspot_stop,
            hotspot_get_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
