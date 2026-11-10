// =========================================================================
// TFT_eSPI User Setup for ESP32-C3 SuperMini + 2.8" SPI TFT (3-Wire Setup)
// =========================================================================

#ifndef USER_SETUP_ESP32C3_3WIRE_TFT_H
#define USER_SETUP_ESP32C3_3WIRE_TFT_H

#define USER_SETUP_INFO "User_Setup_ESP32C3_3Wire_TFT"

// Driver definition (ILI9341 is standard for 2.8" SPI TFT 240x320)
// If your display uses ST7789, comment ILI9341_DRIVER and uncomment ST7789_DRIVER
#define ILI9341_DRIVER
// #define ST7789_DRIVER

#define TFT_WIDTH  240
#define TFT_HEIGHT 320

// -------------------------------------------------------------------------
// 3-Wire SPI Pin Mapping for ESP32-C3 SuperMini
// -------------------------------------------------------------------------
// SCL (SCK)  -> GPIO 4
// SDA (MOSI) -> GPIO 6
// DC (RS)    -> GPIO 7
// CS         -> Hardwired to GND  (-1)
// RST        -> Hardwired to EN   (-1)
// MISO (SDO) -> Disconnected      (-1)
// -------------------------------------------------------------------------

#define TFT_MISO -1
#define TFT_MOSI 6
#define TFT_SCLK 4
#define TFT_CS   -1
#define TFT_DC   7
#define TFT_RST  -1

// Fonts
#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_FONT6
#define LOAD_FONT7
#define LOAD_FONT8
#define LOAD_GFXFF
#define SMOOTH_FONT

// SPI frequency (27MHz is standard and reliable for ILI9341/ST7789 on ESP32)
#define SPI_FREQUENCY  27000000
#define SPI_READ_FREQUENCY  20000000

#endif // USER_SETUP_ESP32C3_3WIRE_TFT_H
