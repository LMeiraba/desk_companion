use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use async_trait::async_trait;
use tokio::sync::broadcast;
use crate::error::AppError;
use super::models::{MediaAction, MediaEvent};
use super::traits::{MediaRouter, MediaSource};

pub struct DefaultMediaRouter {
    sources: Arc<RwLock<HashMap<String, Arc<dyn MediaSource>>>>,
    active_source: Arc<RwLock<String>>,
    event_tx: broadcast::Sender<MediaEvent>,
}

impl DefaultMediaRouter {
    pub fn new(default_source_id: &str) -> Self {
        let (event_tx, _) = broadcast::channel(128);
        Self {
            sources: Arc::new(RwLock::new(HashMap::new())),
            active_source: Arc::new(RwLock::new(default_source_id.to_string())),
            event_tx,
        }
    }

    pub fn add_source(&self, source: Arc<dyn MediaSource>) {
        if let Ok(mut map) = self.sources.write() {
            map.insert(source.id().to_string(), source);
        }
    }

    pub fn emit_event(&self, event: MediaEvent) {
        let _ = self.event_tx.send(event);
    }
}

#[async_trait]
impl MediaRouter for DefaultMediaRouter {
    fn register_source(&mut self, _source: Box<dyn MediaSource>) {}

    async fn set_active_source(&self, source_id: &str) -> Result<(), AppError> {
        let exists = {
            let map = self.sources.read().map_err(|e| AppError::MediaSource(e.to_string()))?;
            map.contains_key(source_id)
        };
        if !exists {
            return Err(AppError::MediaSource(format!("Source '{source_id}' not found")));
        }
        {
            let mut active = self.active_source.write().map_err(|e| AppError::MediaSource(e.to_string()))?;
            *active = source_id.to_string();
        }
        let _ = self.event_tx.send(MediaEvent::SourceChanged(source_id.to_string()));
        Ok(())
    }

    fn active_source_id(&self) -> String {
        self.active_source
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_else(|_| "spotify".to_string())
    }

    async fn dispatch_action(&self, action: MediaAction) -> Result<(), AppError> {
        let (active_id, source) = {
            let active = self.active_source.read().map_err(|e| AppError::MediaSource(e.to_string()))?.clone();
            let map = self.sources.read().map_err(|e| AppError::MediaSource(e.to_string()))?;
            let s = map.get(&active).cloned();
            (active, s)
        };

        if let Some(source) = source {
            source.execute_action(action).await
        } else {
            Err(AppError::MediaSource(format!("Active source '{active_id}' is not registered")))
        }
    }

    fn subscribe_events(&self) -> broadcast::Receiver<MediaEvent> {
        self.event_tx.subscribe()
    }
}
