use std::path::PathBuf;

#[cfg(target_os = "windows")]
unsafe extern "system" {
    fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
}

#[cfg(target_os = "windows")]
const VK_MEDIA_NEXT_TRACK: u8 = 0xB0;
#[cfg(target_os = "windows")]
const VK_MEDIA_PREV_TRACK: u8 = 0xB1;
#[cfg(target_os = "windows")]
const VK_MEDIA_PLAY_PAUSE: u8 = 0xB3;
#[cfg(target_os = "windows")]
const KEYEVENTF_EXTENDEDKEY: u32 = 0x0001;
#[cfg(target_os = "windows")]
const KEYEVENTF_KEYUP: u32 = 0x0002;

fn find_win_helper() -> PathBuf {
    if let Ok(mut exe) = std::env::current_exe() {
        exe.pop();
        let candidate = exe.join("win_helper.exe");
        if candidate.exists() {
            return candidate;
        }
    }
    let local = PathBuf::from("src-tauri/win_helper.exe");
    if local.exists() {
        return local;
    }
    PathBuf::from("win_helper.exe")
}

#[tauri::command]
pub async fn windows_set_volume(volume_percent: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let helper = find_win_helper();
        let vol_str = volume_percent.clamp(0, 100).to_string();
        tokio::task::spawn_blocking(move || {
            let _ = std::process::Command::new(helper)
                .args(["set-vol", &vol_str])
                .creation_flags(0x08000000)
                .output();
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn windows_get_volume() -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let helper = find_win_helper();
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new(helper)
                .arg("get-vol")
                .creation_flags(0x08000000)
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Ok(val) = text.parse::<u32>() {
            return Ok(val);
        }
    }
    Ok(50)
}

#[tauri::command]
pub async fn windows_toggle_mute() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let helper = find_win_helper();
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new(helper)
                .arg("toggle-mute")
                .creation_flags(0x08000000)
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Ok(val) = text.parse::<bool>() {
            return Ok(val);
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn windows_volume_up(steps: Option<u32>) -> Result<(), String> {
    let current = windows_get_volume().await.unwrap_or(50);
    let delta = steps.unwrap_or(4).clamp(1, 20);
    windows_set_volume((current + delta).min(100)).await
}

#[tauri::command]
pub async fn windows_volume_down(steps: Option<u32>) -> Result<(), String> {
    let current = windows_get_volume().await.unwrap_or(50);
    let delta = steps.unwrap_or(4).clamp(1, 20);
    windows_set_volume(current.saturating_sub(delta)).await
}

#[tauri::command]
pub fn windows_media_play_pause() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[tauri::command]
pub fn windows_media_next() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        keybd_event(VK_MEDIA_NEXT_TRACK, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_MEDIA_NEXT_TRACK, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[tauri::command]
pub fn windows_media_previous() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    unsafe {
        keybd_event(VK_MEDIA_PREV_TRACK, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(VK_MEDIA_PREV_TRACK, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[tauri::command]
pub async fn windows_set_brightness(brightness: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let helper = find_win_helper();
        let b_str = brightness.clamp(0, 100).to_string();
        tokio::task::spawn_blocking(move || {
            let _ = std::process::Command::new(helper)
                .args(["set-brightness", &b_str])
                .creation_flags(0x08000000)
                .output();
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn windows_get_brightness() -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let helper = find_win_helper();
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new(helper)
                .arg("get-brightness")
                .creation_flags(0x08000000)
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Ok(val) = text.parse::<u32>() {
            return Ok(val);
        }
    }
    Ok(100)
}

#[tauri::command]
pub async fn windows_send_notification(title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let clean_title = title.replace('\'', "''");
        let clean_body = body.replace('\'', "''");
        let script = format!(
            "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; \
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \
$texts = $template.GetElementsByTagName('text'); \
$texts.Item(0).AppendChild($template.CreateTextNode('{}')) | Out-Null; \
$texts.Item(1).AppendChild($template.CreateTextNode('{}')) | Out-Null; \
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\\WindowsPowerShell\\v1.0\\powershell.exe'); \
$toast = [Windows.UI.Notifications.ToastNotification]::new($template); \
$notifier.Show($toast)",
            clean_title, clean_body
        );

        tokio::task::spawn_blocking(move || {
            let _ = std::process::Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                .creation_flags(0x08000000)
                .output();
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn windows_set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_str = exe.to_string_lossy().to_string();

        tokio::task::spawn_blocking(move || {
            if enabled {
                let data = format!("\"{}\"", exe_str);
                let _ = std::process::Command::new("reg")
                    .args([
                        "add",
                        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                        "/v",
                        "DeskCompanion",
                        "/t",
                        "REG_SZ",
                        "/d",
                        &data,
                        "/f",
                    ])
                    .creation_flags(0x08000000)
                    .output();
            } else {
                let _ = std::process::Command::new("reg")
                    .args([
                        "delete",
                        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                        "/v",
                        "DeskCompanion",
                        "/f",
                    ])
                    .creation_flags(0x08000000)
                    .output();
            }
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn windows_get_current_media() -> Result<Option<crate::windows_media::WindowsMediaState>, String> {
    Ok(crate::windows_media::WindowsMediaTracker::global().get_current_media())
}

#[tauri::command]
pub async fn windows_get_autostart() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let output = tokio::task::spawn_blocking(|| {
            std::process::Command::new("reg")
                .args([
                    "query",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v",
                    "DeskCompanion",
                ])
                .creation_flags(0x08000000)
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

        return Ok(output.status.success());
    }
    #[allow(unreachable_code)]
    Ok(false)
}
