// ─────────────────────────────────────────────────────────────────────────────
//  TFT_eSPI User Setup — ESP32-S3 + ILI9341 2.8" IPS
//  Manufacturer: Shenzhen Hong Shu Yuan Technology Co., Ltd. (ES3C28P / TE066)
//
//  IMPORTANT: Copy this file into your TFT_eSPI library folder OR place it
//  alongside the .ino and define USER_SETUP_LOADED before the include.
//
//  I2C (touch FT6X36): SCL = IO15, SDA = IO16  (confirmed from board silkscreen)
//  SD card CS:         IO38                      (typical for this board family)
//  Display SPI below confirmed for this board.
// ─────────────────────────────────────────────────────────────────────────────

#define USER_SETUP_LOADED   // Tell TFT_eSPI this file is loaded

// Driver
#define ILI9341_DRIVER

// ── SPI Display Pins ──────────────────────────────────────────────────────────
#define TFT_MISO  13
#define TFT_MOSI  11
#define TFT_SCLK  12
#define TFT_CS    10    // Chip select
#define TFT_DC     8    // Data/Command
#define TFT_RST    9    // Reset (-1 if tied to ESP reset)
#define TFT_BL    45    // Backlight control (GPIO 45 on ES3C28P)

// ── SPI Speed ─────────────────────────────────────────────────────────────────
#define SPI_FREQUENCY       40000000
#define SPI_READ_FREQUENCY  20000000

// ── Fonts (load all — flash is large enough on S3) ───────────────────────────
#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_FONT6
#define LOAD_FONT7   // 7-segment style — used for the attendance code
#define LOAD_FONT8
#define LOAD_GFXFF
#define SMOOTH_FONT
