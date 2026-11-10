use async_trait::async_trait;
use tokio::sync::mpsc;
use crate::error::AppError;
use super::models::{HardwareInputEvent, HardwareStatusDto};

#[async_trait]
pub trait HardwareBridge: Send + Sync {
    async fn start(&self) -> Result<(), AppError>;
    async fn stop(&self) -> Result<(), AppError>;
    fn register_input_channel(&self, tx: mpsc::Sender<HardwareInputEvent>);
    fn status(&self) -> HardwareStatusDto;
}
