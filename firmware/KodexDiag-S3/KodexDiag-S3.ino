/**
 * Dikly ES3C28P — Minimal Diagnostic Sketch
 *
 * PURPOSE: Confirm that (a) firmware runs at all, (b) GPIO 45 is the backlight,
 * (c) the ILI9341 responds to SPI on the Config B pins (CS=10, DC=8).
 *
 * NO TFT_eSPI library needed — uses raw SPI so there is nothing to misconfigure.
 *
 * WHAT TO OBSERVE
 *   Backlight blinks 3× slowly then stays ON  →  firmware is running, GPIO 45 confirmed
 *   Serial Monitor shows "SPI sent OK"         →  SPI bus is alive
 *   Screen shows a solid colour                →  display wired correctly
 *
 * If backlight never blinks → firmware not running (wrong board, failed upload,
 * or global constructor crash — check Tools → Board = "ESP32S3 Dev Module").
 */

#include <Arduino.h>
#include <SPI.h>

// ── Pin assignments (Config B) ────────────────────────────────────────────────
#define PIN_BL    45   // backlight
#define PIN_MOSI  11
#define PIN_MISO  13
#define PIN_SCLK  12
#define PIN_CS    10   // display chip-select
#define PIN_DC     8   // data/command
#define PIN_RST   -1   // tied to EN

// ── ILI9341 command helpers ───────────────────────────────────────────────────
static void csLow()  { digitalWrite(PIN_CS, LOW);  }
static void csHigh() { digitalWrite(PIN_CS, HIGH); }
static void dcCmd()  { digitalWrite(PIN_DC, LOW);  }
static void dcData() { digitalWrite(PIN_DC, HIGH); }

static void writeCmd(uint8_t cmd) {
  csLow(); dcCmd();
  SPI.transfer(cmd);
  csHigh();
}

static void writeCmdData(uint8_t cmd, const uint8_t* data, size_t len) {
  csLow(); dcCmd();
  SPI.transfer(cmd);
  dcData();
  for (size_t i = 0; i < len; i++) SPI.transfer(data[i]);
  csHigh();
}

static void ili9341Init() {
  // Hard reset (if RST pin available)
  if (PIN_RST >= 0) {
    pinMode(PIN_RST, OUTPUT);
    digitalWrite(PIN_RST, LOW); delay(10);
    digitalWrite(PIN_RST, HIGH); delay(120);
  }

  writeCmd(0x01); delay(150);  // software reset
  writeCmd(0x11); delay(120);  // sleep out

  uint8_t d1[] = {0x55};       // pixel format: 16-bit (RGB565)
  writeCmdData(0x3A, d1, 1);

  uint8_t d2[] = {0x00, 0x00, 0x00, 0xEF}; // row addr 0–239
  writeCmdData(0x2A, d2, 4);
  uint8_t d3[] = {0x00, 0x00, 0x01, 0x3F}; // col addr 0–319
  writeCmdData(0x2B, d3, 4);

  writeCmd(0x29);              // display on
  Serial.println("[Diag] ILI9341 init sent");
}

// Fill screen with a solid RGB565 colour.
static void fillScreen(uint16_t colour) {
  uint8_t caset[] = {0x00, 0x00, 0x00, 0xEF};
  uint8_t paset[] = {0x00, 0x00, 0x01, 0x3F};
  writeCmdData(0x2A, caset, 4);
  writeCmdData(0x2B, paset, 4);

  csLow(); dcCmd(); SPI.transfer(0x2C); dcData(); // RAMWR
  uint8_t hi = colour >> 8, lo = colour & 0xFF;
  for (uint32_t i = 0; i < 240UL * 320UL; i++) {
    SPI.transfer(hi); SPI.transfer(lo);
  }
  csHigh();
  Serial.println("[Diag] fillScreen done");
}

// ── Arduino entry points ──────────────────────────────────────────────────────
void setup() {
  // 1. Backlight FIRST — blink 3× so we know firmware started
  pinMode(PIN_BL, OUTPUT);
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_BL, HIGH); delay(300);
    digitalWrite(PIN_BL, LOW);  delay(300);
  }
  digitalWrite(PIN_BL, HIGH);  // leave on

  Serial.begin(115200); delay(100);
  Serial.println("\n[Diag] Dikly ES3C28P diagnostic — firmware running");

  // 2. SPI bus init
  pinMode(PIN_CS, OUTPUT); digitalWrite(PIN_CS, HIGH);
  pinMode(PIN_DC, OUTPUT); digitalWrite(PIN_DC, HIGH);
  SPI.begin(PIN_SCLK, PIN_MISO, PIN_MOSI, PIN_CS);
  SPI.beginTransaction(SPISettings(20000000, MSBFIRST, SPI_MODE0));
  Serial.println("[Diag] SPI init done");

  // 3. Display init + fill red
  ili9341Init();
  fillScreen(0xF800);  // red — confirms display is wired correctly
}

void loop() {
  // Cycle colours every 2 s so we know loop() is running too
  static uint32_t last = 0;
  static uint8_t  step = 0;
  if (millis() - last > 2000) {
    last = millis();
    uint16_t colours[] = {0xF800, 0x07E0, 0x001F, 0xFFFF}; // red, green, blue, white
    fillScreen(colours[step % 4]);
    step++;
  }
}
