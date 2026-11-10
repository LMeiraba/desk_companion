# Desk Companion Firmware (PlatformIO)

Native PlatformIO project for the ESP32-C3 SuperMini media controller deck.

## Project Structure

```text
firmware/
├── platformio.ini         # Multi-environment PlatformIO config
├── include/
│   └── User_Setup.h       # TFT_eSPI 3-wire hardware driver configuration
├── src/
│   ├── tft_tester.cpp     # 2.8" SPI TFT 3-wire display test
│   └── pcf8574_tester.cpp # PCF8574T I2C expander pin-touch test
└── WIRING_DIAGRAM.md      # Pinouts and touch-test reference
```

---

## 1. TFT 3-Wire Display Test

### Hardware Wiring:
* **SCL (SCK):** `GPIO 4`
* **SDA (MOSI):** `GPIO 6`
* **DC (Command/Data):** `GPIO 7`
* **CS:** Hardwired to `GND`
* **RST:** Hardwired to ESP32 `EN` (or 3.3V)
* **MISO / SDO:** Disconnected
* **VCC / LED:** `3.3V`
* **GND:** `GND`

### PlatformIO Commands:
```powershell
# Compile TFT test
pio run -e tft-tester

# Flash to ESP32 on COM7
pio run -e tft-tester -t upload --upload-port COM7

# Monitor Serial output
pio device monitor -b 115200 -p COM7
```

---

## 2. PCF8574T I2C Expander Touch Test

### PlatformIO Commands:
```powershell
# Compile PCF8574 test
pio run -e pcf8574-tester

# Flash to ESP32 on COM7
pio run -e pcf8574-tester -t upload --upload-port COM7
```
