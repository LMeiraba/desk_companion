/**
 * ============================================================================
 * ESP32-C3 SuperMini + PCF8574T LCD Backpack ALL-PIN TOUCH TESTER (PlatformIO)
 * ============================================================================
 * 
 * Hardware Connections:
 *   ESP32-C3 GND    <---> Backpack GND  (4-pin header)
 *   ESP32-C3 3.3V   <---> Backpack VCC  (4-pin header)
 *   ESP32-C3 GPIO 0 <---> Backpack SDA  (4-pin header)
 *   ESP32-C3 GPIO 1 <---> Backpack SCL  (4-pin header)
 * 
 * Testing Method:
 *   1. Plug one jumper wire into Pin 1 (GND) of the 16-pin row.
 *   2. Touch the free end of this wire to any pin on the 16-pin row!
 * ============================================================================
 */

#include <Arduino.h>
#include <Wire.h>

// ESP32-C3 SuperMini I2C Pins
#define I2C_SDA_PIN 0
#define I2C_SCL_PIN 1

static uint8_t pcf_addr = 0x27;
static uint8_t last_raw_byte = 0xFF;
static unsigned long last_debounce_time = 0;
static const unsigned long DEBOUNCE_DELAY = 30; // 30ms debounce

// Auto-scan I2C bus to find the backpack
static bool scanAndFindAddress() {
  Serial.println("\n[I2C Scanner] Scanning I2C bus (SDA=0, SCL=1)...");
  bool found = false;

  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();

    if (err == 0) {
      Serial.printf("  --> Detected I2C device at: 0x%02X", addr);
      if (addr == 0x27) {
        Serial.println(" (Standard PCF8574T - A0..A2 Unsoldered)");
      } else if (addr == 0x3F) {
        Serial.println(" (PCF8574AT Variant - A0..A2 Unsoldered)");
      } else {
        Serial.println();
      }
      pcf_addr = addr;
      found = true;
    }
  }
  return found;
}

// Write 0xFF to PCF8574 to enable weak pull-ups on all pins
static void setupAllInputs() {
  Wire.beginTransmission(pcf_addr);
  Wire.write(0xFF); // All 8 bits set to 1 -> weak internal pull-up active
  uint8_t err = Wire.endTransmission();
  if (err != 0) {
    Serial.printf("⚠️ I2C write error: %d\n", err);
  }
}

// Read current 8-bit state
static uint8_t readPort() {
  uint8_t count = Wire.requestFrom((int)pcf_addr, 1);
  if (count == 1 && Wire.available()) {
    return Wire.read();
  }
  return 0xFF;
}

// Print full diagnostic report of all 8 ports
static void printPinStatus(uint8_t current, uint8_t previous) {
  uint8_t changed = current ^ previous;

  Serial.println("\n========================================================");
  Serial.printf(" RAW BYTE: 0x%02X  |  Binary: [P7..P0] = ", current);
  for (int i = 7; i >= 0; i--) {
    Serial.print((current & (1 << i)) ? "1" : "0");
  }
  Serial.println();
  Serial.println("========================================================");

  // Check each of the 8 pins individually
  for (uint8_t bit = 0; bit < 8; bit++) {
    bool is_high = (current & (1 << bit)) != 0;
    bool was_high = (previous & (1 << bit)) != 0;
    bool state_changed = (changed & (1 << bit)) != 0;

    String header_pin = "???";
    String description = "";

    switch (bit) {
      case 0: header_pin = "Pin  4"; description = "P0 (LCD RS) - Fully Usable Input"; break;
      case 1: header_pin = "Pin  5"; description = "P1 (LCD RW) - Usually hardwired to GND on PCB"; break;
      case 2: header_pin = "Pin  6"; description = "P2 (LCD EN) - Fully Usable Input"; break;
      case 3: header_pin = "Pin 16"; description = "P3 (Backlight) - Connected to Q1 transistor"; break;
      case 4: header_pin = "Pin 11"; description = "P4 (LCD D4) - RECOMMENDED -> Encoder 1 SW"; break;
      case 5: header_pin = "Pin 12"; description = "P5 (LCD D5) - RECOMMENDED -> Encoder 2 SW"; break;
      case 6: header_pin = "Pin 13"; description = "P6 (LCD D6) - RECOMMENDED -> Encoder 3 SW"; break;
      case 7: header_pin = "Pin 14"; description = "P7 (LCD D7) - Fully Usable Input"; break;
    }

    // Format output
    Serial.printf("  Bit %d (%s | %s) : ", bit, header_pin.c_str(), description.c_str());
    if (is_high) {
      Serial.print("HIGH (Float / Released)");
    } else {
      Serial.print("🟢 LOW  (TOUCHED TO GND / PRESSED!)");
    }

    if (state_changed) {
      if (!is_high && was_high) {
        Serial.print("  <--- [TOUCH STARTED]");
      } else if (is_high && !was_high) {
        Serial.print("  <--- [TOUCH RELEASED]");
      }
    }
    Serial.println();
  }

  Serial.println("========================================================");
}

void setup() {
  Serial.begin(115200);

  // Allow time for USB-CDC to initialize on ESP32-C3
  unsigned long t0 = millis();
  while (!Serial && (millis() - t0 < 3000)) {
    delay(10);
  }

  Serial.println("\n\n########################################################");
  Serial.println("  PCF8574T ALL-PIN TOUCH TESTER (PlatformIO)");
  Serial.println("########################################################");

  // Start I2C bus on GPIO 0 and GPIO 1
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN, 100000);

  // Auto-detect backpack address
  if (!scanAndFindAddress()) {
    Serial.println("❌ ERROR: No I2C backpack detected!");
    Serial.println("   Check your connections: 3.3V, GND, SDA (GPIO 0), SCL (GPIO 1).");
    while (true) { delay(1000); }
  }

  // Set all pins to input with weak pull-ups enabled
  setupAllInputs();
  delay(50);

  last_raw_byte = readPort();
  Serial.printf("\n✅ PCF8574 ready at address 0x%02X!\n", pcf_addr);
  Serial.println("\n👉 HOW TO TEST:");
  Serial.println("   1. Insert a jumper wire into Pin 1 (GND) of the 16-pin row.");
  Serial.println("   2. Touch the other end to Pin 11 (P4), Pin 12 (P5), Pin 13 (P6),");
  Serial.println("      Pin 14 (P7), Pin 4 (P0), or Pin 6 (P2).");
  Serial.println("   3. The terminal will immediately report the exact pin you touched!\n");

  printPinStatus(last_raw_byte, last_raw_byte);
}

void loop() {
  uint8_t current_byte = readPort();

  if (current_byte != last_raw_byte) {
    if (millis() - last_debounce_time > DEBOUNCE_DELAY) {
      last_debounce_time = millis();
      printPinStatus(current_byte, last_raw_byte);
      last_raw_byte = current_byte;
    }
  }

  delay(20);
}
