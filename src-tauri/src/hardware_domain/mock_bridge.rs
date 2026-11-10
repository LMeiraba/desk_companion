use async_trait::async_trait;
use tokio::sync::{mpsc, RwLock};
use std::sync::Arc;
use crate::error::AppError;
use super::models::{HardwareInputEvent, HardwareStatusDto};
use super::traits::HardwareBridge;

pub struct MockHardwareBridge {
    input_tx: Arc<RwLock<Option<mpsc::Sender<HardwareInputEvent>>>>,
}

impl MockHardwareBridge {
    pub fn new() -> Self {
        Self {
            input_tx: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn dispatch_mock_input(&self, event: HardwareInputEvent) -> Result<(), AppError> {
        let guard = self.input_tx.read().await;
        if let Some(tx) = &*guard {
            tx.send(event)
                .await
                .map_err(|e| AppError::Hardware(format!("Failed to dispatch mock input: {e}")))?;
            Ok(())
        } else {
            Err(AppError::Hardware("No input channel registered".into()))
        }
    }
}

#[async_trait]
impl HardwareBridge for MockHardwareBridge {
    async fn start(&self) -> Result<(), AppError> {
        println!("[MockHardwareBridge] Started hardware placeholder bridge.");
        Ok(())
    }

    async fn stop(&self) -> Result<(), AppError> {
        Ok(())
    }

    fn register_input_channel(&self, tx: mpsc::Sender<HardwareInputEvent>) {
        if let Ok(mut guard) = self.input_tx.try_write() {
            *guard = Some(tx);
        }
    }

    fn status(&self) -> HardwareStatusDto {
        HardwareStatusDto {
            is_connected: false,
            ip_address: None,
            transport: "Mock/Placeholder".to_string(),
        }
    }
}
