#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

// -------------------------------------------------------------------------
// Pin Mapping for ESP32-C3 SuperMini + 2.8" SPI TFT (ILI9341)
// -------------------------------------------------------------------------
#define TFT_CS    5   // Screen Pin 3 -> GPIO 5
#define TFT_DC    7   // Screen Pin 5 -> GPIO 7
#define TFT_MOSI  6   // Screen Pin 6 -> GPIO 6
#define TFT_SCK   4   // Screen Pin 7 -> GPIO 4
#define TFT_RST  -1   // Screen Pin 4 -> Tied to 3.3V
#define TFT_BL   10   // Screen Pin 8 -> GPIO 10 (or 3.3V rail)

// Hardware MADCTL bit definitions
#define MADCTL_MY  0x80  // Row address order (flips Y in portrait, X in landscape)
#define MADCTL_MX  0x40  // Column address order (flips X in portrait, Y in landscape)
#define MADCTL_MV  0x20  // Row/Column exchange (Landscape)
#define MADCTL_BGR 0x08  // Blue-Green-Red color filter order

SPIClass spiBus(FSPI);
Adafruit_ILI9341 tft(&spiBus, TFT_DC, TFT_CS, TFT_RST);

// Set landscape with corrected mirror chirality
void setLandscapeMode(bool flip180 = false) {
  // Set dimensions in library to 320 wide x 240 high
  tft.setRotation(1);

  // Invert exactly one axis so text is NOT mirrored:
  // Standard Adafruit rot 1 (0x28) is mirrored on this panel.
  // 0xA8 (MV | BGR | MY) un-mirrors the text so it is 100% human-readable!
  // 0x68 (MV | BGR | MX) is the 180-degree upright equivalent if mounted opposite way.
  uint8_t m = flip180 ? (MADCTL_MV | MADCTL_BGR | MADCTL_MX)
                      : (MADCTL_MV | MADCTL_BGR | MADCTL_MY);

  tft.sendCommand(ILI9341_MADCTL, &m, 1);
}

void setup() {
  Serial.begin(115200);

  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);

  unsigned long t0 = millis();
  while (!Serial && (millis() - t0 < 1500)) {
    delay(10);
  }

  spiBus.begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
  tft.begin(20000000); // 20 MHz

  // Software reset sequence
  tft.sendCommand(ILI9341_SWRESET);
  delay(150);
  tft.sendCommand(ILI9341_SLPOUT);
  delay(120);
  tft.sendCommand(ILI9341_DISPON);

  // Apply un-mirrored landscape mode
  setLandscapeMode(false); // set to true if upside-down
  tft.fillScreen(ILI9341_BLACK);

  int16_t w = tft.width();  // 320
  int16_t h = tft.height(); // 240

  Serial.printf("[TFT] Un-mirrored Landscape: %d x %d\n", w, h);

  // 1. Triple perimeter border
  tft.drawRect(0, 0, w, h, ILI9341_WHITE);
  tft.drawRect(1, 1, w - 2, h - 2, ILI9341_GREEN);
  tft.drawRect(2, 2, w - 4, h - 4, ILI9341_YELLOW);

  // 2. Corner markers
  tft.fillRect(3, 3, 14, 14, ILI9341_RED);              // (0,0) TOP-LEFT
  tft.fillRect(w - 17, 3, 14, 14, ILI9341_BLUE);        // TOP-RIGHT
  tft.fillRect(3, h - 17, 14, 14, ILI9341_GREEN);       // BOTTOM-LEFT
  tft.fillRect(w - 17, h - 17, 14, 14, ILI9341_MAGENTA); // BOTTOM-RIGHT

  // 3. Header Bar
  tft.fillRect(20, 4, w - 40, 30, ILI9341_NAVY);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(2);
  tft.setCursor(26, 11);
  tft.print("DESK COMPANION");

  // 4. Left Info Box
  tft.drawRoundRect(10, 40, 185, 126, 4, ILI9341_DARKCYAN);
  tft.setTextColor(ILI9341_GREEN);
  tft.setTextSize(1);
  tft.setCursor(18, 50);  tft.printf("Display : %d x %d Widescreen", w, h);
  tft.setCursor(18, 66);  tft.printf("Driver  : ILI9341 SPI (20MHz)");
  tft.setCursor(18, 82);  tft.printf("Mirror  : UN-MIRRORED (FIXED)");
  tft.setCursor(18, 98);  tft.printf("Status  : 100%% Edge Aligned");
  tft.setCursor(18, 114); tft.printf("Text    : Normal Left-to-Right");
  tft.setCursor(18, 130); tft.printf("Blanking: NONE (Full 320x240)");
  tft.setCursor(18, 146); tft.printf("ESP32-C3: SuperMini Active");

  // 5. Right Swatches Box (Color Fidelity Test)
  tft.drawRoundRect(202, 40, 108, 126, 4, ILI9341_DARKCYAN);
  tft.fillRect(210, 48, 42, 50, ILI9341_RED);
  tft.fillRect(258, 48, 42, 50, ILI9341_GREEN);
  tft.fillRect(210, 106, 42, 50, ILI9341_BLUE);
  tft.fillRect(258, 106, 42, 50, ILI9341_MAGENTA);

  // 6. Bottom Banner
  tft.fillRect(10, 172, w - 20, 58, ILI9341_DARKGREEN);
  tft.drawRect(10, 172, w - 20, 58, ILI9341_WHITE);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(2);
  tft.setCursor(20, 182);
  tft.print("TEXT IS UN-MIRRORED!");
  tft.setTextSize(1);
  tft.setCursor(20, 206);
  tft.setTextColor(ILI9341_YELLOW);
  tft.print("Normal Left-to-Right Reading | Zero Cut-off");

  Serial.println("[TFT] Un-mirrored screen rendered successfully.");
}

uint32_t lastSec = 0;

void loop() {
  uint32_t currentSec = millis() / 1000;
  if (currentSec != lastSec) {
    lastSec = currentSec;

    // Small uptime counter in the navy header bar
    tft.fillRect(215, 10, 80, 18, ILI9341_NAVY);
    tft.setTextColor(ILI9341_YELLOW);
    tft.setTextSize(1);
    tft.setCursor(218, 15);
    tft.printf("Up: %lu s", currentSec);
  }

  delay(100);
}
