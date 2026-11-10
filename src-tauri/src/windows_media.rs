use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};
use base64::Engine;
use gsmtc::{ManagerEvent, PlaybackStatus, SessionUpdateEvent};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowsMediaState {
    pub source: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub is_playing: bool,
    pub album_art_url: Option<String>,
    pub progress_ms: u64,
    pub duration_ms: u64,
    pub timestamp: u64,
}

pub struct WindowsMediaTracker {
    current_media: Arc<RwLock<Option<WindowsMediaState>>>,
    sessions: Arc<RwLock<HashMap<usize, (String, WindowsMediaState)>>>,
}

static TRACKER: OnceLock<WindowsMediaTracker> = OnceLock::new();

impl WindowsMediaTracker {
    pub fn global() -> &'static WindowsMediaTracker {
        TRACKER.get_or_init(|| {
            let tracker = WindowsMediaTracker {
                current_media: Arc::new(RwLock::new(None)),
                sessions: Arc::new(RwLock::new(HashMap::new())),
            };
            tracker.start_worker();
            tracker
        })
    }

    pub fn get_current_media(&self) -> Option<WindowsMediaState> {
        self.current_media.read().ok().and_then(|g| g.clone())
    }

    fn start_worker(&self) {
        let current_media = self.current_media.clone();
        let sessions = self.sessions.clone();

        tokio::spawn(async move {
            let manager_res = gsmtc::SessionManager::create().await;
            let mut rx = match manager_res {
                Ok(receiver) => receiver,
                Err(err) => {
                    eprintln!("[GSMTC] Failed to create SessionManager: {err}");
                    return;
                }
            };

            println!("[GSMTC] Started Windows Media Session listener");

            while let Some(event) = rx.recv().await {
                match event {
                    ManagerEvent::SessionCreated { session_id, mut rx, source } => {
                        let clean_source = source
                            .split('\\')
                            .last()
                            .unwrap_or(&source)
                            .trim_end_matches(".exe")
                            .to_string();

                        let sessions_clone = sessions.clone();
                        let current_clone = current_media.clone();
                        let src_for_task = clean_source.clone();

                        tokio::spawn(async move {
                            while let Some(update) = rx.recv().await {
                                match update {
                                    SessionUpdateEvent::Model(model) => {
                                        let is_playing = model.playback
                                            .as_ref()
                                            .map(|p| matches!(p.status, PlaybackStatus::Playing))
                                            .unwrap_or(false);

                                        let (title, artist, album) = if let Some(ref m) = model.media {
                                            (
                                                m.title.clone(),
                                                m.artist.clone(),
                                                m.album.as_ref().map(|a| a.title.clone()).unwrap_or_default(),
                                            )
                                        } else {
                                            (String::new(), String::new(), String::new())
                                        };

                                        let (progress_ms, duration_ms) = if let Some(ref t) = model.timeline {
                                            let dur = if t.end > t.start {
                                                ((t.end - t.start) / 10_000).max(0) as u64
                                            } else {
                                                0
                                            };
                                            let pos = if t.position > t.start {
                                                ((t.position - t.start) / 10_000).max(0) as u64
                                            } else {
                                                0
                                            };
                                            (pos, dur)
                                        } else {
                                            (0, 0)
                                        };

                                        if let Ok(mut map) = sessions_clone.write() {
                                            let entry = map.entry(session_id).or_insert_with(|| {
                                                (src_for_task.clone(), WindowsMediaState {
                                                    source: src_for_task.clone(),
                                                    ..Default::default()
                                                })
                                            });
                                            if !title.is_empty() {
                                                entry.1.title = title;
                                                entry.1.artist = artist;
                                                entry.1.album = album;
                                            }
                                            entry.1.is_playing = is_playing;
                                            if duration_ms > 0 {
                                                entry.1.duration_ms = duration_ms;
                                                entry.1.progress_ms = progress_ms;
                                            }
                                            entry.1.timestamp = std::time::SystemTime::now()
                                                .duration_since(std::time::UNIX_EPOCH)
                                                .map(|d| d.as_millis() as u64)
                                                .unwrap_or(0);
                                        }

                                        // Update active candidate
                                        if let Ok(map) = sessions_clone.read() {
                                            let mut best: Option<WindowsMediaState> = None;
                                            for (_id, (_src, st)) in map.iter() {
                                                if st.is_playing && !st.title.is_empty() {
                                                    best = Some(st.clone());
                                                    break;
                                                }
                                            }
                                            if best.is_none() {
                                                for (_id, (_src, st)) in map.iter() {
                                                    if !st.title.is_empty() {
                                                        best = Some(st.clone());
                                                        break;
                                                    }
                                                }
                                            }
                                            if let Ok(mut cur) = current_clone.write() {
                                                *cur = best;
                                            }
                                        }
                                    }
                                    SessionUpdateEvent::Media(model, image) => {
                                        let (title, artist, album) = if let Some(ref m) = model.media {
                                            (
                                                m.title.clone(),
                                                m.artist.clone(),
                                                m.album.as_ref().map(|a| a.title.clone()).unwrap_or_default(),
                                            )
                                        } else {
                                            (String::new(), String::new(), String::new())
                                        };

                                        let art_url = image.map(|img| {
                                            let b64 = base64::engine::general_purpose::STANDARD.encode(&img.data);
                                            format!("data:{};base64,{}", img.content_type, b64)
                                        });

                                        if let Ok(mut map) = sessions_clone.write() {
                                            let entry = map.entry(session_id).or_insert_with(|| {
                                                (src_for_task.clone(), WindowsMediaState {
                                                    source: src_for_task.clone(),
                                                    ..Default::default()
                                                })
                                            });
                                            if !title.is_empty() {
                                                entry.1.title = title;
                                                entry.1.artist = artist;
                                                entry.1.album = album;
                                            }
                                            if art_url.is_some() {
                                                entry.1.album_art_url = art_url;
                                            }
                                            if let Some(ref t) = model.timeline {
                                                let dur = if t.end > t.start {
                                                    ((t.end - t.start) / 10_000).max(0) as u64
                                                } else {
                                                    0
                                                };
                                                let pos = if t.position > t.start {
                                                    ((t.position - t.start) / 10_000).max(0) as u64
                                                } else {
                                                    0
                                                };
                                                if dur > 0 {
                                                    entry.1.duration_ms = dur;
                                                    entry.1.progress_ms = pos;
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Clean up removed inner session
                            if let Ok(mut map) = sessions_clone.write() {
                                map.remove(&session_id);
                            }
                        });
                    }
                    ManagerEvent::SessionRemoved { session_id } => {
                        if let Ok(mut map) = sessions.write() {
                            map.remove(&session_id);
                        }
                        if let Ok(map) = sessions.read() {
                            let mut best: Option<WindowsMediaState> = None;
                            for (_id, (_src, st)) in map.iter() {
                                if st.is_playing && !st.title.is_empty() {
                                    best = Some(st.clone());
                                    break;
                                }
                            }
                            if let Ok(mut cur) = current_media.write() {
                                *cur = best;
                            }
                        }
                    }
                    ManagerEvent::CurrentSessionChanged { .. } => {}
                }
            }
        });
    }
}
