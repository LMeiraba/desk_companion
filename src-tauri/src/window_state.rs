use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, Window};

static PREV_NORMAL_STATE: Mutex<Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_maximized: bool,
}

fn get_state_file_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = fs::create_dir_all(&dir);
        Some(dir.join("window_state.json"))
    } else {
        None
    }
}

pub fn save_window_state(window: &Window) {
    // Never overwrite saved state while in mini player mode
    if let Ok(is_top) = window.is_always_on_top() {
        if is_top {
            return;
        }
    }

    if let (Ok(is_min), Ok(is_vis)) = (window.is_minimized(), window.is_visible()) {
        if is_min || !is_vis {
            return;
        }
    }

    let is_maximized = window.is_maximized().unwrap_or(false);
    let app = window.app_handle();
    let file_path = match get_state_file_path(app) {
        Some(p) => p,
        None => return,
    };

    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
        if size.width >= 400 && size.height >= 300 {
            let state = WindowState {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                is_maximized,
            };

            if let Ok(json) = serde_json::to_string_pretty(&state) {
                let _ = fs::write(file_path, json);
            }
        }
    }
}

pub fn restore_window_state(window: &Window) {
    let app = window.app_handle();
    let file_path = match get_state_file_path(app) {
        Some(p) => p,
        None => return,
    };

    if let Ok(data) = fs::read_to_string(file_path) {
        if let Ok(state) = serde_json::from_str::<WindowState>(&data) {
            if state.width >= 400 && state.height >= 300 {
                let _ = window.set_size(Size::Physical(PhysicalSize {
                    width: state.width,
                    height: state.height,
                }));

                // Avoid positioning off-screen
                if state.y >= -100 && state.x >= -3000 && state.x <= 8000 {
                    let _ = window.set_position(Position::Physical(PhysicalPosition {
                        x: state.x,
                        y: state.y,
                    }));
                }

                if state.is_maximized {
                    let _ = window.maximize();
                }
            }
        }
    }
}

pub fn stash_pre_mini_player_state(window: &Window) {
    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
        if size.width >= 400 && size.height >= 300 {
            if let Ok(mut lock) = PREV_NORMAL_STATE.lock() {
                *lock = Some((pos, size));
            }
        }
    }
}

pub fn restore_pre_mini_player_state(window: &Window) -> bool {
    if let Ok(mut lock) = PREV_NORMAL_STATE.lock() {
        if let Some((pos, size)) = lock.take() {
            let _ = window.set_size(Size::Physical(size));
            let _ = window.set_position(Position::Physical(pos));
            return true;
        }
    }
    false
}
