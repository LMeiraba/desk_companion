#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Wire.h>
#include <Preferences.h>

// =========================================================================
// DESK COMPANION - PRODUCTION FIRMWARE
//
// Hardware Pinout (ESP32-C3 SuperMini):
// - 2.8" SPI TFT (ILI9341):
//     SCL/SCK:  GPIO 4
//     SDA/MOSI: GPIO 6
//     DC:       GPIO 7
//     CS:       GPIO 5
//     BL/LED:   GPIO 10 (Hardware PWM)
//     RST:      3.3V (Hardware Pull-up)
// - Rotary Encoder 1:
//     CLK (A):  GPIO 2
//     DT (B):   GPIO 3
//     SW (Btn): GPIO 9 or PCF8574 Pin 11 (P4)
// - I2C Bus (PCF8574 Expander):
//     SDA:      GPIO 0
//     SCL:      GPIO 1
// =========================================================================

#define TFT_CS          5
#define TFT_DC          7
#define TFT_MOSI        6
#define TFT_SCK         4
#define TFT_RST        -1
#define TFT_BL_PIN      10
#define BL_PWM_CHANNEL  0
#define BL_PWM_FREQ     5000
#define BL_PWM_RES      8

#define ENC_CLK_PIN     2
#define ENC_DT_PIN      3
#define ENC_SW_PIN      9
#define I2C_SDA_PIN     0
#define I2C_SCL_PIN     1
#define PCF8574_ADDR    0x27

// Hardware MADCTL bit definitions for ILI9341
#define MADCTL_MY  0x80  // Row address order
#define MADCTL_MX  0x40  // Column address order
#define MADCTL_MV  0x20  // Row/Column exchange (Landscape)
#define MADCTL_BGR 0x08  // Blue-Green-Red filter order

// --- Hardware & Server Singletons ---
SPIClass spiBus(FSPI);
Adafruit_ILI9341 tft(&spiBus, TFT_DC, TFT_CS, TFT_RST);
WebSocketsServer webSocket = WebSocketsServer(81);
WebServer server(80);
DNSServer dnsServer;
Preferences prefs;

// --- State Variables ---
struct AppState {
  String screenMode = "lyrics"; // "lyrics", "now_playing", "clock"
  String trackName = "No Track Playing";
  String artistName = "Desk Companion";
  bool isPlaying = false;
  uint32_t progressMs = 0;
  uint32_t durationMs = 1000;
  uint32_t lastProgressUpdateMs = 0;
  uint16_t accentColor = ILI9341_CYAN;
  String currentLyric = "";
  String prevLyric = "";
  String nextLyric = "";
  String lines[5];
  bool hasLyrics = false;
  uint8_t clientCount = 0;
  int rotation = 1; // 1 = Landscape (320x240), 0 = Portrait (240x320)
  String timeStr = "12:00";
  String dateStr = "DESK COMPANION";
};

AppState state;

bool isProvisioningMode = false;
bool fullRedrawNeeded = true;
bool lyricsChanged = false;
uint32_t lastTftUpdate = 0;
uint32_t hudExpireTime = 0;
String hudMessage = "";
int localScrollOffset = 0;

// --- Rotary Encoder State ---
volatile int8_t encDelta = 0;
volatile uint8_t encLastState = 0;
uint32_t lastBtnCheck = 0;
bool lastBtnState = HIGH;
uint32_t btnPressTime = 0;
uint8_t clickCount = 0;
uint32_t lastClickRelease = 0;

void IRAM_ATTR encoderISR() {
  static uint32_t lastInterrupt = 0;
  uint32_t now = micros();
  if (now - lastInterrupt < 4000) return; // 4ms debounce ignores mechanical contact bounce
  lastInterrupt = now;

  // At FALLING edge of CLK:
  // If DT is still HIGH -> Turned Clockwise (Seek Forward +)
  // If DT is already LOW -> Turned Counter-Clockwise (Seek Backward -)
  if (digitalRead(ENC_DT_PIN) == HIGH) {
    encDelta++;
  } else {
    encDelta--;
  }
}

// Set screen orientation with hardware un-mirrored MADCTL register configuration
void applyOrientation(int rot) {
  state.rotation = rot;
  tft.setRotation(rot);

  uint8_t m = 0;
  switch (rot) {
    case 1: // Landscape (320x240, Pins on Left - VERIFIED UN-MIRRORED)
      m = MADCTL_MV | MADCTL_BGR | MADCTL_MY; // 0xA8
      break;
    case 3: // Landscape Flipped (320x240, Pins on Right)
      m = MADCTL_MV | MADCTL_BGR | MADCTL_MX; // 0x68
      break;
    case 0: // Portrait (240x320 - UN-MIRRORED, RIGHT-SIDE UP, MX=1, MY=1)
      m = MADCTL_BGR | MADCTL_MX | MADCTL_MY; // 0xC8
      break;
    case 2: // Portrait Flipped (240x320 - UN-MIRRORED 180°, MX=0, MY=0)
      m = MADCTL_BGR;                         // 0x08
      break;
    default:
      m = MADCTL_BGR;                         // 0x08 default
      break;
  }
  tft.sendCommand(ILI9341_MADCTL, &m, 1);
  fullRedrawNeeded = true;
}

static uint16_t albumThumb[32 * 32];
static bool hasAlbumThumb = false;
static uint32_t lastAlbumArtHash = 0;

uint32_t simpleHash(const char* str, size_t len) {
  uint32_t hash = 5381;
  for (size_t i = 0; i < len; i++) {
    hash = ((hash << 5) + hash) + (uint8_t)str[i];
  }
  return hash;
}

