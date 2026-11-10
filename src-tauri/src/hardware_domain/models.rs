use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum HardwareInputEvent {
    RotaryTurn { encoder_id: u8, delta: i32 },
    ButtonPress { button_id: u8, press_type: ButtonPressType },
    Telemetry { battery_pct: Option<u8>, rssi: i32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ButtonPressType {
    ShortClick,
    LongPress,
    DoubleClick,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HardwareStatusDto {
    pub is_connected: bool,
    pub ip_address: Option<String>,
    pub transport: String,
}
