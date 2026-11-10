use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use windows::core::HSTRING;
use windows::Devices::WiFiDirect::{
    WiFiDirectAdvertisementPublisher, WiFiDirectAdvertisementPublisherStatus,
};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HotspotStatus {
    pub is_running: bool,
    pub ssid: String,
    pub password: String,
    pub message: String,
}

pub struct HotspotManager {
    publisher: Mutex<Option<WiFiDirectAdvertisementPublisher>>,
    current_ssid: Mutex<String>,
    current_pass: Mutex<String>,
}

impl HotspotManager {
    pub fn new() -> Self {
        Self {
            publisher: Mutex::new(None),
            current_ssid: Mutex::new("DeskCompanion-Host".to_string()),
            current_pass: Mutex::new("12345678".to_string()),
        }
    }

    pub fn start(&self, ssid: &str, password: &str) -> Result<HotspotStatus, String> {
        let mut pub_lock = self.publisher.lock().map_err(|e| e.to_string())?;

        // If already running, stop first
        if let Some(ref existing) = *pub_lock {
            let _ = existing.Stop();
        }

        let publisher = WiFiDirectAdvertisementPublisher::new()
            .map_err(|e| format!("Failed to create WiFiDirect publisher: {e}"))?;

        let advertisement = publisher
            .Advertisement()
            .map_err(|e| format!("Failed to get advertisement: {e}"))?;

        let legacy_settings = advertisement
            .LegacySettings()
            .map_err(|e| format!("Failed to get legacy settings: {e}"))?;

        legacy_settings
            .SetIsEnabled(true)
            .map_err(|e| format!("Failed to enable legacy mode: {e}"))?;

        legacy_settings
            .SetSsid(&HSTRING::from(ssid))
            .map_err(|e| format!("Failed to set SSID: {e}"))?;

        let passphrase = legacy_settings
            .Passphrase()
            .map_err(|e| format!("Failed to get passphrase object: {e}"))?;

        passphrase
            .SetPassword(&HSTRING::from(password))
            .map_err(|e| format!("Failed to set password: {e}"))?;

        publisher
            .Start()
            .map_err(|e| format!("Failed to start hotspot publisher: {e}"))?;

        let status = publisher.Status().unwrap_or(WiFiDirectAdvertisementPublisherStatus::Created);
        let is_running = status == WiFiDirectAdvertisementPublisherStatus::Started;

        *self.current_ssid.lock().unwrap() = ssid.to_string();
        *self.current_pass.lock().unwrap() = password.to_string();
        *pub_lock = Some(publisher);

        Ok(HotspotStatus {
            is_running,
            ssid: ssid.to_string(),
            password: password.to_string(),
            message: if is_running {
                "Hotspot started successfully on 2.4 GHz (Standalone Legacy AP)".to_string()
            } else {
                format!("Hotspot initialized with status: {:?}", status)
            },
        })
    }

    pub fn stop(&self) -> Result<HotspotStatus, String> {
        let mut pub_lock = self.publisher.lock().map_err(|e| e.to_string())?;
        if let Some(ref publisher) = *pub_lock {
            let _ = publisher.Stop();
        }
        *pub_lock = None;

        let ssid = self.current_ssid.lock().unwrap().clone();
        let pass = self.current_pass.lock().unwrap().clone();

        Ok(HotspotStatus {
            is_running: false,
            ssid,
            password: pass,
            message: "Hotspot stopped".to_string(),
        })
    }

    pub fn get_status(&self) -> HotspotStatus {
        let pub_lock = self.publisher.lock().unwrap();
        let is_running = if let Some(ref publisher) = *pub_lock {
            publisher
                .Status()
                .map(|s| s == WiFiDirectAdvertisementPublisherStatus::Started)
                .unwrap_or(false)
        } else {
            false
        };

        let ssid = self.current_ssid.lock().unwrap().clone();
        let pass = self.current_pass.lock().unwrap().clone();

        HotspotStatus {
            is_running,
            ssid,
            password: pass,
            message: if is_running {
                "Hotspot is broadcasting on 2.4 GHz".to_string()
            } else {
                "Hotspot is off".to_string()
            },
        }
    }
}