static const char B64_CHARS[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

int b64Index(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

void decodeBase64ToRGB565(const char* b64, uint16_t* outBuf, int maxPixels) {
  if (!b64) return;
  int len = strlen(b64);
  int pixelIdx = 0;
  uint8_t highByte = 0;
  bool hasHighByte = false;

  for (int i = 0; i < len; i += 4) {
    if (b64[i] == '=' || b64[i + 1] == '=') break;
    int b0 = b64Index(b64[i]);
    int b1 = b64Index(b64[i + 1]);
    int b2 = (i + 2 < len && b64[i + 2] != '=') ? b64Index(b64[i + 2]) : 0;
    int b3 = (i + 3 < len && b64[i + 3] != '=') ? b64Index(b64[i + 3]) : 0;
    if (b0 < 0 || b1 < 0) break;

    uint32_t triple = (b0 << 18) | (b1 << 12) | (b2 << 6) | b3;
    uint8_t bytes[3];
    bytes[0] = (triple >> 16) & 0xFF;
    bytes[1] = (triple >> 8) & 0xFF;
    bytes[2] = triple & 0xFF;

    int validBytes = (b64[i + 2] == '=') ? 1 : ((b64[i + 3] == '=') ? 2 : 3);
    for (int j = 0; j < validBytes; j++) {
      if (!hasHighByte) {
        highByte = bytes[j];
        hasHighByte = true;
      } else {
        uint8_t lowByte = bytes[j];
        hasHighByte = false;
        if (pixelIdx < maxPixels) {
          outBuf[pixelIdx++] = (highByte << 8) | lowByte;
        }
      }
    }
  }
}

uint16_t parseColorToRGB565(const String& colStr) {
  String s = colStr;
  s.trim();
  uint8_t r = 16, g = 185, b = 129; // default emerald
  if (s.startsWith("#") && s.length() >= 7) {
    long val = strtol(s.substring(1).c_str(), NULL, 16);
    r = (val >> 16) & 0xFF;
    g = (val >> 8) & 0xFF;
    b = val & 0xFF;
  } else if (s.startsWith("rgb")) {
    int openParen = s.indexOf('(');
    int closeParen = s.indexOf(')');
    if (openParen != -1 && closeParen != -1) {
      String inner = s.substring(openParen + 1, closeParen);
      int c1 = inner.indexOf(',');
      int c2 = inner.indexOf(',', c1 + 1);
      if (c1 != -1 && c2 != -1) {
        r = inner.substring(0, c1).toInt();
        g = inner.substring(c1 + 1, c2).toInt();
        b = inner.substring(c2 + 1).toInt();
      }
    }
  }

  // Ensure high contrast & visibility on TN TFT panels against black background:
  float lum = 0.299f * r + 0.587f * g + 0.114f * b;
  if (lum < 140.0f) {
    float factor = (lum > 20.0f) ? (165.0f / lum) : 5.0f;
    r = constrain((int)(r * factor), 0, 255);
    g = constrain((int)(g * factor), 0, 255);
    b = constrain((int)(b * factor), 0, 255);
    if ((int)r + g + b < 210) {
      r = 16; g = 185; b = 129; // High-visibility Emerald fallback
    }
  }

  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

uint16_t hexToRGB565(const String& hex) {
  return parseColorToRGB565(hex);
}

void setBacklight(uint8_t duty) {
  ledcWrite(BL_PWM_CHANNEL, duty);
}

static bool pcf8574Present = false;

bool readPCF8574Button() {
  if (!pcf8574Present) return false;
  Wire.requestFrom((int)PCF8574_ADDR, 1);
  if (Wire.available()) {
    uint8_t data = Wire.read();
    return (data & (1 << 4)) == 0;
  }
  return false;
}

String formatTime(uint32_t ms) {
  uint32_t totalSec = ms / 1000;
  uint32_t minutes = totalSec / 60;
  uint32_t seconds = totalSec % 60;
  char buf[12];
  snprintf(buf, sizeof(buf), "%u:%02u", minutes, seconds);
  return String(buf);
}

// -------------------------------------------------------------------------
// CAPTIVE WEB PROVISIONING PORTAL
// -------------------------------------------------------------------------
String generatePortalHtml() {
  String savedSsid = prefs.getString("ssid", "");

  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Desk Companion Setup</title>
  <style>
    body { background: #0a0a0a; color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; margin: 0; }
    .card { max-width: 380px; margin: 20px auto; background: #171717; border: 1px solid #262626; border-radius: 20px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h2 { margin-top: 0; color: #10b981; font-size: 20px; }
    p { font-size: 13px; color: #a3a3a3; line-height: 1.5; }
    .alert { background: #261f0c; border: 1px solid #854d0e; color: #fde047; padding: 10px 14px; border-radius: 10px; font-size: 12px; margin-bottom: 16px; line-height: 1.4; }
    label { font-size: 12px; color: #a3a3a3; display: block; margin-top: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    input { width: 100%; box-sizing: border-box; padding: 12px; margin-top: 6px; background: #0a0a0a; border: 1px solid #333; color: #fff; border-radius: 12px; font-size: 14px; }
    input:focus { border-color: #10b981; outline: none; }
    button { width: 100%; padding: 14px; margin-top: 22px; background: #10b981; border: none; border-radius: 12px; color: #000; font-weight: 700; font-size: 15px; cursor: pointer; transition: all 0.2s; }
    button:active { transform: scale(0.98); }
    .hint { font-size: 11px; color: #737373; margin-top: 14px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Desk Companion Setup</h2>
    <div class="alert">
      <b>Important:</b> ESP32 hardware supports <b>2.4 GHz Wi-Fi only</b>. If your router has separate 2.4G and 5G networks, enter the 2.4GHz network name.
    </div>
    <form action="/save" method="POST">
      <label>Wi-Fi Network Name (SSID)</label>
      <input type="text" id="ssid" name="ssid" placeholder="e.g. MyHome_2.4G" value=")rawliteral";

  html += savedSsid;
  html += R"rawliteral(" required autofocus>

      <label>Wi-Fi Password</label>
      <input type="password" name="pass" placeholder="Network password">

      <button type="submit">Save &amp; Connect</button>
      <div class="hint">Saved credentials are permanently remembered.</div>
    </form>
  </div>
</body>
</html>
)rawliteral";
  return html;
}

static uint8_t lastDisconnectReason = 0;
static bool wifiReconnectPending = false;
static uint32_t nextWifiReconnectTime = 0;

const char* getWifiDisconnectReasonName(uint8_t reason) {
  switch (reason) {
    case 1:   return "UNSPECIFIED";
    case 2:   return "AUTH_EXPIRE";
    case 3:   return "AUTH_LEAVE";
    case 4:   return "ASSOC_EXPIRE";
    case 5:   return "ASSOC_TOOMANY";
    case 6:   return "NOT_AUTHED";
    case 7:   return "NOT_ASSOCED";
    case 8:   return "ASSOC_LEAVE";
    case 9:   return "ASSOC_NOT_AUTHED";
    case 13:  return "IE_INVALID";
    case 14:  return "MIC_FAILURE";
    case 15:  return "4WAY_HANDSHAKE_TIMEOUT";
    case 16:  return "GROUP_KEY_UPDATE_TIMEOUT";
    case 17:  return "IE_IN_4WAY_DIFFERS";
    case 18:  return "GROUP_CIPHER_INVALID";
    case 19:  return "PAIRWISE_CIPHER_INVALID";
    case 20:  return "AKMP_INVALID";
    case 23:  return "CIPHER_SUITE_REJECTED";
    case 201: return "NO_AP_FOUND";
    case 202: return "AUTH_FAIL";
    case 203: return "ASSOC_FAIL";
    case 204: return "HANDSHAKE_TIMEOUT";
    case 205: return "CONNECTION_FAIL";
    case 206: return "AP_TSF_RESET";
    case 207: return "ROAMING";
    default:  return "DISCONNECTED";
  }
}

void handleRoot() {
  server.sendHeader("Connection", "close");
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.send(200, "text/html", generatePortalHtml());
}

void handleRedirect() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.sendHeader("Connection", "close");
  server.send(302, "text/plain", "");
}

void handleSave() {
  String newSsid = server.hasArg("ssid") ? server.arg("ssid") : server.arg("manual_ssid");
  newSsid.trim();
  String newPass = server.arg("pass");
  newPass.trim();

  if (newSsid.length() > 0) {
    prefs.putString("ssid", newSsid);
    prefs.putString("pass", newPass);
  }

  server.sendHeader("Connection", "close");
  String resp = "<html><body style='background:#0a0a0a;color:#10b981;font-family:sans-serif;text-align:center;padding-top:50px;'>";
  resp += "<h2>Saved!</h2><p style='color:#fff;'>Desk Companion is connecting to <b>" + newSsid + "</b>...</p>";
  resp += "<p style='color:#888;font-size:13px;'>You can now reconnect your device to your home Wi-Fi.</p></body></html>";
  server.send(200, "text/html", resp);

  delay(1200);
  ESP.restart();
}

void startProvisioningPortal() {
  isProvisioningMode = true;

  // 1. Cleanly reset Wi-Fi hardware and turn OFF first to clear any lingering PHY state
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_OFF);
  delay(150);

  // 2. Set pure AP mode
  WiFi.mode(WIFI_AP);
  delay(100);

  // Set AP TX power to 68 (~17 dBm) - strong, clean signal without packet drops or brownout
  esp_wifi_set_max_tx_power(68);
  esp_wifi_set_protocol(WIFI_IF_AP, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
  esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);

  IPAddress apIP(192, 168, 4, 1);
  IPAddress gateway(192, 168, 4, 1);
  IPAddress subnet(255, 255, 255, 0);
  WiFi.softAPConfig(apIP, gateway, subnet);

  // Start AP: Channel 1, WPA2-Personal password "12345678"
  bool apSuccess = WiFi.softAP("DeskCompanion-Setup", "12345678", 1, 0, 4);
  delay(150);

  if (apSuccess) {
    WiFi.setSleep(false);
    esp_wifi_set_ps(WIFI_PS_NONE);
    esp_wifi_set_max_tx_power(68);
  }

  wifi_config_t conf;
  esp_wifi_get_config(WIFI_IF_AP, &conf);
  Serial.printf("[AP] Status: %s | IP: %s\n", apSuccess ? "SUCCESS" : "FAILED", WiFi.softAPIP().toString().c_str());
  Serial.printf("[AP] Config: SSID='%s', Ch=%d, Auth=%d, Hidden=%d, MaxConn=%d\n",
                conf.ap.ssid, conf.ap.channel, conf.ap.authmode, conf.ap.ssid_hidden, conf.ap.max_connection);
  Serial.println("[AP] TIP: You can also set Wi-Fi via USB Serial: send 'SET_WIFI:ssid,password'");

  // DNS server on port 53 to redirect all queries to AP IP
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(53, "*", apIP);

  // Web routes with fast connection handling
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/generate_204", HTTP_GET, handleRedirect);
  server.on("/hotspot-detect.html", HTTP_GET, handleRedirect);
  server.on("/connecttest.txt", HTTP_GET, handleRedirect);
  server.on("/ncsi.txt", HTTP_GET, handleRedirect);
  server.on("/favicon.ico", HTTP_GET, []() {
    server.sendHeader("Connection", "close");
    server.send(204);
  });
  server.on("/wpad.dat", HTTP_GET, []() {
    server.sendHeader("Connection", "close");
    server.send(404);
  });
  server.onNotFound([]() {
    String host = server.hostHeader();
    if (host.length() > 0 && !host.startsWith("192.168.4.1")) {
      handleRedirect();
    } else {
      handleRoot();
    }
  });
  server.begin();

  Serial.println("[AP] Setup Server Listening at http://192.168.4.1");

  // Render Portal screen on TFT
  tft.fillScreen(ILI9341_BLACK);
  int w = tft.width();
  int h = tft.height();

  tft.drawRect(2, 2, w - 4, h - 4, ILI9341_GREEN);
  tft.fillRect(4, 4, w - 8, 28, 0x0841);
  tft.setTextColor(ILI9341_GREEN, 0x0841);
  tft.setTextSize(2);
  tft.setCursor(14, 10);
  tft.print("WI-FI SETUP");

  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(14, 42);
  tft.print("1. Connect to Wi-Fi:");

  tft.setTextColor(ILI9341_YELLOW, ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(14, 58);
  tft.print("DeskCompanion-Setup");

  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(14, 78);
  tft.print("Password: ");
  tft.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
  tft.print("12345678");

  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(14, 98);
  tft.print("2. Open browser to setup IP:");

  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(14, 114);
  tft.print("http://192.168.4.1");

  tft.setTextColor(ILI9341_LIGHTGREY, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(14, 145);
  tft.print("Enter your home Wi-Fi name & password.");
  tft.setCursor(14, 160);
  tft.print("Hold knob at boot anytime to reopen this.");
}

// -------------------------------------------------------------------------
// TFT DISPLAY RENDERING (Flicker-Free, Edge-Aligned Parity Engine)
// -------------------------------------------------------------------------
static String lastDrawnTrack = "";
static String lastDrawnArtist = "";
static String lastDrawnCurLyric = "";
static int lastDrawnFillW = -1;
static int lastDrawnSec = -1;

void drawCenteredText(const String& str, int y, uint8_t size, uint16_t color, uint16_t bg = ILI9341_BLACK) {
  int w = tft.width();
  int charW = 6 * size;
  int textW = str.length() * charW;
  int x = max(4, (w - textW) / 2);
  tft.setTextSize(size);
  tft.setTextColor(color, bg);
  tft.setCursor(x, y);
  tft.print(str);
}

// Ultra-fast atmospheric top glow using pre-interpolated line scanlines (takes < 6ms over SPI)
void drawAmbientTopGlow(uint16_t accentCol, int glowHeight = 80) {
  int w = tft.width();
  uint8_t r5 = (accentCol >> 11) & 0x1F;
  uint8_t g6 = (accentCol >> 5) & 0x3F;
  uint8_t b5 = accentCol & 0x1F;

  for (int y = 0; y < glowHeight; y++) {
    float t = 1.0f - ((float)y / (float)glowHeight);
    float factor = 0.55f * t * t; // Calibrated quadratic falloff: visible rich ambient glow matching mockup
    uint8_t curR = (uint8_t)(r5 * factor);
    uint8_t curG = (uint8_t)(g6 * factor);
    uint8_t curB = (uint8_t)(b5 * factor);
    uint16_t lineCol = (curR << 11) | (curG << 5) | curB;
    tft.drawFastHLine(0, y, w, lineCol);
    if (y % 15 == 0) yield();
  }
}

void drawHeader() {
  int w = tft.width();
  int h = tft.height();
  int headerH = 44;

  // Clear top header area cleanly to pitch black
  tft.fillRect(0, 0, w, headerH, ILI9341_BLACK);

  // Album Artwork Thumbnail (32x32) at (7, 6)
  if (hasAlbumThumb) {
    tft.drawRGBBitmap(7, 6, albumThumb, 32, 32);
    tft.drawRoundRect(6, 5, 34, 34, 4, state.accentColor);
  } else {
    // Stylized mini vinyl/artwork card with accent color
    tft.fillRoundRect(6, 5, 34, 34, 4, 0x10A2);
    tft.drawRoundRect(6, 5, 34, 34, 4, state.accentColor);
    tft.fillCircle(23, 22, 10, 0x2104);
    tft.drawCircle(23, 22, 7, 0x39E7);
    tft.fillCircle(23, 22, 3, state.accentColor);
  }

  // Track Title (Beside thumbnail at X=46, Y=7)
  String trackDisplay = state.trackName;
  uint8_t trackSize = (trackDisplay.length() <= 11) ? 2 : 1;
  int maxTrackChars = (trackSize == 2) ? 12 : ((w >= 320) ? 30 : 24);
  if (trackDisplay.length() > maxTrackChars) {
    trackDisplay = trackDisplay.substring(0, maxTrackChars - 2) + "..";
  }
  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setTextSize(trackSize);
  tft.setCursor(46, trackSize == 2 ? 8 : 10);
  tft.print(trackDisplay);

  // Artist Name (Beside thumbnail at X=46, Y=25)
  String artistDisplay = state.artistName;
  int maxArtistChars = (w >= 320) ? 34 : 22;
  if (artistDisplay.length() > maxArtistChars) {
    artistDisplay = artistDisplay.substring(0, maxArtistChars - 2) + "..";
  }
  tft.setTextColor(0xAD55, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(46, 25);
  tft.print(artistDisplay);

  // LRC Badge on Top-Right
  int badgeW = 28;
  int badgeH = 14;
  int badgeX = w - badgeW - 7;
  int badgeY = 7;
  tft.drawRoundRect(badgeX, badgeY, badgeW, badgeH, 3, state.hasLyrics ? state.accentColor : 0x4208);
  tft.setTextColor(state.hasLyrics ? state.accentColor : 0x4208, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(badgeX + 6, badgeY + 3);
  tft.print("LRC");

  // Play/Pause dot below LRC badge
  tft.fillCircle(w - 14, 28, 3, state.isPlaying ? state.accentColor : 0x632C);

  // Subtle clean horizontal divider line matching mockup border-neutral-850
  tft.drawFastHLine(6, headerH - 1, w - 12, 0x2965);
}

void drawLargeAlbumArt(int startX, int startY, int targetSize) {
  int scale = targetSize / 32;
  if (scale < 1) scale = 1;
  int actualSize = 32 * scale;
  int padX = (targetSize - actualSize) / 2;
  int padY = (targetSize - actualSize) / 2;
  int x0 = startX + padX;
  int y0 = startY + padY;

  tft.drawRoundRect(x0 - 3, y0 - 3, actualSize + 6, actualSize + 6, 8, state.accentColor);

  if (hasAlbumThumb) {
    uint16_t rowBuf[144]; // Max width buffer for scaled line
    for (int y = 0; y < 32; y++) {
      for (int x = 0; x < 32; x++) {
        uint16_t c = albumThumb[y * 32 + x];
        for (int s = 0; s < scale; s++) {
          rowBuf[x * scale + s] = c;
        }
      }
      for (int s = 0; s < scale; s++) {
        tft.drawRGBBitmap(x0, y0 + y * scale + s, rowBuf, actualSize, 1);
      }
      if (y % 8 == 0) yield();
    }
  } else {
    tft.fillRoundRect(x0, y0, actualSize, actualSize, 8, 0x10A2);
    tft.fillCircle(x0 + actualSize / 2, y0 + actualSize / 2, actualSize / 4, 0x2104);
    tft.drawCircle(x0 + actualSize / 2, y0 + actualSize / 2, actualSize / 6, 0x39E7);
    tft.fillCircle(x0 + actualSize / 2, y0 + actualSize / 2, actualSize / 10, state.accentColor);
  }
}

void drawNowPlayingView(bool forceRedraw = false) {
  int w = tft.width();
  int h = tft.height();

  if (forceRedraw) {
    tft.fillRect(0, 0, w, h, ILI9341_BLACK);
    drawAmbientTopGlow(state.accentColor, 80);

    // Large Album Art (Centered)
    int artSize = (w >= 320) ? 144 : 128;
    int artX = (w - artSize) / 2;
    int artY = (h >= 320) ? 26 : 14;
    drawLargeAlbumArt(artX, artY, artSize);

    // Track Title (Centered below art)
    String trackDisplay = state.trackName;
    uint8_t titleSize = (trackDisplay.length() <= 12) ? 2 : 1;
    int maxTrackChars = (titleSize == 2) ? 14 : ((w >= 320) ? 30 : 24);
    if (trackDisplay.length() > maxTrackChars) {
      trackDisplay = trackDisplay.substring(0, maxTrackChars - 2) + "..";
    }
    int titleY = artY + artSize + 18;
    drawCenteredText(trackDisplay, titleY, titleSize, ILI9341_WHITE, ILI9341_BLACK);

    // Artist Name (Centered below title)
    String artistDisplay = state.artistName;
    int maxArtistChars = (w >= 320) ? 34 : 26;
    if (artistDisplay.length() > maxArtistChars) {
      artistDisplay = artistDisplay.substring(0, maxArtistChars - 2) + "..";
    }
    int artistY = titleY + (titleSize == 2 ? 22 : 16);
    drawCenteredText(artistDisplay, artistY, 1, 0xAD55, ILI9341_BLACK);
  }

  // Temporary HUD Overlay (Seek >> +5s, etc.)
  if (millis() < hudExpireTime && hudMessage.length() > 0) {
    int hudW = 130;
    int hudH = 22;
    int hudX = (w - hudW) / 2;
    int hudY = h - 62;
    tft.fillRoundRect(hudX, hudY, hudW, hudH, 4, 0x10A2);
    tft.drawRoundRect(hudX, hudY, hudW, hudH, 4, state.accentColor);
    drawCenteredText(hudMessage, hudY + 7, 1, state.accentColor, 0x10A2);
  }
}

void drawClockView(bool forceRedraw = false) {
  int w = tft.width();
  int h = tft.height();

  if (forceRedraw) {
    tft.fillRect(0, 0, w, h, ILI9341_BLACK);
    drawAmbientTopGlow(state.accentColor, 80);

    // Large Clock Time (e.g. "12:29 am")
    String tStr = state.timeStr.length() > 0 ? state.timeStr : "12:00 am";
    int timeY = (h >= 320) ? 62 : 32;

    int ampmIdx = tStr.indexOf("am");
    if (ampmIdx == -1) ampmIdx = tStr.indexOf("pm");
    if (ampmIdx == -1) ampmIdx = tStr.indexOf("AM");
    if (ampmIdx == -1) ampmIdx = tStr.indexOf("PM");

    if (ampmIdx != -1) {
      String mainTime = tStr.substring(0, ampmIdx);
      mainTime.trim();
      String suffix = tStr.substring(ampmIdx);
      suffix.trim();

      // Main time (e.g. "12:29") in size 4 (24px/char), suffix (e.g. "am") in size 2 (12px/char)
      int mainW = mainTime.length() * 24;
      int gap = 8;
      int suffW = suffix.length() * 12;
      int totalW = mainW + gap + suffW;
      int startX = max(4, (w - totalW) / 2);

      tft.setTextSize(4);
      tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
      tft.setCursor(startX, timeY);
      tft.print(mainTime);

      tft.setTextSize(2);
      tft.setCursor(startX + mainW + gap, timeY + 14);
      tft.print(suffix);
    } else {
      drawCenteredText(tStr, timeY, 4, ILI9341_WHITE, ILI9341_BLACK);
    }

    // Date String (e.g. "TUE, 10 NOV")
    String dStr = state.dateStr.length() > 0 ? state.dateStr : "DESK COMPANION";
    int dateY = timeY + 44;
    drawCenteredText(dStr, dateY, 1, 0x7BEF, ILI9341_BLACK);

    // Mini Now Playing Card placed at bottom (matching mockup layout)
    int cardW = w - 24;
    int cardH = 48;
    int cardX = 12;
    int cardY = (h >= 320) ? (h - cardH - 24) : (dateY + 28);
    tft.fillRoundRect(cardX, cardY, cardW, cardH, 8, 0x10A2);
    tft.drawRoundRect(cardX, cardY, cardW, cardH, 8, 0x2965);

    // Musical eighth note icon (♪) in accent color at (cardX + 12, cardY + 16)
    int nx = cardX + 12;
    int ny = cardY + 16;
    tft.fillCircle(nx, ny + 9, 3, state.accentColor);
    tft.fillRect(nx + 2, ny, 2, 10, state.accentColor);
    tft.fillRect(nx + 2, ny, 5, 3, state.accentColor);

    // Track Name (bold white text)
    String trk = state.trackName;
    int maxTrk = (w >= 320) ? 26 : 18;
    if (trk.length() > maxTrk) trk = trk.substring(0, maxTrk - 2) + "..";
    tft.setTextColor(ILI9341_WHITE, 0x10A2);
    tft.setTextSize(1);
    tft.setCursor(cardX + 26, cardY + 13);
    tft.print(trk);

    // Artist Name (gray text)
    String art = state.artistName;
    int maxArt = (w >= 320) ? 30 : 20;
    if (art.length() > maxArt) art = art.substring(0, maxArt - 2) + "..";
    tft.setTextColor(0x7BEF, 0x10A2);
    tft.setCursor(cardX + 26, cardY + 28);
    tft.print(art);
  }

  // Temporary HUD Overlay
  if (millis() < hudExpireTime && hudMessage.length() > 0) {
    int hudW = 140;
    int hudH = 22;
    int hudX = (w - hudW) / 2;
    int hudY = h - 62;
    tft.fillRoundRect(hudX, hudY, hudW, hudH, 4, 0x10A2);
    tft.drawRoundRect(hudX, hudY, hudW, hudH, 4, state.accentColor);
    drawCenteredText(hudMessage, hudY + 7, 1, state.accentColor, 0x10A2);
  }
}

void drawLyricsView(bool forceRedraw = false) {
  int w = tft.width();
  int h = tft.height();
  int lyricsTop = 46;
  int footerTop = h - 34;
  int lyricsHeight = footerTop - lyricsTop;
  int centerY = lyricsTop + lyricsHeight / 2 + localScrollOffset;

  // Clean full viewport wipe to eradicate 100% of ghost pixels from previous lines
  tft.fillRect(0, lyricsTop, w, lyricsHeight, ILI9341_BLACK);

  if (!state.hasLyrics || (state.currentLyric.length() == 0 && state.lines[2].length() == 0)) {
    drawCenteredText("No Synced Lyrics", lyricsTop + lyricsHeight / 2 - 10, 2, 0x7BEF, ILI9341_BLACK);
    drawCenteredText("Enjoy the music on Spotify", lyricsTop + lyricsHeight / 2 + 14, 1, 0x52AA, ILI9341_BLACK);
    return;
  }

  // Line -1: Past lyric (neutral-500, centered)
  String past = state.lines[1];
  int pastY = centerY - 42;
  if (past.length() > 0) {
    int maxPastChars = (w >= 320) ? 38 : 26;
    if (past.length() > maxPastChars) past = past.substring(0, maxPastChars - 2) + "..";
    drawCenteredText(past, pastY, 1, 0x7BEF, ILI9341_BLACK);
  }

  // Active Current Line (in fixed-width rounded card matching mockup)
  String cur = state.lines[2].length() > 0 ? state.lines[2] : state.currentLyric;
  int maxLineChars = (w >= 320) ? 24 : 18;
  int cardX = 10;
  int cardW = w - 20; // Full-width card with comfortable 10px side margins

  if (cur.length() > 0) {
    bool isMultiLine = cur.length() > maxLineChars;
    int cardH = isMultiLine ? 46 : 36;
    int cardY = centerY - cardH / 2;

    tft.fillRoundRect(cardX, cardY, cardW, cardH, 8, 0x10A2);
    tft.drawRoundRect(cardX, cardY, cardW, cardH, 8, state.accentColor);

    if (!isMultiLine) {
      drawCenteredText(cur, cardY + (cardH - 16) / 2, 2, state.accentColor, 0x10A2);
    } else {
      int split = cur.lastIndexOf(' ', maxLineChars);
      if (split == -1 || split < 6) split = maxLineChars;
      String line1 = cur.substring(0, split);
      String line2 = cur.substring(split + 1);
      line1.trim();
      line2.trim();
      uint8_t lyricSize = (line1.length() <= maxLineChars && line2.length() <= maxLineChars) ? 2 : 1;
      int y1 = (lyricSize == 2) ? cardY + 6 : cardY + 10;
      int y2 = (lyricSize == 2) ? cardY + 24 : cardY + 24;
      drawCenteredText(line1, y1, lyricSize, state.accentColor, 0x10A2);
      drawCenteredText(line2, y2, lyricSize, state.accentColor, 0x10A2);
    }
  }

  // Line +1: Next lyric (neutral-500, centered)
  String next = state.lines[3];
  int nextY = centerY + 38;
  if (next.length() > 0) {
    int maxNextChars = (w >= 320) ? 38 : 26;
    if (next.length() > maxNextChars) next = next.substring(0, maxNextChars - 2) + "..";
    drawCenteredText(next, nextY, 1, 0x7BEF, ILI9341_BLACK);
  }

  // Temporary HUD Overlay (Seek >> +5s, etc.)
  if (millis() < hudExpireTime && hudMessage.length() > 0) {
    int hudW = 130;
    int hudH = 22;
    int hudX = (w - hudW) / 2;
    int hudY = lyricsTop + lyricsHeight - 28;
    tft.fillRoundRect(hudX, hudY, hudW, hudH, 4, 0x10A2);
    tft.drawRoundRect(hudX, hudY, hudW, hudH, 4, state.accentColor);
    drawCenteredText(hudMessage, hudY + 7, 1, state.accentColor, 0x10A2);
  }
}

void drawFooter(bool forceRedraw = false) {
  int w = tft.width();
  int h = tft.height();
  int footerY = h - 34;

  uint32_t currentMs = state.progressMs;
  if (state.isPlaying && state.lastProgressUpdateMs > 0) {
    currentMs += (millis() - state.lastProgressUpdateMs);
    if (currentMs > state.durationMs) currentMs = state.durationMs;
  }

  int barX = 14;
  int barY = footerY + 8;
  int barW = w - 28;
  int barH = 3;

  float ratio = state.durationMs > 0 ? (float)currentMs / state.durationMs : 0.0f;
  if (ratio > 1.0f) ratio = 1.0f;
  int fillW = (int)(ratio * barW);

  int currentSec = currentMs / 1000;

  // Static full redraw on track transition or orientation switch
  if (forceRedraw) {
    tft.fillRect(0, footerY, w, 34, ILI9341_BLACK);
    tft.drawFastHLine(6, footerY, w - 12, 0x2965);
    tft.fillRoundRect(barX, barY, barW, barH, 1, 0x2104);
    if (fillW > 0) {
      tft.fillRoundRect(barX, barY, fillW, barH, 1, state.accentColor);
    }
    tft.setTextSize(1);
    tft.setTextColor(0x7BEF, ILI9341_BLACK);
    tft.setCursor(barX, footerY + 16);
    tft.print(formatTime(currentMs));

    String totalStr = formatTime(state.durationMs);
    tft.setCursor(barX + barW - totalStr.length() * 6, footerY + 16);
    tft.print(totalStr);

    lastDrawnFillW = fillW;
    lastDrawnSec = currentSec;
    return;
  }

  // Differential update: ONLY redraw progress bar if pixel width moved (NO full wipe!)
  if (fillW != lastDrawnFillW) {
    if (fillW > lastDrawnFillW) {
      int deltaW = fillW - lastDrawnFillW;
      tft.fillRect(barX + lastDrawnFillW, barY, deltaW, barH, state.accentColor);
    } else {
      tft.fillRect(barX, barY, barW, barH, 0x2965);
      if (fillW > 0) {
        tft.fillRect(barX, barY, fillW, barH, state.accentColor);
      }
    }
    lastDrawnFillW = fillW;
  }

  // Differential update: ONLY redraw elapsed time text if the second changed
  if (currentSec != lastDrawnSec) {
    lastDrawnSec = currentSec;
    tft.fillRect(barX, footerY + 16, 40, 10, ILI9341_BLACK); // Clean wipe to eliminate ghost digits!
    tft.setTextSize(1);
    tft.setTextColor(0xAD55, ILI9341_BLACK);
    tft.setCursor(barX, footerY + 16);
    tft.print(formatTime(currentMs));
  }
}

void drawWaitingScreen() {
  int w = tft.width();
  int h = tft.height();
  tft.fillScreen(ILI9341_BLACK);
  tft.drawRect(2, 2, w - 4, h - 4, state.accentColor);

  tft.fillRect(4, 4, w - 8, 30, 0x0841);
  tft.setTextColor(ILI9341_WHITE, 0x0841);
  tft.setTextSize(2);
  tft.setCursor(20, 11);
  tft.println("DESK COMPANION");

  tft.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 50);
  tft.println("WiFi: CONNECTED");

  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(20, 80);
  tft.println("IP Address:");
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 94);
  tft.println(WiFi.localIP().toString());

  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(20, 125);
  tft.println("mDNS Target:");
  tft.setTextColor(ILI9341_YELLOW, ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 139);
  tft.println("desk-companion:81");

  tft.setTextColor(ILI9341_LIGHTGREY, ILI9341_BLACK);
  tft.setTextSize(1);
  tft.setCursor(20, 175);
  tft.println("Waiting for Desktop App...");

  tft.fillRoundRect(20, h - 38, w - 40, 26, 4, 0x18E3);
  tft.setTextColor(ILI9341_WHITE, 0x18E3);
  tft.setTextSize(1);
  tft.setCursor(30, h - 30);
  tft.println("Rotary Knob: Seek +/- 5s");
}

// -------------------------------------------------------------------------
// WEBSOCKET DISPATCHER
// -------------------------------------------------------------------------
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      if (state.clientCount > 0) state.clientCount--;
      Serial.printf("[WS] Client #%u disconnected. Total clients: %d\n", num, state.clientCount);
      if (state.clientCount == 0) fullRedrawNeeded = true;
      break;

    case WStype_CONNECTED: {
      state.clientCount++;
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[WS] Client #%u connected from %s. Total clients: %d\n", num, ip.toString().c_str(), state.clientCount);
      fullRedrawNeeded = true;
      webSocket.sendTXT(num, "{\"type\":\"ack\",\"msg\":\"DeskCompanion Ready\"}");
      break;
    }

    case WStype_TEXT: {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) {
        Serial.printf("[WS] JSON parse error: %s\n", err.c_str());
        return;
      }

      if (doc["type"].is<const char*>()) {
        const char* cmd = doc["type"];
        if (strcmp(cmd, "reset_wifi") == 0) {
          prefs.remove("ssid");
          prefs.remove("pass");
          webSocket.sendTXT(num, "{\"type\":\"ack\",\"msg\":\"Wi-Fi erased, entering portal mode\"}");
          delay(500);
          ESP.restart();
          return;
        }
        if (strcmp(cmd, "set_orientation") == 0) {
          const char* ori = doc["orientation"];
          if (ori && strcmp(ori, "portrait") == 0) {
            applyOrientation(0);
          } else if (ori && strcmp(ori, "portrait_flipped") == 0) {
            applyOrientation(2);
          } else if (ori && strcmp(ori, "landscape_flipped") == 0) {
            applyOrientation(3);
          } else {
            applyOrientation(1);
          }
          prefs.putInt("rot", state.rotation);
          fullRedrawNeeded = true;
          return;
        }
        if (strcmp(cmd, "set_invert") == 0) {
          bool inv = doc["invert"].as<bool>();
          tft.invertDisplay(inv);
          prefs.putBool("inv", inv);
          fullRedrawNeeded = true;
          Serial.printf("[TFT] Inversion updated: %d\n", inv);
          return;
        }
        if (strcmp(cmd, "set_screen") == 0) {
          String scr = doc["screen"].as<String>();
          if (scr != state.screenMode) {
            state.screenMode = scr;
            prefs.putString("screen", scr);
            fullRedrawNeeded = true;
            Serial.printf("[TFT] Screen mode switched: %s\n", scr.c_str());
          }
          return;
        }
      }

      if (doc["screen"].is<String>()) {
        String newScreen = doc["screen"].as<String>();
        if (newScreen != state.screenMode) {
          state.screenMode = newScreen;
          prefs.putString("screen", newScreen);
          fullRedrawNeeded = true;
        }
      }

      if (doc["track"].is<String>()) {
        String newTrack = doc["track"].as<String>();
        if (newTrack != state.trackName) {
          state.trackName = newTrack;
          hasAlbumThumb = false;
          lastAlbumArtHash = 0;
          fullRedrawNeeded = true;
        }
      }
      if (doc["artist"].is<String>()) {
        String newArtist = doc["artist"].as<String>();
        if (newArtist != state.artistName) {
          state.artistName = newArtist;
          fullRedrawNeeded = true;
        }
      }

      if (doc["albumArtB64"].is<const char*>()) {
        const char* b64 = doc["albumArtB64"];
        if (b64 && strlen(b64) > 10) {
          uint32_t h = simpleHash(b64, strlen(b64));
          if (h != lastAlbumArtHash) {
            lastAlbumArtHash = h;
            decodeBase64ToRGB565(b64, albumThumb, 32 * 32);
            hasAlbumThumb = true;
            fullRedrawNeeded = true;
          }
        }
      }

      if (doc["isPlaying"].is<bool>()) state.isPlaying = doc["isPlaying"].as<bool>();
      if (doc["progressMs"].is<uint32_t>()) {
        if (millis() >= hudExpireTime) {
          state.progressMs = doc["progressMs"].as<uint32_t>();
          state.lastProgressUpdateMs = millis();
        }
      }
      if (doc["durationMs"].is<uint32_t>()) {
        uint32_t dur = doc["durationMs"].as<uint32_t>();
        state.durationMs = dur > 0 ? dur : 1000;
      }
      if (doc["accentColor"].is<String>()) {
        uint16_t newColor = parseColorToRGB565(doc["accentColor"].as<String>());
        if (newColor != state.accentColor) {
          state.accentColor = newColor;
          fullRedrawNeeded = true;
        }
      }

      if (doc["timeStr"].is<String>()) {
        String newTime = doc["timeStr"].as<String>();
        if (newTime != state.timeStr) {
          state.timeStr = newTime;
          if (state.screenMode == "clock") fullRedrawNeeded = true;
        }
      }

      if (doc["dateStr"].is<String>()) {
        state.dateStr = doc["dateStr"].as<String>();
      }

      if (doc["currentLyricLine"].is<const char*>() || doc["currentLyricLine"].isNull()) {
        String newCurrent = doc["currentLyricLine"].isNull() ? "" : doc["currentLyricLine"].as<String>();
        if (newCurrent != state.currentLyric) {
          state.currentLyric = newCurrent;
          lyricsChanged = true;
        }
      }

      if (doc["lines"].is<JsonArray>()) {
        JsonArray arr = doc["lines"].as<JsonArray>();
        for (int i = 0; i < 5 && i < (int)arr.size(); i++) {
          String l = arr[i].as<String>();
          if (l != state.lines[i]) {
            state.lines[i] = l;
            lyricsChanged = true;
          }
        }
        state.hasLyrics = true;
      }
      break;
    }

    default:
      break;
  }
}

// -------------------------------------------------------------------------
// SETUP
// -------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  ledcSetup(BL_PWM_CHANNEL, BL_PWM_FREQ, BL_PWM_RES);
  ledcAttachPin(TFT_BL_PIN, BL_PWM_CHANNEL);
  setBacklight(255);

  delay(200);
  Serial.println("\n[BOOT] Starting Desk Companion (Un-mirrored Engine)...");

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setTimeOut(10);
  Wire.beginTransmission(PCF8574_ADDR);
  pcf8574Present = (Wire.endTransmission() == 0);
  if (pcf8574Present) {
    Serial.println("[I2C] PCF8574 expander detected at 0x27");
  } else {
    Serial.println("[I2C] PCF8574 not detected (using direct GPIO button)");
  }

  pinMode(ENC_CLK_PIN, INPUT_PULLUP);
  pinMode(ENC_DT_PIN, INPUT_PULLUP);
  pinMode(ENC_SW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENC_CLK_PIN), encoderISR, FALLING);

  // Initialize hardware SPI and Adafruit display at 40MHz for flicker-free fast transfers
  spiBus.begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
  tft.begin(40000000);

  // Software reset sequence to clear any unaddressed display RAM
  tft.sendCommand(ILI9341_SWRESET);
  delay(150);
  tft.sendCommand(ILI9341_SLPOUT);
  delay(120);
  tft.sendCommand(ILI9341_DISPON);

  // Load preferences
  prefs.begin("desk_comp", false);

  // Display Inversion: Defaults to false (standard pitch-black OLED / dark theme)
  bool savedInv = prefs.getBool("inv", false);
  tft.invertDisplay(savedInv);
  Serial.printf("[BOOT] Display Inversion: %d\n", savedInv);

  int savedRot = prefs.getInt("rot", 0); // Default to Portrait mode 0
  applyOrientation(savedRot);

  state.screenMode = prefs.getString("screen", "now_playing");
  tft.fillScreen(ILI9341_BLACK);

  // -----------------------------------------------------------------------
  // Wi-Fi Credential Check
  // Uses saved credentials or falls back to test hotspot:
  // SSID: "LL", Password: "987654321"
  // -----------------------------------------------------------------------
  String ssid = prefs.getString("ssid", "LL");
  String pass = prefs.getString("pass", "987654321");

  // Safe boot-time force: use PCF8574 P4 only (not GPIO9 which is BOOT pin)
  bool forcePortal = readPCF8574Button();
  if (forcePortal) {
    Serial.println("[BOOT] PCF8574 button held! Forcing Wi-Fi Setup Portal...");
    prefs.remove("ssid");
    prefs.remove("pass");
    ssid = "";
  }

  if (ssid.length() == 0) {
    Serial.println("[WiFi] No saved Wi-Fi. Entering Provisioning Portal...");
    startProvisioningPortal();
    return;
  }

  tft.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(15, 60);
  tft.println("Connecting to:");
  tft.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
  tft.setCursor(15, 90);
  tft.println(ssid);

  // 1. Reset Wi-Fi hardware cleanly (turn off then set STA mode)
  WiFi.disconnect(true);
  delay(150);
  WiFi.mode(WIFI_STA);
  delay(100);

  // Prevent RF receiver saturation from close-range phone hotspot
  WiFi.setSleep(false);
  esp_wifi_set_ps(WIFI_PS_NONE);
  esp_wifi_set_max_tx_power(44); // 11 dBm (44 in 0.25 dBm units)

  // Register event listener for real-time diagnostic reporting
  lastDisconnectReason = 0;
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      lastDisconnectReason = info.wifi_sta_disconnected.reason;
      Serial.printf("\n[WiFi-Event] Disconnected! Reason: %d (%s)\n",
                    lastDisconnectReason, getWifiDisconnectReasonName(lastDisconnectReason));
      if (!isProvisioningMode) {
        wifiReconnectPending = true;
        nextWifiReconnectTime = millis() + 4000;
        Serial.println("[WiFi] Outage detected. Non-blocking auto-reconnect scheduled in 4s...");
      }
    } else if (event == ARDUINO_EVENT_WIFI_STA_CONNECTED) {
      wifiReconnectPending = false;
      Serial.printf("\n[WiFi-Event] Associated with AP! Channel: %d\n", info.wifi_sta_connected.channel);
    } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
      wifiReconnectPending = false;
      Serial.printf("\n[WiFi-Event] IP Assigned: %s\n", IPAddress(info.got_ip.ip_info.ip.addr).toString().c_str());
    }
  });

  Serial.printf("\n[WiFi] Connecting to '%s' (PMF=false, TX=11dBm)...\n", ssid.c_str());

  wifi_config_t conf;
  memset(&conf, 0, sizeof(conf));
  strncpy((char*)conf.sta.ssid, ssid.c_str(), sizeof(conf.sta.ssid) - 1);
  strncpy((char*)conf.sta.password, pass.c_str(), sizeof(conf.sta.password) - 1);
  conf.sta.channel = 0; // Scan all channels
  conf.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
  conf.sta.pmf_cfg.capable = false; // Prevents AUTH_EXPIRE (Reason 2) on Android/iOS hotspots
  conf.sta.pmf_cfg.required = false;

  esp_err_t confErr = esp_wifi_set_config(WIFI_IF_STA, &conf);
  esp_err_t connErr = esp_wifi_connect();
  Serial.printf("[WiFi] Config: %d, Connect: %d\n", (int)confErr, (int)connErr);

  uint32_t t0 = millis();
  int lastSec = -1;
  while (WiFi.status() != WL_CONNECTED && (millis() - t0 < 25000)) {
    int elapsed = (millis() - t0) / 1000;
    if (elapsed != lastSec) {
      lastSec = elapsed;
      tft.fillRect(15, 125, 290, 45, ILI9341_BLACK);
      tft.setTextColor(ILI9341_YELLOW, ILI9341_BLACK);
      tft.setTextSize(1);
      tft.setCursor(15, 125);
      tft.printf("Connecting... %ds / 25s", elapsed);
      if (lastDisconnectReason != 0) {
        tft.setCursor(15, 142);
        tft.setTextColor(ILI9341_ORANGE, ILI9341_BLACK);
        tft.printf("Status: %s (%d)", getWifiDisconnectReasonName(lastDisconnectReason), lastDisconnectReason);
      }
    }

    // Allow user to click rotary encoder knob during connection to abort to Portal
    if (digitalRead(ENC_SW_PIN) == LOW || readPCF8574Button()) {
      Serial.println("\n[WiFi] Knob pressed: aborting connection to enter Portal...");
      break;
    }

    delay(200);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("\n[WiFi] Could not connect to '%s'. Last Reason: %d (%s)\n",
                  ssid.c_str(), lastDisconnectReason, getWifiDisconnectReasonName(lastDisconnectReason));
    tft.fillRect(15, 125, 290, 60, ILI9341_BLACK);
    tft.setTextColor(ILI9341_RED, ILI9341_BLACK);
    tft.setTextSize(1);
    tft.setCursor(15, 125);
    tft.println("Could not connect to: " + ssid);
    tft.setCursor(15, 140);
    tft.setTextColor(ILI9341_ORANGE, ILI9341_BLACK);
    tft.printf("Reason: %d (%s)\n", lastDisconnectReason, getWifiDisconnectReasonName(lastDisconnectReason));
    tft.setCursor(15, 155);
    tft.setTextColor(ILI9341_LIGHTGREY, ILI9341_BLACK);
    tft.println("Starting Portal in 3s...");
    delay(3000);
    // CRITICAL: DO NOT ERASE PREFERENCES! We keep saved SSID and password in NVS!
    startProvisioningPortal();
    return;
  }

  Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  tft.fillRect(15, 125, 290, 50, ILI9341_BLACK);
  tft.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
  tft.setTextSize(2);
  tft.setCursor(15, 125);
  tft.println("CONNECTED!");
  tft.setTextSize(1);
  tft.setCursor(15, 150);
  tft.printf("IP: %s", WiFi.localIP().toString().c_str());
  delay(1200);

  if (MDNS.begin("desk-companion")) {
    MDNS.addService("ws", "tcp", 81);
    Serial.println("[mDNS] Responder started: desk-companion.local");
  }

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("[WS] WebSocket Server active on port 81");

  drawWaitingScreen();
}

// -------------------------------------------------------------------------
// LOOP
// -------------------------------------------------------------------------
void loop() {
  if (isProvisioningMode) {
    // Process multiple DNS requests per cycle to handle modern OS captive network bursts
    for (int i = 0; i < 4; i++) {
      dnsServer.processNextRequest();
    }
    server.handleClient();

    // Check USB Serial for direct provisioning commands: SET_WIFI:ssid,password or RESET_WIFI
    if (Serial.available()) {
      String line = Serial.readStringUntil('\n');
      line.trim();
      if (line.startsWith("SET_WIFI:")) {
        int comma = line.indexOf(',', 9);
        if (comma != -1) {
          String newSsid = line.substring(9, comma);
          String newPass = line.substring(comma + 1);
          newSsid.trim();
          newPass.trim();
          Serial.printf("\n[WiFi] USB Config received: SSID='%s'\n", newSsid.c_str());
          prefs.putString("ssid", newSsid);
          prefs.putString("pass", newPass);
          Serial.println("[WiFi] Saved! Restarting to connect...\n");
          delay(800);
          ESP.restart();
        }
      }
    }

    delay(2); // Crucial FreeRTOS yield: lets ESP32 Wi-Fi PHY & TCP stack process incoming packets and ACKs immediately
    return;
  }

  // Allow USB serial reset while running normally
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.equalsIgnoreCase("RESET_WIFI")) {
      prefs.remove("ssid");
      prefs.remove("pass");
      Serial.println("\n[WiFi] Erasing saved Wi-Fi and rebooting into Setup Portal...");
      delay(500);
      ESP.restart();
    }
  }

  // Non-blocking auto-reconnect on Wi-Fi drop/outage ONLY when disconnected
  if (wifiReconnectPending && millis() >= nextWifiReconnectTime) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiReconnectPending = false;
    } else {
      Serial.println("[WiFi] Re-attempting connection to Wi-Fi...");
      esp_wifi_connect();
      nextWifiReconnectTime = millis() + 8000;
    }
  }

  webSocket.loop();

  // 1. Rotary Encoder Rotation (Spotify Seek)
  if (encDelta != 0) {
    int delta = encDelta;
    encDelta = 0;

    localScrollOffset += delta * -12;
    if (localScrollOffset > 25) localScrollOffset = 25;
    if (localScrollOffset < -25) localScrollOffset = -25;

    // Instantly update local progressMs optimistically on device
    int32_t newPos = (int32_t)state.progressMs + (delta * 5000);
    if (newPos < 0) newPos = 0;
    if (newPos > (int32_t)state.durationMs) newPos = state.durationMs;
    state.progressMs = (uint32_t)newPos;
    state.lastProgressUpdateMs = millis();

    hudMessage = delta > 0 ? "Seek >> +5s" : "Seek << -5s";
    hudExpireTime = millis() + 1200;

    Serial.printf("[Encoder] Turned! Delta: %d, NewPos: %u ms\n", delta, state.progressMs);

    if (state.clientCount > 0) {
      char jsonBuf[64];
      snprintf(jsonBuf, sizeof(jsonBuf), "{\"type\":\"encoder\",\"id\":2,\"delta\":%d}", delta);
      webSocket.broadcastTXT(jsonBuf);
    }
    fullRedrawNeeded = true;
  }

  if (localScrollOffset != 0) {
    localScrollOffset = (int)(localScrollOffset * 0.8f);
  }

  // 2. Rotary Encoder Push Button
  static bool longPressHandled = false;

  if (millis() - lastBtnCheck >= 20) {
    lastBtnCheck = millis();

    bool directBtn = (digitalRead(ENC_SW_PIN) == LOW);
    bool pcfBtn = readPCF8574Button();
    bool btnPressed = directBtn || pcfBtn;

    if (btnPressed && lastBtnState == HIGH) {
      btnPressTime = millis();
      lastBtnState = LOW;
      longPressHandled = false;
    } else if (btnPressed && lastBtnState == LOW && !longPressHandled) {
      // Long press detection while held (> 600ms) -> CYCLE SCREEN MODE
      if (millis() - btnPressTime >= 600) {
        longPressHandled = true;

        if (state.screenMode == "lyrics") {
          state.screenMode = "now_playing";
        } else if (state.screenMode == "now_playing") {
          state.screenMode = "clock";
        } else {
          state.screenMode = "lyrics";
        }

        hudMessage = "Screen: " + state.screenMode;
        hudExpireTime = millis() + 1500;
        tft.fillScreen(ILI9341_BLACK);
        fullRedrawNeeded = true;

        Serial.printf("[Knob] Long Press: Cycled screen to %s\n", state.screenMode.c_str());

        if (state.clientCount > 0) {
          char buf[64];
          snprintf(buf, sizeof(buf), "{\"type\":\"screen\",\"screen\":\"%s\"}", state.screenMode.c_str());
          webSocket.broadcastTXT(buf);
        }
      }
    } else if (!btnPressed && lastBtnState == LOW) {
      uint32_t duration = millis() - btnPressTime;
      lastBtnState = HIGH;
      if (!longPressHandled && duration > 40 && duration < 600) {
        clickCount++;
        lastClickRelease = millis();
      }
      longPressHandled = false;
    }

    if (clickCount > 0 && (millis() - lastClickRelease > 280)) {
      if (clickCount == 1) {
        hudMessage = "Skip >> Next";
        hudExpireTime = millis() + 1000;
        if (state.clientCount > 0) webSocket.broadcastTXT("{\"type\":\"button\",\"id\":2,\"press\":\"single\"}");
      } else if (clickCount == 2) {
        hudMessage = "<< Prev Track";
        hudExpireTime = millis() + 1000;
        if (state.clientCount > 0) webSocket.broadcastTXT("{\"type\":\"button\",\"id\":2,\"press\":\"double\"}");
      } else if (clickCount >= 3) {
        hudMessage = "Mute Toggle";
        hudExpireTime = millis() + 1000;
        if (state.clientCount > 0) webSocket.broadcastTXT("{\"type\":\"button\",\"id\":1,\"action\":\"mute_toggle\"}");
      }
      clickCount = 0;
      fullRedrawNeeded = true;
    }
  }

  // Clear HUD message upon expiration to cleanly erase ghost boxes
  if (hudMessage.length() > 0 && millis() >= hudExpireTime) {
    hudMessage = "";
    fullRedrawNeeded = true;
  }

  // 3. Display Refresh
  if (millis() - lastTftUpdate >= 50) {
    lastTftUpdate = millis();

    if (state.clientCount == 0) {
      if (fullRedrawNeeded) {
        drawWaitingScreen();
        fullRedrawNeeded = false;
      }
    } else {
      if (state.screenMode == "now_playing") {
        if (fullRedrawNeeded) {
          drawNowPlayingView(true);
          drawFooter(true);
          fullRedrawNeeded = false;
        }
      } else if (state.screenMode == "clock") {
        if (fullRedrawNeeded) {
          drawClockView(true);
          // Clock mode has no footer progress bar
          fullRedrawNeeded = false;
        }
      } else { // "lyrics" mode
        if (fullRedrawNeeded) {
          drawHeader();
          drawLyricsView(true);
          drawFooter(true);
          fullRedrawNeeded = false;
        } else if (lyricsChanged) {
          drawLyricsView(false);
          lyricsChanged = false;
        }
      }

      static uint32_t lastFooter = 0;
      if (state.screenMode != "clock" && millis() - lastFooter >= 400) {
        lastFooter = millis();
        drawFooter(false);
      }
    }
  }

  yield();
}
