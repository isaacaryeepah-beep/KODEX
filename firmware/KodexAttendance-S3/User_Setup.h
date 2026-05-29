// ─────────────────────────────────────────────────────────────────────────────
//  TFT_eSPI User Setup — ESP32-S3 + ILI9341 2.8" IPS
//  Manufacturer: Shenzhen Hong Shu Yuan Technology Co., Ltd. (ES3C28P)
//
//  Place this file alongside KodexAttendance-S3.ino — do NOT edit the copy
//  in the TFT_eSPI library folder.
//
//  I2C (touch FT6X36): SCL = IO15, SDA = IO16  (from board silkscreen)
//  Backlight:          GPIO 45  (confirmed working)
//
//  ── PIN CONFIGS TO TRY IF SCREEN IS BLANK ─────────────────────────────────
//  Enable ONE config block below, recompile and flash.
//  Config A is the most common for this board family.
// ─────────────────────────────────────────────────────────────────────────────

#define USER_SETUP_LOADED
#define ILI9341_DRIVER

// ══════════════════════════════════════════════════════
//  CONFIG A — try this first (CS/DC on 9/10 swapped)
// ══════════════════════════════════════════════════════
#define TFT_MISO  13
#define TFT_MOSI  11
#define TFT_SCLK  12
#define TFT_CS     9    // CS  on GPIO 9
#define TFT_DC    10    // DC  on GPIO 10
#define TFT_RST   -1    // RST tied to EN pin — use software reset
#define TFT_BL    45

// ── If CONFIG A still blank, comment it out and uncomment CONFIG B ──────────
// CONFIG B
//#define TFT_MISO  13
//#define TFT_MOSI  11
//#define TFT_SCLK  12
//#define TFT_CS    10
//#define TFT_DC     8
//#define TFT_RST   -1
//#define TFT_BL    45

// ── If CONFIG B still blank, try CONFIG C ───────────────────────────────────
// CONFIG C
//#define TFT_MISO   9
//#define TFT_MOSI   6
//#define TFT_SCLK   5
//#define TFT_CS     4
//#define TFT_DC     7
//#define TFT_RST    8
//#define TFT_BL    45

// ────────────────────────────────────────────────────────────────────────────

#define SPI_FREQUENCY       40000000
#define SPI_READ_FREQUENCY  20000000

#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_FONT6
#define LOAD_FONT7
#define LOAD_FONT8
#define LOAD_GFXFF
#define SMOOTH_FONT
