use std::sync::Arc;
use std::time::Duration;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;
use tokio::time::sleep;

use super::client::SpotifyRemoteClient;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollingStatusEvent {
    pub is_polling: bool,
    pub is_sdk_active: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatusEvent {
    pub is_online: bool,
    pub consecutive_errors: u32,
    pub retry_after_secs: u64,
}

pub struct SpotifyPoller {
    client: Arc<SpotifyRemoteClient>,
    sdk_active_rx: watch::Receiver<bool>,
}

impl SpotifyPoller {
    pub fn new(client: Arc<SpotifyRemoteClient>, sdk_active_rx: watch::Receiver<bool>) -> Self {
        Self {
            client,
            sdk_active_rx,
        }
    }

    /// Spawns the background adaptive polling task
    pub fn start(&self, app_handle: AppHandle) {
        let client = self.client.clone();
        let mut sdk_active_rx = self.sdk_active_rx.clone();

        tauri::async_runtime::spawn(async move {
            println!("[AdaptivePoller] Started background polling loop (2s playing / 6s idle).");

            let mut is_playing = false;
            let mut backoff_secs = 0u64;
            let mut consecutive_network_errors = 0u32;
            let mut is_network_online = true;
            // Track last emitted polling-status so we only emit on actual changes,
            // not on every loop iteration / 4-second heartbeat tick.
            let mut last_emitted_sdk_active: Option<bool> = None;

            loop {
                let is_sdk_active = *sdk_active_rx.borrow();

                if is_sdk_active {
                    // Local Web Playback SDK is active!
                    // Completely halt remote polling to avoid rate-limiting and redundant traffic.
                    // Only emit when state actually changed to avoid flooding the frontend.
                    if last_emitted_sdk_active != Some(true) {
                        last_emitted_sdk_active = Some(true);
                        let _ = app_handle.emit(
                            "spotify://polling-status",
                            PollingStatusEvent {
                                is_polling: false,
                                is_sdk_active: true,
                            },
                        );
                    }

                    // Block until sdk_active flips — no busy-loop, no periodic wakeup spam.
                    let _ = sdk_active_rx.changed().await;
                } else {
                    // Remote Mode: Emit polling status only on transition from SDK mode.
                    if last_emitted_sdk_active != Some(false) {
                        last_emitted_sdk_active = Some(false);
                        let _ = app_handle.emit(
                            "spotify://polling-status",
                            PollingStatusEvent {
                                is_polling: true,
                                is_sdk_active: false,
                            },
                        );
                    }

                    // Only attempt fetch if user is authenticated
                    let session = client.auth().get_auth_session().await;
                    if session.is_authenticated {
                        match client.get_player_state().await {
                            Ok(Some(state)) => {
                                is_playing = state.is_playing;
                                backoff_secs = 0;

                                if !is_network_online {
                                    is_network_online = true;
                                    consecutive_network_errors = 0;
                                    println!("[AdaptivePoller] Network connection restored! Resuming normal polling.");
                                    let _ = app_handle.emit(
                                        "spotify://network-status",
                                        NetworkStatusEvent {
                                            is_online: true,
                                            consecutive_errors: 0,
                                            retry_after_secs: 0,
                                        },
                                    );
                                }

                                let _ = app_handle.emit("spotify://state-changed", state);
                            }
                            Ok(None) => {
                                // 204 No Content (no active playback)
                                is_playing = false;
                                backoff_secs = 0;

                                if !is_network_online {
                                    is_network_online = true;
                                    consecutive_network_errors = 0;
                                    println!("[AdaptivePoller] Network connection restored! Resuming normal polling.");
                                    let _ = app_handle.emit(
                                        "spotify://network-status",
                                        NetworkStatusEvent {
                                            is_online: true,
                                            consecutive_errors: 0,
                                            retry_after_secs: 0,
                                        },
                                    );
                                }
                            }
                            Err(err) => {
                                let err_str = err.to_string();
                                if err_str.contains("429") {
                                    eprintln!("[AdaptivePoller] Rate limited (429)! Backing off for 12s.");
                                    backoff_secs = 12;
                                } else {
                                    // Network outage / unreachable host / connection reset
                                    consecutive_network_errors = consecutive_network_errors.saturating_add(1);

                                    // Graceful exponential backoff: 4s -> 8s -> 16s -> max 30s
                                    backoff_secs = match consecutive_network_errors {
                                        1 => 4,
                                        2 => 8,
                                        3 => 16,
                                        _ => 30,
                                    };

                                    if is_network_online {
                                        is_network_online = false;
                                        eprintln!(
                                            "[AdaptivePoller] Network outage detected ({err_str}). Entering graceful backoff (next retry in {backoff_secs}s)."
                                        );
                                        let _ = app_handle.emit(
                                            "spotify://network-status",
                                            NetworkStatusEvent {
                                                is_online: false,
                                                consecutive_errors: consecutive_network_errors,
                                                retry_after_secs: backoff_secs,
                                            },
                                        );
                                    } else if consecutive_network_errors % 5 == 0 {
                                        eprintln!(
                                            "[AdaptivePoller] Network still unreachable (attempt {consecutive_network_errors}). Retrying in {backoff_secs}s..."
                                        );
                                    }
                                }
                            }
                        }
                    }

                    // Dynamically sleep: 2.0s when playing, 6.0s when paused/idle, dynamic backoff on outage/429
                    let sleep_duration = if backoff_secs > 0 {
                        Duration::from_secs(backoff_secs)
                    } else if is_playing {
                        Duration::from_millis(2000)
                    } else {
                        Duration::from_millis(6000)
                    };

                    tokio::select! {
                        _ = sleep(sleep_duration) => {}
                        _ = sdk_active_rx.changed() => {}
                    }
                }
            }
        });
    }
}
