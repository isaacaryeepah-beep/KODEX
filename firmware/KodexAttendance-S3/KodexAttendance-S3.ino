/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Dikly Attendance — ESP32-S3 Classroom Device Firmware
 *  Target: ESP32-S3 + ILI9341 2.8" IPS 240×320 Colour Touchscreen (CTP)
 *  SKU: ES3C28P
 *
 *  WHAT THIS DOES
 *  ─────────────
 *  • On first boot, runs a captive-portal AP "Dikly-XXXXXX". Open
 *    192.168.4.1 on your phone, enter institution code + pairing code
 *    from the admin portal, and your school WiFi credentials.
 *  • Calls POST /api/devices/pair → saves a long-lived device JWT in NVS.
 *  • Sends heartbeats every 5 s → receives active session info.
 *  • Derives the rotating 6-digit attendance code locally using HMAC-SHA256
 *    (same formula as the backend). No per-rotation round-trip.
 *  • Shows a slick full-colour UI:
 *      SPLASH → SETUP → CONNECTING → READY (idle) → SESSION (code display)
 *
 *  REQUIRED LIBRARIES (Arduino IDE → Library Manager)
 *    LovyanGFX       — colour display driver (lovyan03)
 *    ArduinoJson     — JSON (≥ 7.0)
 *  Built into ESP32 core: WiFi, HTTPClient, WebServer, DNSServer,
 *                         Preferences, mbedtls, SD
 *
 *  SD CARD (SDIO bus on ES3C28P)
 *    CLK=IO38  CMD=IO40  DATA0-3=IO39/41/48/47
 *
 *  TOUCH CONTROLLER (FT6336G capacitive, I2C)
 *    SDA: IO16   SCL: IO15   INT: IO17   RST: IO18
 *
 *  CODE ROTATION FORMULA (mirrors src/services/attendanceCodeService.js)
 *    slot   = floor(unixSeconds / 300)      // 5-minute window
 *    digest = HMAC-SHA256(seed, ascii(slot))
 *    code   = zero-pad(uint32(digest[0..3]) % 1_000_000, 6)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// FS must be included first — ESP32 core 3.x puts FS in the fs:: namespace,
// and WebServer.h expects the unqualified 'FS' name. Including FS.h first
// and pulling it into the global namespace fixes the WebServer.h compile error.
#include <FS.h>
using namespace fs;

// ─── Display driver — LovyanGFX ──────────────────────────────────────────────
#define LGFX_USE_V1
#include <LovyanGFX.hpp>

class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ILI9341 _panel;
  lgfx::Bus_SPI       _bus;
  lgfx::Light_PWM     _light;
public:
  LGFX() {
    { auto cfg = _bus.config();
      cfg.spi_host    = SPI2_HOST;   // FSPI — correct for MOSI=11, MISO=13, SCLK=12
      cfg.spi_mode    = 0;
      cfg.freq_write  = 40000000;
      cfg.freq_read   = 16000000;
      cfg.pin_sclk    = 12;
      cfg.pin_mosi    = 11;
      cfg.pin_miso    = 13;
      cfg.pin_dc      = 46;
      cfg.dma_channel = 0;            // no SPI DMA — frees ~4 KB DMA SRAM for WiFi
      _bus.config(cfg); _panel.setBus(&_bus); }
    { auto cfg = _panel.config();
      cfg.pin_cs      = 10;
      cfg.pin_rst     = -1;
      cfg.invert      = true;   // ES3C28P ILI9341 requires colour inversion
      cfg.memory_width  = 240; cfg.memory_height = 320;
      cfg.panel_width   = 240; cfg.panel_height  = 320;
      _panel.config(cfg); }
    { auto cfg = _light.config();
      cfg.pin_bl = 45; cfg.invert = false;
      _light.config(cfg); _panel.setLight(&_light); }
    setPanel(&_panel);
  }
};

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Wire.h>
#include <time.h>
#include <mbedtls/md.h>
#include <mbedtls/platform.h>   // mbedtls_platform_set_calloc_free
#include <ArduinoJson.h>
#include <SPI.h>
#include <SD_MMC.h>   // SDIO driver — separate peripheral from SPI, no bus conflict
#include <BLEDevice.h>
#include <BLEAdvertising.h>
#include <esp_bt.h>        // esp_bt_controller_mem_release
#include <esp_wifi.h>      // esp_wifi_stop / esp_wifi_deinit for hard reset
#include <ESPmDNS.h>       // dikly.local hostname on both AP and STA networks
#include "lwip/etharp.h"   // ARP table for IP→MAC→RSSI mapping

// Forward declarations
static void startWifiReconfigPortal();
static void drawPairStatus(const char* title, const char* line1, const char* line2, uint8_t step);

// ─── Pin / Hardware Config ───────────────────────────────────────────────────
// Confirmed from board silkscreen (Shenzhen Hong Shu Yuan ES3C28P):
//   I2C header: IO15 = SCL, IO16 = SDA
static const uint8_t TOUCH_SDA  = 16;
static const uint8_t TOUCH_SCL  = 15;
static const uint8_t TOUCH_INT  = 17;
static const uint8_t TOUCH_RST  = 18;
static const uint8_t LED_PIN    = 42;  // single-wire RGB LED on IO42
static const uint8_t FT6X36_ADDR = 0x38;

// SD card — SDIO bus (independent from FSPI/display, no conflict)
static const uint8_t SD_CLK = 38, SD_CMD = 40, SD_D0 = 39;
static const uint8_t SD_D1  = 41, SD_D2  = 48, SD_D3 = 47;

// ─── App Config ──────────────────────────────────────────────────────────────
static const char*   FIRMWARE_VERSION     = "s3-2.1.0";
static const char*   DEFAULT_API_BASE     = "https://dikly.sbs";
static const uint32_t HEARTBEAT_MS        = 5000;
static const uint32_t WIFI_TIMEOUT_MS     = 30000;
static const uint32_t WINDOW_SECONDS      = 120;  // code rotation period (2 minutes)

// ─── Theme selector ──────────────────────────────────────────────────────────
// Change THEME to switch the whole UI colour scheme without touching anything else.
//   1 = Indigo  — dark navy background, indigo/violet accents  (default)
//   2 = Cyan    — pure black OLED, electric cyan accents       (high contrast)
//   3 = Emerald — deep forest green background, lime accents   (nature)
//   4 = Amber   — dark warm maroon background, golden accents  (warm)
#define THEME 1

// ─── Colour Palette (RGB565) ─────────────────────────────────────────────────
#if THEME == 1   // ── Blue (matches mockup) ───────────────────────────────────
#define COL_BG        0x0841   // dark navy   #0f172a
#define COL_CARD      0x10A2   // dark card   #1a2038
#define COL_BORDER    0x2965   // border      #334d78
#define COL_PRIMARY   0x243F   // royal blue  #2188F8
#define COL_SUCCESS   0x2764   // green       #22c55e
#define COL_WARNING   0xFD00   // amber       #f59e0b
#define COL_ERROR     0xE904   // red         #ef4444
#define COL_TEXT      0xFFFF   // white       #ffffff
#define COL_MUTED     0x8430   // muted text  #94a3b8
#define COL_DIM_CARD  0x0C62

#elif THEME == 2  // ── Cyan / OLED high-contrast ───────────────────────────
#define COL_BG        0x0000   // pure black
#define COL_CARD      0x0842   // very dark grey
#define COL_BORDER    0x2945   // medium grey
#define COL_PRIMARY   0x07FF   // electric cyan
#define COL_SUCCESS   0x07E0   // bright green
#define COL_WARNING   0xFEA0   // orange
#define COL_ERROR     0xF800   // red
#define COL_TEXT      0xFFFF   // white
#define COL_MUTED     0x7BEF   // light grey
#define COL_DIM_CARD  0x0421

#elif THEME == 3  // ── Emerald / Forest ────────────────────────────────────
#define COL_BG        0x0220   // deep forest green
#define COL_CARD      0x0440   // dark green card
#define COL_BORDER    0x0880   // medium green border
#define COL_PRIMARY   0x07E0   // bright green
#define COL_SUCCESS   0xAFE5   // lime
#define COL_WARNING   0xFD20   // orange
#define COL_ERROR     0xF800   // red
#define COL_TEXT      0xE71C   // light text
#define COL_MUTED     0x7BE0   // muted green
#define COL_DIM_CARD  0x0340

#elif THEME == 4  // ── Amber / Warm ────────────────────────────────────────
#define COL_BG        0x1800   // dark maroon
#define COL_CARD      0x2800   // dark red-brown card
#define COL_BORDER    0x4000   // medium warm border
#define COL_PRIMARY   0xFD20   // orange-gold
#define COL_SUCCESS   0xFEA0   // gold
#define COL_WARNING   0xFF80   // bright amber
#define COL_ERROR     0xF800   // red
#define COL_TEXT      0xFFE0   // warm white
#define COL_MUTED     0xC580   // muted warm
#define COL_DIM_CARD  0x2000
#endif

#define COL_WHITE     0xFFFF
#define COL_BLACK     0x0000
#define COL_CYAN      0x07FF  // electric cyan  #00ffff
#define COL_SURFACE   0x18E3  // elevated card  #192030
#define COL_INDIGO    0x4819  // indigo         #481990
#define COL_TEAL      0x0493  // teal           #049390

// ─── Font shortcuts (LovyanGFX built-in vector fonts) ────────────────────────
#define F_TINY   (&lgfx::fonts::DejaVu9)
#define F_SMALL  (&lgfx::fonts::DejaVu18)
#define F_MED    (&lgfx::fonts::DejaVu24)
#define F_LARGE  (&lgfx::fonts::DejaVu40)
#define F_LOGO   (&lgfx::fonts::Orbitron_Light_24)
#define F_LOGO_L (&lgfx::fonts::Orbitron_Light_32)

// Screen dimensions
#define SW 240
#define SH 320

// ─── Globals ─────────────────────────────────────────────────────────────────
LGFX         display;
LGFX_Sprite  spr(&display);   // full-screen sprite for flicker-free render

Preferences prefs;
WebServer   localHttp(80);
DNSServer   dns;

String wifiSSID, wifiPass, deviceId, deviceJWT, apiBase, institutionCode;
int8_t rssiThreshold = -70;  // dBm — students weaker than this are rejected

// Active session (from heartbeat)
String   sessionId, sessionTitle, sessionSeed, sessionCourse, sessionLecturer;
uint32_t sessionStartedAt = 0;
uint32_t sessionDuration  = 300;
uint32_t studentsMarked       = 0;
uint32_t sessionTotalEnrolled = 0;   // parsed from heartbeat totalEnrolled
uint32_t lastSyncMs           = 0;   // millis() at last successful heartbeat

// ─── Session summary (saved on session end) ──────────────────────────────────
uint32_t summaryTotal   = 0;
uint32_t summaryPresent = 0;
float    summaryPct     = 0.0f;
String   summaryCourse  = "";
uint8_t  curBrightness  = 255;   // display backlight (0-255)

uint32_t lastHbMs    = 0;
uint8_t  hbFails     = 0;
bool     timeSynced  = false;
bool     forceReconn = false;
bool     sessionLocallyStarted = false;  // true when session was started on-device (no internet)

// BLE beacon state
static BLEAdvertising *bleAdv  = nullptr;
static uint32_t        bleSlot = UINT32_MAX;   // slot currently on-air

// Async pairing (avoids iOS captive-portal dropping the fetch before we respond)
bool     pairPending     = false;
String   pairPendingInst = "";
String   pairPendingCode = "";

// Screen state machine
enum Screen { SPLASH, SETUP, WIFI_SCAN, WIFI_RECONFIG, CONNECTING, READY, SESSION_START, SESSION, SUMMARY, SETTINGS, DEVICE_INFO, PAIR_SCREEN };
Screen curScreen = SPLASH;
String statusMsg = "";
uint32_t splashStart = 0;

// Touch state
bool     touchActive  = false;
uint16_t touchX = 0, touchY = 0;
uint32_t touchDownMs  = 0;
bool     touchHandled = false;   // prevents hold-repeat firing as a tap
static String touchDiag = "Touch: scanning...";  // shown on Setup screen

// ─── WiFi scanner ─────────────────────────────────────────────────────────────
struct WifiNet { char ssid[33]; int8_t bars; bool open; };
static WifiNet  wifiNets[20];
static uint8_t  wifiNetCount = 0;
static int8_t   wifiScroll   = 0;
static bool     wifiScanning = false;
static String   wifiMsg      = "";
static String   pendingSsid  = "";   // network tapped, waiting for password

// ─── Offline Attendance Storage ──────────────────────────────────────────────
// Primary: append JSON lines to /attendance.jsonl on the built-in SD card.
// Fallback: fixed 200-slot RAM buffer (used if SD is absent or fails to init).
// Records are flushed to /api/devices/sync on the next successful heartbeat.
static const char* SD_ATT_FILE = "/attendance.jsonl";

// SD_MMC (SDIO): tries 4-bit first, falls back to 1-bit if card rejects it.
static bool        sdAvailable  = false;
static uint32_t    sdRecordCount = 0;  // tracks records written to SD file

struct OfflineRec {
  char indexNumber[32];
  char userId[32];
  char code[8];
  char sessionId[48];
  char courseId[16];
  uint32_t ts;
};
// Allocated from PSRAM in setup() via heap_caps_calloc to free ~38 KB of
// internal DRAM for WiFi's task stack and rx buffer pool.
static OfflineRec* offlineBuf  = nullptr;
static uint8_t     offlineCount = 0;

// ─── Per-session duplicate guard ─────────────────────────────────────────────
static char (*dedupIds)[32] = nullptr;  // 400 × 32, allocated from PSRAM in setup()
static uint16_t dedupCount   = 0;
static String   dedupSession = "";   // session this list belongs to

static void dedupClear(const String& sid) {
  dedupCount = 0;
  dedupSession = sid;
}

// Returns true if this identifier has already been seen in the current session.
static bool dedupCheck(const char* id) {
  if (!dedupIds || !id || id[0] == '\0') return false;
  for (uint16_t i = 0; i < dedupCount; i++)
    if (strncmp(dedupIds[i], id, 31) == 0) return true;
  return false;
}

static void dedupAdd(const char* id) {
  if (!dedupIds || !id || id[0] == '\0' || dedupCount >= 400) return;
  strncpy(dedupIds[dedupCount++], id, 31);
  dedupIds[dedupCount - 1][31] = '\0';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
#define LOG(s) do { Serial.print("[Dikly] "); Serial.println(s); } while(0)

static String macSuffix() {
  char b[7]; snprintf(b, sizeof(b), "%06X", (uint32_t)(ESP.getEfuseMac() & 0xFFFFFF));
  return String(b);
}

static void hmacSha256(const uint8_t* key, size_t kl,
                       const uint8_t* msg, size_t ml, uint8_t out[32]) {
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx; mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, key, kl);
  mbedtls_md_hmac_update(&ctx, msg, ml);
  mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);
}

static String deriveCode(const String& seed, uint32_t unixSec) {
  uint32_t slot = unixSec / WINDOW_SECONDS;
  String slotStr = String((unsigned long)slot);
  uint8_t digest[32];
  hmacSha256((const uint8_t*)seed.c_str(), seed.length(),
             (const uint8_t*)slotStr.c_str(), slotStr.length(), digest);
  uint32_t n = ((uint32_t)digest[0] << 24) | ((uint32_t)digest[1] << 16) |
               ((uint32_t)digest[2] <<  8) |  (uint32_t)digest[3];
  char buf[8]; snprintf(buf, sizeof(buf), "%06lu", (unsigned long)(n % 1000000UL));
  return String(buf);
}

// ── BLE BEACON ──────────────────────────────────────────────────────────────
// Broadcasts a 30-second slot-bound HMAC token so student apps can verify
// physical proximity. Payload (manufacturer data, 16 bytes):
//   [0-1] company ID 0xFFFF (unregistered/test)
//   [2-3] magic 'K' 'D'
//   [4-7] slot (uint32, little-endian)  slot = floor(unixSeconds / 30)
//   [8-15] HMAC-SHA256(sessionSeed, "ble:<slot>") first 8 bytes
// Backend re-derives the HMAC using session.esp32Seed and rejects stale slots.

static void initBle() {
  // ESP32-S3 Arduino core 3.x (ESP-IDF 5.x) races the NimBLE HCI transport
  // init against the WiFi driver's background tasks when both are started in
  // rapid succession. The race logs "hci inits failed" / "nimble host init
  // failed" and silently breaks BLE advertising. A 200 ms yield after
  // esp_wifi_init() lets WiFi's tasks settle before NimBLE registers its
  // HCI callbacks, eliminating the race.
  delay(200);
  BLEDevice::init(("Dikly-" + macSuffix()).c_str());
  bleAdv = BLEDevice::getAdvertising();
  LOG("BLE init OK");
}

static void bleUpdatePayload() {
  if (!bleAdv || sessionId.isEmpty() || sessionSeed.isEmpty() || !timeSynced) return;

  uint32_t slot = (uint32_t)(time(nullptr) / 30);
  if (slot == bleSlot) return;   // slot unchanged — nothing to do
  bleSlot = slot;

  char slotMsg[20];
  snprintf(slotMsg, sizeof(slotMsg), "ble:%lu", (unsigned long)slot);
  uint8_t hmacOut[32];
  hmacSha256((const uint8_t*)sessionSeed.c_str(), sessionSeed.length(),
             (const uint8_t*)slotMsg, strlen(slotMsg), hmacOut);

  uint8_t buf[16];
  buf[0] = 0xFF; buf[1] = 0xFF;          // company ID (unregistered)
  buf[2] = 0x4B; buf[3] = 0x44;          // magic 'K' 'D'
  buf[4] = slot        & 0xFF;
  buf[5] = (slot >> 8) & 0xFF;
  buf[6] = (slot >>16) & 0xFF;
  buf[7] = (slot >>24) & 0xFF;
  memcpy(buf + 8, hmacOut, 8);

  // Build Arduino String byte-by-byte so null bytes in the slot field are preserved
  String mfg;
  mfg.reserve(sizeof(buf));
  for (size_t i = 0; i < sizeof(buf); i++) mfg += (char)buf[i];

  bleAdv->stop();
  BLEAdvertisementData adv;
  adv.setFlags(0x06);                    // LE General Discoverable, no BR/EDR
  adv.setManufacturerData(mfg);
  bleAdv->setAdvertisementData(adv);
  bleAdv->setMinInterval(320);           // ~200 ms  (units: 0.625 ms)
  bleAdv->setMaxInterval(480);           // ~300 ms
  bleAdv->start();
  LOG("BLE slot=" + String(slot));
}

static void bleStop() {
  if (bleAdv && bleSlot != UINT32_MAX) {
    bleAdv->stop();
    bleSlot = UINT32_MAX;
    LOG("BLE stopped");
  }
}

// ─── Touch (FT6X36 capacitive, I2C) ──────────────────────────────────────────
// Confirmed chip: FT6336G on ES3C28P board.
// I2C: SDA=16, SCL=15. RST=18, INT=17.
// Standard address 0x38; auto-scan fallback catches mis-documented variants.

static uint8_t touchAddr = FT6X36_ADDR;  // updated by touchInit scan

static void touchInit() {
  // Datasheet-confirmed: RST=IO18 (active LOW), INT=IO17
  if (TOUCH_RST >= 0) {
    pinMode(TOUCH_RST, OUTPUT);
    digitalWrite(TOUCH_RST, LOW);  delay(50);   // hold reset longer for cold-boot
    digitalWrite(TOUCH_RST, HIGH); delay(500);  // FT6336G needs ~300 ms; give extra margin
  }
  if (TOUCH_INT >= 0) pinMode(TOUCH_INT, INPUT_PULLUP);

  // Datasheet confirms: SDA=IO16, SCL=IO15. Other pairs are fallback for board variants.
  // Try each pin pair at both 100 kHz and 400 kHz — some FT6336G only respond at 100 kHz.
  const uint8_t PAIRS[][2] = {
    { 16, 15 },  // confirmed by ES3C28P datasheet
    { 15, 16 },  // swapped (just in case)
    {  4,  5 },
    {  6,  7 },
    {  8,  9 },
    { 21, 22 },
  };
  const uint32_t CLOCKS[] = { 100000, 400000 };
  const uint8_t  KNOWN[]  = { 0x38, 0x3B, 0x15, 0x14, 0x5D };

  for (auto& p : PAIRS) {
    for (uint32_t clk : CLOCKS) {
      Wire.end(); delay(10);
      Wire.begin(p[0], p[1]); Wire.setClock(clk); delay(50);
      for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() != 0) continue;
        for (uint8_t k : KNOWN) {
          if (addr == k) {
            touchAddr = addr;
            touchDiag = "Touch SDA=" + String(p[0]) +
                        " SCL=" + String(p[1]) +
                        " @0x" + String(addr, HEX) +
                        " " + String(clk / 1000) + "kHz";
            LOG("[touch] " + touchDiag);
            return;  // Wire stays on the working pins + speed
          }
        }
        // Non-known address — record for display but keep searching
        touchDiag = "I2C 0x" + String(addr, HEX) +
                    " SDA=" + String(p[0]) + " SCL=" + String(p[1]) +
                    " " + String(clk / 1000) + "kHz";
      }
    }
  }
  // Nothing found — restore confirmed-correct pins at 100 kHz
  Wire.end(); Wire.begin(16, 15); Wire.setClock(100000);
  if (!touchDiag.startsWith("I2C"))
    touchDiag = "No touch chip found";
  LOG("[touch] " + touchDiag);
}

// Returns true if a finger is down; writes screen-mapped coordinates to tx, ty.
static bool touchRead(uint16_t& tx, uint16_t& ty) {
  Wire.beginTransmission(touchAddr);
  Wire.write(0x02);  // TD_STATUS register
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom((uint8_t)touchAddr, (uint8_t)6);
  if (Wire.available() < 6) return false;

  uint8_t td = Wire.read();                          // touch count
  uint8_t xh = Wire.read(); uint8_t xl = Wire.read();
  uint8_t yh = Wire.read(); uint8_t yl = Wire.read();
  Wire.read();  // weight/misc

  if ((td & 0x0F) == 0) return false;

  // FT6336G on ES3C28P: chip reports X/Y in portrait panel orientation.
  // The debug dot drawn by drawSetup() will show where the chip thinks you
  // touched — use that to confirm axis direction and swap if needed.
  // Current mapping: direct (no swap). If dot appears mirrored, swap rawX/rawY.
  // If dot appears upside-down, change to:  tx=rawX; ty=(SH-1)-rawY;
  uint16_t rawX = ((xh & 0x0F) << 8) | xl;
  uint16_t rawY = ((yh & 0x0F) << 8) | yl;
  tx = rawX;
  ty = (SH - 1) - rawY;  // invert Y — touch chip reports upside-down relative to display
  return true;
}

// ─── WiFi scanner ────────────────────────────────────────────────────────────
static void doWifiScan() {
  wifiScanning = true; wifiMsg = ""; wifiNetCount = 0; wifiScroll = 0;
  WiFi.mode(WIFI_STA);
  int n = WiFi.scanNetworks();
  for (int i = 0; i < n && wifiNetCount < 20; i++) {
    // Deduplicate by SSID
    bool dup = false;
    for (uint8_t j = 0; j < wifiNetCount; j++)
      if (strncmp(wifiNets[j].ssid, WiFi.SSID(i).c_str(), 32) == 0) { dup = true; break; }
    if (dup || WiFi.SSID(i).isEmpty()) continue;
    int32_t rssi = WiFi.RSSI(i);
    strncpy(wifiNets[wifiNetCount].ssid, WiFi.SSID(i).c_str(), 32);
    wifiNets[wifiNetCount].ssid[32] = '\0';
    wifiNets[wifiNetCount].bars = rssi > -60 ? 4 : rssi > -75 ? 3 : rssi > -85 ? 2 : 1;
    wifiNets[wifiNetCount].open = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
    wifiNetCount++;
  }
  // Sort by signal strength descending
  for (uint8_t i = 0; i < wifiNetCount - 1; i++)
    for (uint8_t j = i + 1; j < wifiNetCount; j++)
      if (wifiNets[j].bars > wifiNets[i].bars)
        { WifiNet tmp = wifiNets[i]; wifiNets[i] = wifiNets[j]; wifiNets[j] = tmp; }
  wifiScanning = false;
  wifiMsg = (wifiNetCount == 0) ? "No networks found." : "";
}

// ─── NVS ─────────────────────────────────────────────────────────────────────
static void loadConfig() {
  prefs.begin("kodex", true);
  wifiSSID        = prefs.getString("ssid",  "");
  wifiPass        = prefs.getString("pass",  "");
  deviceId        = prefs.getString("did",   "");
  deviceJWT       = prefs.getString("jwt",   "");
  apiBase         = prefs.getString("api",   DEFAULT_API_BASE);
  institutionCode = prefs.getString("inst",  "");
  rssiThreshold   = (int8_t)prefs.getInt("rssi", -70);
  prefs.end();
  if (deviceId.isEmpty()) deviceId = "esp32s3-" + macSuffix();
}
static void saveConfig() {
  prefs.begin("kodex", false);
  prefs.putString("ssid", wifiSSID); prefs.putString("pass", wifiPass);
  prefs.putString("did",  deviceId); prefs.putString("jwt",  deviceJWT);
  prefs.putString("api",  apiBase);  prefs.putString("inst", institutionCode);
  prefs.putInt("rssi", (int)rssiThreshold);
  prefs.end();
}
static void factoryReset() {
  prefs.begin("kodex", false); prefs.clear(); prefs.end();
  ESP.restart();
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
static int postJson(const String& path, const String& body,
                    String& out, bool authed = true) {
  WiFiClientSecure client; client.setInsecure();
  client.setTimeout(30);  // 30s SSL handshake timeout
  HTTPClient http;
  String url = apiBase + path;
  if (!http.begin(client, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Connection", "close");
  if (authed && !deviceJWT.isEmpty())
    http.addHeader("Authorization", "Bearer " + deviceJWT);
  http.setTimeout(30000);
  int code = http.POST(body); out = http.getString(); http.end();
  return code;
}

// ─── Start a session locally (fully offline) ─────────────────────────────────
// Generates a local_ prefixed sessionId + seed, writes to /sessions.jsonl,
// and activates the session on-device. Synced to cloud on next heartbeat.
static void startLocalSession(uint32_t durationSecs) {
  // Generate random 16-char hex sessionId suffix
  uint8_t rndBuf[8]; esp_fill_random(rndBuf, 8);
  char idHex[17]; idHex[16] = '\0';
  for (int i = 0; i < 8; i++) snprintf(&idHex[i*2], 3, "%02x", rndBuf[i]);
  sessionId = String("local_") + idHex;

  // Generate 32-char hex seed (16 random bytes)
  uint8_t seedBuf[16]; esp_fill_random(seedBuf, 16);
  char seedHex[33]; seedHex[32] = '\0';
  for (int i = 0; i < 16; i++) snprintf(&seedHex[i*2], 3, "%02x", seedBuf[i]);
  sessionSeed = String(seedHex);

  sessionTitle    = "Local Session";
  sessionCourse   = "";
  sessionLecturer = "";
  sessionDuration = durationSecs;
  studentsMarked  = 0;
  sessionTotalEnrolled = 0;

  // Use real time if synced, otherwise millis-based fallback epoch
  time_t nowT = time(nullptr);
  if (nowT < 1700000000UL) nowT = (time_t)(1700000000UL + millis() / 1000);
  sessionStartedAt = (uint32_t)nowT;

  sessionLocallyStarted = true;

  // Persist to SD so syncOfflineAttendance() can push it to the cloud
  if (sdAvailable) {
    File sf = SD_MMC.open("/sessions.jsonl", FILE_APPEND);
    if (sf) {
      String line = "{\"sessionId\":\"" + sessionId +
                    "\",\"courseCode\":\"\",\"title\":\"Local Session\"" +
                    ",\"lecturer\":\"\",\"startedAt\":" + String(sessionStartedAt) +
                    ",\"duration\":" + String(durationSecs) +
                    ",\"seed\":\"" + sessionSeed + "\",\"synced\":false}";
      sf.println(line);
      sf.close();
    }
  }

  curScreen = SESSION;
}

// ─── Offline sync (sessions + attendance records) ─────────────────────────────
static void syncOfflineAttendance() {
  bool hasSessions = sdAvailable && SD_MMC.exists("/sessions.jsonl");
  bool hasRecords  = (sdAvailable && sdRecordCount > 0 && SD_MMC.exists(SD_ATT_FILE))
                     || offlineCount > 0;

  if (!hasSessions && !hasRecords) return;

  JsonDocument doc;

  // ── Sessions ─────────────────────────────────────────────────────────────────
  if (hasSessions) {
    JsonArray sArr = doc["sessions"].to<JsonArray>();
    File sf = SD_MMC.open("/sessions.jsonl", FILE_READ);
    if (sf) {
      while (sf.available()) {
        String line = sf.readStringUntil('\n'); line.trim();
        if (line.isEmpty()) continue;
        JsonDocument s;
        if (!deserializeJson(s, line) && !s["synced"].as<bool>()) {
          JsonObject o = sArr.add<JsonObject>();
          o["sessionId"]  = s["sessionId"]  | "";
          o["courseCode"] = s["courseCode"] | "";
          o["title"]      = s["title"]      | "Attendance";
          o["lecturer"]   = s["lecturer"]   | "";
          o["startedAt"]  = s["startedAt"]  | (uint32_t)0;
          o["duration"]   = s["duration"]   | (uint32_t)300;
          o["seed"]       = s["seed"]       | "";
        }
      }
      sf.close();
    }
  }

  // ── Attendance records (SD path) ──────────────────────────────────────────────
  if (sdAvailable && sdRecordCount > 0 && SD_MMC.exists(SD_ATT_FILE)) {
    JsonArray arr = doc["records"].to<JsonArray>();
    File f = SD_MMC.open(SD_ATT_FILE, FILE_READ);
    if (f) {
      uint32_t parsed = 0;
      while (f.available()) {
        String line = f.readStringUntil('\n'); line.trim();
        if (line.isEmpty()) continue;
        JsonDocument rec;
        if (!deserializeJson(rec, line)) {
          JsonObject o = arr.add<JsonObject>();
          if (rec["id"].is<const char*>())          o["id"]          = rec["id"];
          if (rec["indexNumber"].is<const char*>()) o["indexNumber"] = rec["indexNumber"];
          if (rec["userId"].is<const char*>())      o["userId"]      = rec["userId"];
          o["sessionId"] = rec["sessionId"].is<const char*>() ? rec["sessionId"] : rec["sid"];
          o["courseId"]  = rec["courseId"]  | "";
          o["timestamp"] = rec["timestamp"].is<uint32_t>() ? rec["timestamp"] : rec["ts"];
          parsed++;
        }
      }
      f.close();
      if (parsed == 0) { SD_MMC.remove(SD_ATT_FILE); sdRecordCount = 0; }
    }
  } else if (offlineCount > 0) {
    // ── RAM fallback ────────────────────────────────────────────────────────────
    JsonArray arr = doc["records"].to<JsonArray>();
    for (uint8_t i = 0; i < offlineCount; i++) {
      JsonObject o = arr.add<JsonObject>();
      if (offlineBuf[i].indexNumber[0]) o["indexNumber"] = offlineBuf[i].indexNumber;
      if (offlineBuf[i].userId[0])      o["userId"]      = offlineBuf[i].userId;
      o["sessionId"] = offlineBuf[i].sessionId[0] ? offlineBuf[i].sessionId : sessionId.c_str();
      o["courseId"]  = offlineBuf[i].courseId[0]  ? offlineBuf[i].courseId  : "";
      o["timestamp"] = offlineBuf[i].ts;
    }
  }

  String body; serializeJson(doc, body);
  String resp; int code = postJson("/api/devices/sync", body, resp);

  if (code == 200) {
    LOG("Sync OK — sessions + records pushed");
    // Clear synced files
    if (hasSessions)                    SD_MMC.remove("/sessions.jsonl");
    if (sdAvailable && SD_MMC.exists(SD_ATT_FILE)) { SD_MMC.remove(SD_ATT_FILE); sdRecordCount = 0; }
    offlineCount = 0;
  } else {
    LOG("Sync failed " + String(code) + ": " + resp);
  }
}

// ─── Roster download ──────────────────────────────────────────────────────────
// Downloads enrolled students from server and caches to SD card.
// Called after a successful heartbeat so the device can validate student IDs
// in /attend even when internet is unavailable later.
static void downloadRoster() {
  if (!sdAvailable) return;
  String resp; int code = -1;
  HTTPClient http;
  String url = String(apiBase) + "/api/devices/roster";
  http.begin(url);
  http.addHeader("Authorization", "Bearer " + deviceJWT);
  http.addHeader("Content-Type",  "application/json");
  http.setTimeout(10000);
  code = http.GET();
  if (code == 200) {
    resp = http.getString();
    File rf = SD_MMC.open("/roster.json", FILE_WRITE);
    if (rf) { rf.print(resp); rf.close(); LOG("Roster saved (" + String(resp.length()) + " bytes)"); }

    // Write a companion line-per-index-number file for fast O(n) search during /attend
    // without loading the full JSON into RAM.
    JsonDocument rDoc;
    if (!deserializeJson(rDoc, resp)) {
      JsonArray arr = rDoc["roster"].as<JsonArray>();
      File ix = SD_MMC.open("/roster_idx.txt", FILE_WRITE);
      if (ix) {
        for (JsonObject student : arr) {
          const char* idx = student["indexNumber"] | "";
          if (idx[0]) { ix.println(idx); }
        }
        ix.close();
        LOG("Roster index written (" + String(arr.size()) + " entries)");
      }
    }
  } else {
    LOG("Roster fetch failed: " + String(code));
  }
  http.end();
}

// ─── Pairing ─────────────────────────────────────────────────────────────────
static String pairErrorMsg = "";  // set on failure, shown on screen

static bool tryPair(const String& pcode, const String& inst) {
  pairErrorMsg = "";
  JsonDocument req;
  req["pairingCode"]     = pcode;
  req["deviceId"]        = deviceId;
  req["deviceName"]      = "Dikly-" + macSuffix();
  req["institutionCode"] = inst;
  String body; serializeJson(req, body);

  String resp; int code = -1;
  for (uint8_t attempt = 1; attempt <= 3; attempt++) {
    resp = "";
    code = postJson("/api/devices/pair", body, resp, false);
    LOG("Pair attempt " + String(attempt) + " → HTTP " + String(code));
    if (code > 0) break;          // got a real HTTP response (even if 4xx/5xx) — stop retrying
    if (attempt < 3) {
      LOG("Connection failed, retrying in 3s…");
      drawPairStatus("Contacting server…",
                     ("Attempt " + String(attempt) + "/3 failed, retrying…").c_str(),
                     ("HTTP " + String(code)).c_str(), 3);
      delay(3000);
    }
  }

  if (code != 200 && code != 201) {
    JsonDocument errDoc;
    if (!deserializeJson(errDoc, resp)) {
      if (errDoc["message"].is<const char*>())    pairErrorMsg = errDoc["message"].as<String>();
      else if (errDoc["error"].is<const char*>()) pairErrorMsg = errDoc["error"].as<String>();
    }
    if (pairErrorMsg.isEmpty()) {
      pairErrorMsg = code < 0 ? "Cannot reach server (HTTP " + String(code) + ")"
                               : "Server error HTTP " + String(code);
    }
    LOG("Pair fail: " + pairErrorMsg);
    return false;
  }
  JsonDocument doc;
  if (deserializeJson(doc, resp)) { pairErrorMsg = "Bad response JSON"; return false; }
  if (!doc["token"].is<const char*>()) { pairErrorMsg = "No token in response"; return false; }
  deviceJWT = doc["token"].as<String>();
  if (doc["deviceId"].is<const char*>()) deviceId = doc["deviceId"].as<String>();
  institutionCode = inst;
  saveConfig(); LOG("Paired ✓"); return true;
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────
static void sendHeartbeat() {
  JsonDocument req;
  req["currentNetwork"]  = wifiSSID;
  req["mode"]            = "station";
  req["localIp"]         = WiFi.localIP().toString();
  req["rtcValid"]        = timeSynced;
  req["firmwareVersion"] = FIRMWARE_VERSION;
  req["pendingRecords"]  = (uint32_t)(sdRecordCount + offlineCount); // unsynced offline attendance records
  String body; serializeJson(req, body);
  String resp; int code = postJson("/api/devices/heartbeat", body, resp);
  if (code == 401) { LOG("JWT revoked — factory reset"); factoryReset(); return; }
  if (code != 200) {
    LOG("HB fail " + String(code));
    if (++hbFails >= 5) { hbFails = 0; forceReconn = true; }
    return;
  }
  hbFails    = 0;
  lastSyncMs = millis();
  // Flush any offline sessions + attendance records now that we have internet.
  syncOfflineAttendance();
  // Refresh the student roster every ~10 minutes (120 heartbeats × 5 s).
  static uint32_t rosterHbCount = 0;
  if (++rosterHbCount >= 120) { rosterHbCount = 0; downloadRoster(); }
  JsonDocument doc;
  if (deserializeJson(doc, resp)) return;
  if (doc["serverTime"].is<const char*>()) {
    struct tm tm = {};
    if (strptime(doc["serverTime"].as<const char*>(), "%Y-%m-%dT%H:%M:%S", &tm)) {
      timeval tv = { mktime(&tm), 0 }; settimeofday(&tv, nullptr); timeSynced = true;
    }
  }
  JsonVariantConst sess = doc["activeSession"];
  if (sess.isNull()) {
    if (!sessionId.isEmpty()) {
      LOG("Session ended"); sessionId = ""; sessionSeed = "";
      sessionTitle = ""; sessionCourse = ""; sessionLecturer = "";
      studentsMarked = 0; sessionTotalEnrolled = 0;
      dedupClear("");
    }
  } else {
    String incomingId = sess["sessionId"] | "";
    if (incomingId != sessionId) dedupClear(incomingId);  // new session → reset dedup
    sessionId       = incomingId;
    sessionSeed     = sess["esp32Seed"] | "";
    sessionTitle    = sess["title"]     | "Attendance";
    sessionCourse   = sess["courseCode"]| "";
    sessionLecturer = sess["lecturer"]  | "";
    sessionDuration = sess["durationSeconds"] | 300;
    studentsMarked        = sess["studentsMarked"]  | 0;
    sessionTotalEnrolled  = sess["totalEnrolled"]   | 0;
    if (sess["startedAt"].is<const char*>()) {
      struct tm tm = {};
      if (strptime(sess["startedAt"].as<const char*>(), "%Y-%m-%dT%H:%M:%S", &tm))
        sessionStartedAt = (uint32_t)mktime(&tm);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  UI RENDERING  (double-buffered via LGFX_Sprite for flicker-free updates)
// ═══════════════════════════════════════════════════════════════════════════

// ── Utility: draw a rounded filled rectangle with border ─────────────────────
static void card(LGFX_Sprite& s, int32_t x, int32_t y, int32_t w, int32_t h,
                 uint32_t fill, uint32_t border = COL_BORDER, int32_t r = 6) {
  s.fillRoundRect(x, y, w, h, r, fill);
  s.drawRoundRect(x, y, w, h, r, border);
}

// ── Utility: centred text (lgfx vector font) ──────────────────────────────────
static void centreText(LGFX_Sprite& s, const String& txt, int32_t y,
                       const lgfx::IFont* font, uint16_t col, uint16_t bg = COL_BG) {
  s.setFont(font); s.setTextSize(1); s.setTextColor(col, bg);
  int32_t tw = s.textWidth(txt);
  s.setCursor((SW - tw) / 2, y); s.print(txt);
}

// ── Utility: status pill (small rounded rect with label) ─────────────────────
static void statusPill(LGFX_Sprite& s, int32_t x, int32_t y, const char* lbl, uint16_t col) {
  int32_t pw = s.textWidth(lbl) + 14;
  s.fillRoundRect(x, y, pw, 16, 8, col);
  s.setFont(F_TINY); s.setTextColor(COL_BG, col);
  s.setCursor(x + 7, y + 4); s.print(lbl);
}

// ── Utility: draw header bar (y=0..44) ────────────────────────────────────────
static void drawHeader(LGFX_Sprite& s, bool online) {
  s.fillRect(0, 0, SW, 44, COL_CARD);
  s.drawFastHLine(0, 44, SW, COL_BORDER);
  // "DIKLY" Orbitron cyan left-aligned
  s.setFont(F_LOGO); s.setTextSize(1); s.setTextColor(COL_CYAN, COL_CARD);
  s.setCursor(12, 8); s.print("DIKLY");
  // Online dot + label top-right
  uint16_t dotCol = online ? COL_SUCCESS : COL_MUTED;
  s.fillCircle(219, 14, 4, dotCol);
  s.setFont(F_TINY); s.setTextColor(dotCol, COL_CARD);
  s.setCursor(227, 8); s.print(online ? "ON" : "OFF");
}

// ── Utility: 3-bar WiFi signal icon, right-edge at (rx,ty), 10px tall ────────
static void _wifiBars(LGFX_Sprite& s, int32_t rx, int32_t ty, uint16_t col) {
  s.fillRect(rx - 7, ty + 6, 2, 4, col);
  s.fillRect(rx - 4, ty + 3, 2, 7, col);
  s.fillRect(rx - 1, ty,     2, 10, col);
}

// ── Utility: signal bars icon (cx, baseY = bottom-left anchor, strength 1-4) ─
static void _sigBars(LGFX_Sprite& s, int32_t cx, int32_t by, uint8_t strength, uint16_t col) {
  for (uint8_t b = 0; b < 4; b++) {
    uint8_t bh = 3 + b * 3;
    uint16_t bc = (b < strength) ? col : COL_BORDER;
    s.fillRoundRect(cx + b * 5, by - bh, 4, bh, 1, bc);
  }
}

// ── Utility: bottom tab bar — active: 0=Home 1=Session 2=Records 3=Settings ──
static void drawTabBar(LGFX_Sprite& s, uint8_t active) {
  s.fillRect(0, 280, SW, 40, COL_CARD);
  s.drawFastHLine(0, 280, SW, COL_BORDER);

  const char* labels[4] = { "Home", "Session", "Records", "Settings" };
  for (uint8_t i = 0; i < 4; i++) {
    int32_t cx   = 30 + (int32_t)i * 60;
    uint16_t col = (i == active) ? COL_PRIMARY : COL_MUTED;

    // Active 3px top accent bar
    if (i == active)
      s.fillRect(i * 60, 280, 60, 3, COL_PRIMARY);

    int32_t iy = 293;
    if (i == 0) {                          // House icon
      // Roof triangle
      s.fillTriangle(cx, iy - 9, cx - 9, iy, cx + 9, iy, col);
      // House body
      s.fillRect(cx - 7, iy, 14, 9, col);
      // Door cutout
      s.fillRect(cx - 2, iy + 4, 5, 5, COL_CARD);
      // Chimney
      s.fillRect(cx + 3, iy - 11, 3, 5, col);
    } else if (i == 1) {                   // Calendar icon
      s.fillRoundRect(cx - 8, iy - 6, 16, 14, 2, col);
      s.fillRoundRect(cx - 6, iy - 2, 12, 9, 1, COL_CARD);
      // Calendar pins
      s.fillRect(cx - 4, iy - 10, 3, 6, col);
      s.fillRect(cx + 2, iy - 10, 3, 6, col);
      // Header divider
      s.fillRect(cx - 8, iy - 2, 16, 2, col);
      // Day dots
      s.fillRect(cx - 4, iy + 1, 2, 2, col);
      s.fillRect(cx - 1, iy + 1, 2, 2, col);
      s.fillRect(cx + 2, iy + 1, 2, 2, col);
      s.fillRect(cx - 4, iy + 4, 2, 2, col);
      s.fillRect(cx - 1, iy + 4, 2, 2, col);
    } else if (i == 2) {                   // List lines icon
      // List bullet + line pairs
      s.fillCircle(cx - 6, iy - 5, 2, col);
      s.fillRect(cx - 2, iy - 6, 10, 2, col);
      s.fillCircle(cx - 6, iy,     2, col);
      s.fillRect(cx - 2, iy - 1, 10, 2, col);
      s.fillCircle(cx - 6, iy + 5, 2, col);
      s.fillRect(cx - 2, iy + 4, 7, 2, col);
    } else {                               // Gear icon
      s.fillCircle(cx, iy, 6, col);
      s.fillCircle(cx, iy, 3, COL_CARD);
      // Cardinal spokes
      s.fillRect(cx - 1, iy - 10, 3, 5, col);
      s.fillRect(cx - 1, iy + 5,  3, 5, col);
      s.fillRect(cx - 10, iy - 1, 5, 3, col);
      s.fillRect(cx + 5,  iy - 1, 5, 3, col);
      // Diagonal spokes
      s.fillRect(cx - 8, iy - 8, 3, 3, col);
      s.fillRect(cx + 5, iy + 5, 3, 3, col);
      s.fillRect(cx - 8, iy + 5, 3, 3, col);
      s.fillRect(cx + 5, iy - 8, 3, 3, col);
      // Re-punch center hole
      s.fillCircle(cx, iy, 3, COL_CARD);
    }

    s.setFont(F_TINY); s.setTextColor(col, COL_CARD);
    int32_t lw = s.textWidth(labels[i]);
    s.setCursor(cx - lw / 2, 307); s.print(labels[i]);
  }
}

// ── Utility: sub-screen header (back arrow + centred title + online dot) ──────
static void _drawSubHeader(LGFX_Sprite& s, const char* title, bool online) {
  s.fillRect(0, 0, SW, 44, COL_CARD);
  s.drawFastHLine(0, 44, SW, COL_BORDER);
  // Left chevron arrow — two angled strokes
  // Upper stroke: top-right to tip
  s.fillRect(13, 14, 3, 10, COL_TEXT);
  // Lower stroke: tip to bottom-right
  s.fillRect(13, 22, 3, 10, COL_TEXT);
  // Horizontal bar
  s.fillRect(13, 20, 14, 3, COL_TEXT);
  // Mask to shape the chevron
  s.fillRect(16, 15, 11, 8, COL_CARD);
  s.fillRect(16, 23, 11, 8, COL_CARD);
  // Centred title
  s.setFont(F_SMALL); s.setTextColor(COL_TEXT, COL_CARD);
  int32_t tw = s.textWidth(title);
  s.setCursor((SW - tw) / 2, 15); s.print(title);
  // Online dot top-right
  uint16_t dc = online ? COL_SUCCESS : COL_MUTED;
  s.fillCircle(219, 14, 4, dc);
  s.setFont(F_TINY); s.setTextColor(dc, COL_CARD);
  s.setCursor(227, 8); s.print(online ? "ON" : "OFF");
}

// ── SPLASH / WELCOME ─────────────────────────────────────────────────────────
static void drawSplash() {
  spr.fillSprite(COL_BG);

  // ── Subtle radial glow behind badge (concentric dim rings) ───────────────
  const int32_t BCX = SW / 2, BCY = 126;
  for (int8_t r = 70; r >= 44; r -= 6) {
    uint16_t gc = (r > 60) ? 0x0842 : (r > 52) ? 0x0C42 : 0x1063;
    spr.drawCircle(BCX, BCY, r, gc);
  }

  // ── Large "D" badge ──────────────────────────────────────────────────────
  const int32_t BADGE_R = 36;
  // Outer glow ring
  spr.drawCircle(BCX, BCY, BADGE_R + 4, COL_BORDER);
  spr.drawCircle(BCX, BCY, BADGE_R + 3, COL_BORDER);
  // Primary filled circle
  spr.fillCircle(BCX, BCY, BADGE_R, COL_PRIMARY);
  // Inner highlight ring
  spr.drawCircle(BCX, BCY, BADGE_R - 2, 0x4CBF);
  // "D" centered
  spr.setFont(F_MED); spr.setTextSize(1);
  spr.setTextColor(COL_WHITE, COL_PRIMARY);
  int32_t dw = spr.textWidth("D");
  int32_t dh = spr.fontHeight();
  spr.setCursor(BCX - dw / 2, BCY - dh / 2 + 2); spr.print("D");

  // ── "DIKLY" wordmark ────────────────────────────────────────────────────
  spr.setFont(F_LOGO); spr.setTextSize(1);
  spr.setTextColor(COL_TEXT, COL_BG);
  int32_t tw = spr.textWidth("DIKLY");
  spr.setCursor((SW - tw) / 2, BCY + BADGE_R + 12); spr.print("DIKLY");

  // ── Cyan accent line under wordmark ─────────────────────────────────────
  int32_t lineY = BCY + BADGE_R + 30;
  spr.fillRect(SW / 2 - 30, lineY, 60, 2, COL_CYAN);

  // ── Subtitle ────────────────────────────────────────────────────────────
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  const char* sub = "Attendance System";
  int32_t sw2 = spr.textWidth(sub);
  spr.setCursor((SW - sw2) / 2, lineY + 8); spr.print(sub);

  // ── Version string ───────────────────────────────────────────────────────
  spr.setFont(F_TINY); spr.setTextColor(0x4A69, COL_BG);
  String verStr = "v2.1.0";
  int32_t vw = spr.textWidth(verStr);
  spr.setCursor((SW - vw) / 2, lineY + 22); spr.print(verStr);

  // ── Animated loading dots (millis-based, 4 states) ───────────────────────
  uint8_t phase = (millis() / 500) % 4;
  const int32_t dotY  = lineY + 48;
  const int32_t dotSp = 16;
  for (uint8_t d = 0; d < 3; d++) {
    bool active = (d < phase);
    uint16_t dc  = active ? COL_PRIMARY : COL_DIM_CARD;
    int32_t  r   = active ? 5 : 4;
    spr.fillCircle(SW / 2 - dotSp + (int32_t)d * dotSp, dotY, r, dc);
    if (active) spr.drawCircle(SW / 2 - dotSp + (int32_t)d * dotSp, dotY, r + 2, COL_BORDER);
  }

  // ── Bottom watermark ─────────────────────────────────────────────────────
  spr.setFont(F_TINY); spr.setTextColor(0x2104, COL_BG);
  const char* wm = "dikly.sbs";
  int32_t wmw = spr.textWidth(wm);
  spr.setCursor((SW - wmw) / 2, SH - 16); spr.print(wm);

  spr.pushSprite(0, 0);
}

// ── QR code bitmap for http://192.168.4.1 (25×25 modules) ───────────────────
static const uint8_t QR_IP_SIZE = 25;
static const uint8_t QR_IP[25][25] = {
  {1,1,1,1,1,1,1,0,0,1,1,1,0,1,0,0,1,0,1,1,1,1,1,1,1},
  {1,0,0,0,0,0,1,0,0,0,0,1,1,0,0,0,0,0,1,0,0,0,0,0,1},
  {1,0,1,1,1,0,1,0,0,1,1,1,0,0,1,0,1,0,1,0,1,1,1,0,1},
  {1,0,1,1,1,0,1,0,1,0,1,1,0,0,1,1,1,0,1,0,1,1,1,0,1},
  {1,0,1,1,1,0,1,0,1,0,1,0,1,1,0,0,0,0,1,0,1,1,1,0,1},
  {1,0,0,0,0,0,1,0,0,1,1,0,0,1,1,0,0,0,1,0,0,0,0,0,1},
  {1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1},
  {0,0,0,0,0,0,0,0,0,1,0,0,1,1,0,0,1,0,0,0,0,0,0,0,0},
  {1,1,0,0,0,1,1,1,0,1,1,0,1,0,1,1,1,0,0,0,1,1,0,0,0},
  {0,0,1,0,0,0,0,1,1,0,1,0,0,0,1,1,1,1,0,0,1,1,1,1,0},
  {0,1,0,0,0,1,1,0,1,1,0,1,1,0,0,1,0,0,1,1,0,1,0,1,1},
  {0,1,1,0,1,0,0,0,1,0,1,1,0,0,1,1,1,0,0,0,1,1,0,0,1},
  {1,1,1,0,0,1,1,0,0,1,1,0,0,1,1,0,1,1,1,0,0,0,0,0,1},
  {1,0,1,0,0,0,0,0,0,0,1,0,1,1,1,1,0,0,0,0,0,0,0,1,0},
  {1,0,0,1,1,1,1,0,0,1,1,0,0,1,1,1,0,1,0,1,0,1,0,1,1},
  {1,0,0,1,1,1,0,1,1,0,0,0,1,1,1,0,1,0,0,0,1,0,1,0,1},
  {1,0,1,0,1,1,1,1,0,0,1,0,1,0,1,0,1,1,1,1,1,0,1,0,0},
  {0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,1,1,0,0,0,1,0,1,0,0},
  {1,1,1,1,1,1,1,0,1,1,1,0,1,1,1,0,1,0,1,0,1,1,0,0,1},
  {1,0,0,0,0,0,1,0,1,1,1,1,0,0,1,0,1,0,0,0,1,0,0,0,0},
  {1,0,1,1,1,0,1,0,0,1,0,1,0,0,0,1,1,1,1,1,1,1,1,0,1},
  {1,0,1,1,1,0,1,0,0,0,1,0,1,1,0,0,0,0,1,1,0,1,0,1,1},
  {1,0,1,1,1,0,1,0,0,0,1,0,0,1,1,0,0,1,0,0,0,0,1,0,1},
  {1,0,0,0,0,0,1,0,1,0,1,0,1,1,0,1,1,0,1,1,1,0,0,0,1},
  {1,1,1,1,1,1,1,0,1,0,0,1,1,1,0,1,1,0,1,0,0,1,0,0,1},
};

// ── SETUP (captive portal) ────────────────────────────────────────────────────
static void drawSetup(const String& apName) {
  spr.fillSprite(COL_BG);

  // ── Header bar ───────────────────────────────────────────────────────────────
  spr.fillRect(0, 0, SW, 44, COL_CARD);
  spr.drawFastHLine(0, 44, SW, COL_BORDER);
  // "DIKLY" logo
  spr.setFont(F_LOGO); spr.setTextSize(1);
  spr.setTextColor(COL_CYAN, COL_CARD);
  spr.setCursor(12, 8); spr.print("DIKLY");
  // "Device Setup" subtitle in header
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(12, 30); spr.print("Device Setup");
  // WiFi icon top-right
  {
    const int32_t wx = 214, wy = 22;
    spr.fillCircle(wx, wy, 2, COL_CYAN);
    spr.drawArc(wx, wy, 7,  5,  215, 325, COL_CYAN);
    spr.drawArc(wx, wy, 13, 11, 210, 330, COL_CYAN);
  }

  // ── Section label ────────────────────────────────────────────────────────────
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  const char* sectLbl = "SETUP GUIDE";
  spr.setCursor(14, 52); spr.print(sectLbl);
  // Accent underline
  spr.fillRect(14, 62, spr.textWidth(sectLbl) + 4, 2, COL_PRIMARY);

  // ── Step cards ───────────────────────────────────────────────────────────────
  const int32_t CX = 10, CW = SW - 20, CG = 6;
  int32_t cy = 70;

  // Step card helper lambda
  auto stepCard = [&](uint8_t num,
                      const char* hint, const lgfx::IFont* vfont,
                      const char* val1, const char* val2,
                      const char* note, int32_t ch) {
    spr.fillRoundRect(CX, cy, CW, ch, 6, COL_CARD);
    spr.drawRoundRect(CX, cy, CW, ch, 6, COL_BORDER);

    // Step number circle
    const int32_t bx = CX + 18, by = cy + ch / 2;
    spr.fillCircle(bx, by, 10, COL_PRIMARY);
    spr.setFont(F_TINY); spr.setTextColor(COL_BG, COL_PRIMARY);
    char ns[2] = {(char)('0' + num), '\0'};
    spr.setCursor(bx - (int32_t)spr.textWidth(ns) / 2, by - 4);
    spr.print(ns);

    // Text block
    const int32_t tx = CX + 36;
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    spr.setCursor(tx, cy + 7); spr.print(hint);
    spr.setFont(vfont); spr.setTextColor(COL_CYAN, COL_CARD);
    spr.setCursor(tx, cy + 18); spr.print(val1);
    if (val2) {
      spr.setFont(F_TINY); spr.setTextColor(COL_CYAN, COL_CARD);
      spr.setCursor(tx, cy + 30); spr.print(val2);
    }
    if (note) {
      spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
      spr.setCursor(tx, val2 ? cy + 42 : cy + 30); spr.print(note);
    }
    cy += ch + CG;
  };

  stepCard(1, "Connect phone to Wi-Fi:", F_SMALL, apName.c_str(), nullptr, nullptr, 42);

  // ── Step 2 — card with QR on the right ───────────────────────────────────────
  {
    const int32_t card2H   = 88;
    const int32_t card2Top = cy;
    spr.fillRoundRect(CX, cy, CW, card2H, 6, COL_CARD);
    spr.drawRoundRect(CX, cy, CW, card2H, 6, COL_BORDER);

    // Step circle
    const int32_t bx = CX + 18, by = cy + card2H / 2;
    spr.fillCircle(bx, by, 10, COL_PRIMARY);
    spr.setFont(F_TINY); spr.setTextColor(COL_BG, COL_PRIMARY);
    spr.setCursor(bx - 3, by - 4); spr.print("2");

    // Text (left of QR)
    const int32_t tx = CX + 36;
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    spr.setCursor(tx, cy + 8); spr.print("Scan QR or open:");
    spr.setFont(F_TINY); spr.setTextColor(COL_CYAN, COL_CARD);
    spr.setCursor(tx, cy + 21); spr.print("dikly.local");
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    spr.setCursor(tx, cy + 34); spr.print("or 192.168.4.1");

    // QR code — right side, white border+black modules
    const int32_t QR_SCALE = 3;
    const int32_t QR_PX    = QR_IP_SIZE * QR_SCALE;  // 75px
    const int32_t qrX      = CX + CW - QR_PX - 6;
    const int32_t qrY      = card2Top + (card2H - QR_PX) / 2;
    spr.fillRect(qrX - 2, qrY - 2, QR_PX + 4, QR_PX + 4, 0xFFFF);
    for (int qy = 0; qy < QR_IP_SIZE; qy++) {
      for (int qx = 0; qx < QR_IP_SIZE; qx++) {
        if (QR_IP[qy][qx]) {
          spr.fillRect(qrX + qx * QR_SCALE, qrY + qy * QR_SCALE,
                       QR_SCALE, QR_SCALE, 0x0000);
        }
      }
    }
    cy += card2H + CG;
  }

  stepCard(3, "Enter your credentials:", F_TINY,
           "Institution code + pairing code", "then your school Wi-Fi password",
           nullptr, 52);

  // ── Factory reset strip ───────────────────────────────────────────────────────
  cy += 4;
  {
    const int32_t bh = 22;
    if (cy + bh <= SH - 2) {
      spr.fillRoundRect(CX, cy, CW, bh, 11, 0x1800);
      spr.drawRoundRect(CX, cy, CW, bh, 11, 0x3800);
      // Warning icon
      const int32_t gx = CX + 14, gy = cy + bh / 2;
      spr.fillCircle(gx, gy, 4, COL_ERROR);
      spr.fillCircle(gx, gy, 2, 0x1800);
      spr.fillRect(gx - 1, gy - 5, 2, 2, COL_ERROR);
      spr.fillRect(gx - 1, gy + 3, 2, 2, COL_ERROR);
      spr.setFont(F_TINY); spr.setTextColor(COL_ERROR, 0x1800);
      spr.setCursor(gx + 9, gy - 4); spr.print("HOLD 3s  |  FACTORY RESET");
    }
  }

  spr.pushSprite(0, 0);
}

// ── WIFI RECONFIG (paired, but saved network unavailable) ────────────────────
static void drawWifiReconfig(const String& apName) {
  spr.fillSprite(COL_BG);

  // ── Header bar with WARNING accent ───────────────────────────────────────────
  spr.fillRect(0, 0, SW, 44, COL_CARD);
  spr.fillRect(0, 44, SW, 3, COL_WARNING);   // warning accent instead of border
  spr.drawFastHLine(0, 47, SW, COL_BORDER);

  // "DIKLY" logo
  spr.setFont(F_LOGO); spr.setTextSize(1);
  spr.setTextColor(COL_WARNING, COL_CARD);
  spr.setCursor(12, 8); spr.print("DIKLY");

  // "WiFi Required" subtitle in header
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(12, 30); spr.print("WiFi Required");

  // Warning triangle icon top-right
  {
    const int32_t wx = 220, wy = 14;
    spr.fillTriangle(wx, wy - 8, wx - 8, wy + 8, wx + 8, wy + 8, COL_WARNING);
    spr.fillTriangle(wx, wy - 4, wx - 4, wy + 6, wx + 4, wy + 6, COL_CARD);
    spr.fillRect(wx - 1, wy - 2, 3, 5, COL_WARNING);
    spr.fillRect(wx - 1, wy + 4, 3, 2, COL_WARNING);
  }

  // ── Step 1 card: connect to hotspot ──────────────────────────────────────────
  int32_t cy = 56;
  spr.fillRoundRect(10, cy, SW - 20, 60, 6, COL_CARD);
  spr.drawRoundRect(10, cy, SW - 20, 60, 6, COL_WARNING);

  // Step circle
  spr.fillCircle(28, cy + 30, 10, COL_WARNING);
  spr.setFont(F_TINY); spr.setTextColor(COL_BG, COL_WARNING);
  spr.setCursor(25, cy + 26); spr.print("1");

  // WiFi hotspot icon
  spr.fillCircle(52, cy + 32, 3, COL_WARNING);
  spr.drawArc(52, cy + 36, 8, 6, 215, 325, COL_WARNING);
  spr.drawArc(52, cy + 36, 14, 12, 210, 330, COL_WARNING);

  // Text
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(70, cy + 10); spr.print("Connect phone to Wi-Fi:");
  spr.setFont(F_SMALL); spr.setTextColor(COL_WARNING, COL_CARD);
  String shortAp = apName;
  if (spr.textWidth(shortAp) > SW - 90) shortAp = shortAp.substring(0, 13) + "..";
  spr.setCursor(70, cy + 24); spr.print(shortAp);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(70, cy + 42); spr.print("Open network — no password");

  // ── Step 2 card: open portal ──────────────────────────────────────────────────
  cy += 68;
  spr.fillRoundRect(10, cy, SW - 20, 52, 6, COL_CARD);
  spr.drawRoundRect(10, cy, SW - 20, 52, 6, COL_BORDER);

  spr.fillCircle(28, cy + 26, 10, COL_WARNING);
  spr.setFont(F_TINY); spr.setTextColor(COL_BG, COL_WARNING);
  spr.setCursor(25, cy + 22); spr.print("2");

  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(46, cy + 8); spr.print("Open browser and go to:");
  spr.setFont(F_SMALL); spr.setTextColor(COL_WARNING, COL_CARD);
  spr.setCursor(46, cy + 22); spr.print("dikly.local");
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(46, cy + 38); spr.print("or 192.168.4.1");

  // ── Info card: pairing preserved ─────────────────────────────────────────────
  cy += 60;
  spr.fillRoundRect(10, cy, SW - 20, 40, 6, 0x0020);
  spr.drawRoundRect(10, cy, SW - 20, 40, 6, COL_SUCCESS);
  spr.fillCircle(26, cy + 20, 8, COL_SUCCESS);
  spr.setFont(F_TINY); spr.setTextColor(COL_BG, COL_SUCCESS);
  int32_t iw = spr.textWidth("i"); spr.setCursor(26 - iw / 2, cy + 16); spr.print("i");
  spr.setFont(F_TINY); spr.setTextColor(COL_SUCCESS, 0x0020);
  spr.setCursor(40, cy + 8); spr.print("Device pairing is preserved.");
  spr.setCursor(40, cy + 22); spr.print("Only Wi-Fi credentials change.");

  // ── Factory reset strip ───────────────────────────────────────────────────────
  cy += 48;
  if (cy + 22 <= SH - 2) {
    spr.fillRoundRect(10, cy, SW - 20, 22, 11, 0x1800);
    spr.drawRoundRect(10, cy, SW - 20, 22, 11, 0x3800);
    spr.setFont(F_TINY); spr.setTextColor(COL_WARNING, 0x1800);
    const char* rst = "Hold 3s anywhere  —  factory reset";
    int32_t rw = spr.textWidth(rst);
    spr.setCursor((SW - rw) / 2, cy + 7); spr.print(rst);
  }

  spr.pushSprite(0, 0);
}

// ── WIFI SCAN (on-device WiFi picker) ────────────────────────────────────────
#define LIST_Y      90    // y where network list starts (below title + subtitle)
#define ITEM_H      37    // height of each list item
#define MAX_VIS      5    // max visible items
#define SCAN_BTN_X  162   // legacy — unused
#define SCROLL_X    220   // scroll arrow column x

static void drawWifiScan() {
  spr.fillSprite(COL_BG);

  // ── Sub-header ───────────────────────────────────────────────────────────────
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Select Network", online);

  if (wifiScanning) {
    // Scanning spinner
    static uint8_t scanSpin = 0; scanSpin = (scanSpin + 1) % 8;
    const char* spinFrames[] = {"|", "/", "-", "\\", "|", "/", "-", "\\"};
    spr.setFont(F_MED); spr.setTextColor(COL_PRIMARY, COL_BG);
    int32_t fw = spr.textWidth(spinFrames[scanSpin]);
    spr.setCursor((SW - fw) / 2, 150); spr.print(spinFrames[scanSpin]);
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    const char* sl = "Scanning for networks...";
    int32_t slw = spr.textWidth(sl);
    spr.setCursor((SW - slw) / 2, 182); spr.print(sl);
    spr.pushSprite(0, 0); return;
  }

  if (!wifiMsg.isEmpty() && wifiNetCount == 0) {
    spr.setFont(F_SMALL); spr.setTextColor(COL_MUTED, COL_BG);
    int32_t tw = spr.textWidth(wifiMsg);
    spr.setCursor((SW - tw) / 2, 160); spr.print(wifiMsg);
    spr.setFont(F_TINY); spr.setTextColor(COL_BORDER, COL_BG);
    const char* hint = "Tap Scan Again below";
    tw = spr.textWidth(hint);
    spr.setCursor((SW - tw) / 2, 182); spr.print(hint);
  }

  // ── Network list ─────────────────────────────────────────────────────────────
  uint8_t visible = (uint8_t)min((int)wifiNetCount - wifiScroll, MAX_VIS);
  for (uint8_t i = 0; i < visible; i++) {
    uint8_t idx = wifiScroll + i;
    WifiNet& n  = wifiNets[idx];
    int32_t  y  = LIST_Y + (int32_t)i * ITEM_H;

    // Row background — highlighted if it matches current SSID
    bool isCurrent = (wifiSSID.length() > 0 && strncmp(n.ssid, wifiSSID.c_str(), 32) == 0);
    uint16_t rowBg = isCurrent ? COL_SURFACE : COL_CARD;
    uint16_t rowBd = isCurrent ? COL_PRIMARY : COL_BORDER;
    spr.fillRoundRect(4, y, SW - 8, ITEM_H - 3, 6, rowBg);
    spr.drawRoundRect(4, y, SW - 8, ITEM_H - 3, 6, rowBd);
    // Active left accent bar
    if (isCurrent)
      spr.fillRect(4, y + 4, 3, ITEM_H - 11, COL_PRIMARY);

    // Signal bars (4-bar style)
    _sigBars(spr, 10, y + ITEM_H - 7, (uint8_t)n.bars, isCurrent ? COL_PRIMARY : COL_SUCCESS);

    // SSID
    spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, rowBg);
    String ssid = String(n.ssid);
    if (spr.textWidth(ssid) > 126) { ssid = ssid.substring(0, 13) + ".."; }
    spr.setCursor(36, y + 6); spr.print(ssid);

    // Open / locked badge (right side)
    if (n.open) {
      spr.setFont(F_TINY);
      int32_t pw = spr.textWidth("OPEN") + 12;
      spr.fillRoundRect(SW - pw - 8, y + 8, pw, 15, 7, COL_SUCCESS);
      spr.setTextColor(COL_BG, COL_SUCCESS);
      spr.setCursor(SW - pw - 2, y + 11); spr.print("OPEN");
    } else {
      // Lock icon
      spr.fillRoundRect(SW - 22, y + 8, 11, 9, 2, COL_MUTED);
      spr.fillRect(SW - 19, y + 5, 5, 5, COL_MUTED);
      spr.fillRect(SW - 18, y + 6, 3, 3, rowBg);
    }

    // Divider (not last)
    if (i < visible - 1)
      spr.drawFastHLine(12, y + ITEM_H - 3, SW - 24, COL_BORDER);
  }

  // Scroll arrows
  if (wifiScroll > 0)
    spr.fillTriangle(SCROLL_X + 8, LIST_Y - 10,
                     SCROLL_X,     LIST_Y + 2,
                     SCROLL_X + 16, LIST_Y + 2, COL_PRIMARY);
  if (wifiScroll + MAX_VIS < wifiNetCount)
    spr.fillTriangle(SCROLL_X + 8, LIST_Y + MAX_VIS * ITEM_H + 10,
                     SCROLL_X,     LIST_Y + MAX_VIS * ITEM_H - 2,
                     SCROLL_X + 16, LIST_Y + MAX_VIS * ITEM_H - 2, COL_PRIMARY);

  // ── "Scan Again" full-width bottom button ────────────────────────────────────
  uint16_t sbCol = wifiScanning ? COL_MUTED : COL_PRIMARY;
  spr.fillRoundRect(14, 288, SW - 28, 26, 13, sbCol);
  spr.drawRoundRect(14, 288, SW - 28, 26, 13, wifiScanning ? COL_BORDER : COL_CYAN);
  spr.setFont(F_TINY); spr.setTextColor(COL_WHITE, sbCol);
  const char* scanLabel = wifiScanning ? "Scanning..." : "Scan Again";
  int32_t stw = spr.textWidth(scanLabel);
  spr.setCursor((SW - stw) / 2, 295); spr.print(scanLabel);

  spr.pushSprite(0, 0);
}

// ── Tap handler for WiFi scan screen ─────────────────────────────────────────
static void handleWifiScanTap(uint16_t tx, uint16_t ty) {
  // "Scan Again" full-width bottom button
  if (ty >= 284 && ty <= 316) {
    drawWifiScan();   // show "Scanning" label immediately
    doWifiScan();
    return;
  }
  // Scroll up
  if (tx >= SCROLL_X && ty >= LIST_Y - 14 && ty <= LIST_Y + 8 && wifiScroll > 0) {
    wifiScroll--; return;
  }
  // Scroll down
  int32_t downY = LIST_Y + MAX_VIS * ITEM_H;
  if (tx >= SCROLL_X && ty >= downY - 8 && ty <= downY + 14
      && wifiScroll + MAX_VIS < wifiNetCount) {
    wifiScroll++; return;
  }
  // Network item tap
  if (tx < 216 && ty >= LIST_Y) {
    int8_t row = ((int32_t)ty - LIST_Y) / ITEM_H;
    if (row < 0 || row >= MAX_VIS) return;
    uint8_t idx = wifiScroll + (uint8_t)row;
    if (idx >= wifiNetCount) return;
    WifiNet& n = wifiNets[idx];

    if (n.open) {
      // Open network — connect directly on the device
      wifiMsg = String("Connecting to ") + n.ssid + "...";
      drawWifiScan();
      WiFi.mode(WIFI_STA);
      WiFi.begin(n.ssid, "");
      uint32_t t0 = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS)
        delay(300);
      if (WiFi.status() == WL_CONNECTED) {
        wifiSSID = String(n.ssid); wifiPass = "";
        prefs.begin("kodex", false);
        prefs.putString("ssid", wifiSSID); prefs.putString("pass", wifiPass);
        prefs.end();
        delay(800); ESP.restart();
      } else {
        wifiMsg = String("Couldn't connect to ") + n.ssid + ". Try again.";
        WiFi.mode(WIFI_AP);
      }
    } else {
      // Secured — launch phone portal with this SSID pre-selected
      pendingSsid = String(n.ssid);
      startWifiReconfigPortal();
    }
  }
}

// Lightweight captive portal — changes WiFi only, preserves device JWT + pairing
static const char WIFI_RECONFIG_HTML[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dikly — Change WiFi</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;max-width:440px;margin:0 auto}
  .logo{font-size:24px;font-weight:900;color:#e2e8f0;margin:12px 0 2px}
  .logo span{color:#6366f1}
  .sub{font-size:13px;color:#64748b;margin-bottom:20px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:20px;margin-bottom:16px}
  .info{background:#052e16;border:1px solid #166534;border-radius:10px;padding:12px 14px;font-size:13px;color:#22c55e;margin-bottom:16px}
  h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6366f1;margin-bottom:14px}
  label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:12px 0 5px}
  label:first-child{margin-top:0}
  input{width:100%;padding:11px 13px;border-radius:9px;border:1.5px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px}
  input:focus{outline:none;border-color:#6366f1}
  .row{display:flex;gap:8px}
  .row input{flex:1}
  .scan-btn{padding:11px 14px;border-radius:9px;border:1.5px solid #6366f1;background:transparent;color:#6366f1;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
  .nets{margin-top:8px;border:1px solid #1e293b;border-radius:10px;overflow:hidden;max-height:180px;overflow-y:auto}
  .net{padding:10px 14px;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;border-bottom:1px solid #0f172a}
  .net:last-child{border-bottom:0}
  .net:hover,.net.sel{background:#1e3a5f}
  .bars{font-size:11px;color:#64748b}
  .submit{width:100%;padding:13px;border-radius:10px;border:0;background:#6366f1;color:#fff;font-weight:700;font-size:15px;cursor:pointer;margin-top:6px}
  .submit:disabled{opacity:.5;cursor:default}
  .ok{background:#052e16;border:1px solid #166534;color:#22c55e;padding:12px 14px;border-radius:10px;font-size:13px;margin-top:12px}
  .err{background:#450a0a;border:1px solid #991b1b;color:#fca5a5;padding:12px 14px;border-radius:10px;font-size:13px;margin-top:12px}
</style></head>
<body>
  <div class="logo">Di<span>kly</span></div>
  <p class="sub">Change WiFi Network</p>
  <div class="info">✓ Device pairing is preserved — only WiFi credentials will change.</div>
  <form id="f">
    <div class="card">
      <h3>New School WiFi</h3>
      <p id="sel-note" style="font-size:11px;color:#6366f1;margin:0 0 8px;min-height:14px"></p>
      <label>Network</label>
      <div class="row">
        <input id="ssid" name="ssid" required autocomplete="off" placeholder="Select or type SSID">
        <button type="button" class="scan-btn" id="sb" onclick="scan()">Scan</button>
      </div>
      <div id="nl" class="nets" style="display:none"></div>
      <label>Password</label>
      <input name="password" type="password" autocomplete="new-password" placeholder="Leave blank if open">
    </div>
    <button type="submit" class="submit" id="b">Save &amp; Reconnect</button>
  </form>
  <div id="msg"></div>
<script>
async function scan(){
  const sb=document.getElementById('sb'),nl=document.getElementById('nl');
  sb.disabled=true;sb.textContent='…';nl.style.display='block';
  nl.innerHTML='<div style="padding:10px 14px;font-size:12px;color:#64748b">Scanning…</div>';
  try{
    const r=await fetch('/wifi/scan');const nets=await r.json();
    if(!nets.length){nl.innerHTML='<div style="padding:10px 14px;font-size:12px;color:#64748b">No networks found.</div>';return;}
    nets.sort((a,b)=>(b.rssi||0)-(a.rssi||0));
    nl.innerHTML=nets.map(n=>{
      const bars=n.rssi>-60?'▂▄▆█':n.rssi>-75?'▂▄▆':n.rssi>-85?'▂▄':'▂';
      const lock=n.open===false?'🔒 ':'';
      const s=(n.ssid||'').replace(/'/g,"\\'");
      return `<div class="net" onclick="pick(this,'${s}')"><span>${n.ssid||'(Hidden)'}</span><span class="bars">${lock}${bars}</span></div>`;
    }).join('');
  }catch(e){nl.innerHTML='<div style="padding:10px;color:#fca5a5">Scan failed</div>';}
  finally{sb.disabled=false;sb.textContent='Scan';}
}
function pick(el,ssid){
  document.getElementById('ssid').value=ssid;
  document.querySelectorAll('.net').forEach(i=>i.classList.remove('sel'));
  el.classList.add('sel');
}
// Auto-fill SSID selected on device screen (if any)
window.addEventListener('load',async()=>{
  try{
    const r=await fetch('/wifi/selected-ssid');
    const j=await r.json();
    if(j.ssid){
      const el=document.getElementById('ssid');
      el.value=j.ssid; el.readOnly=true;
      el.style.color='#6366f1'; el.style.borderColor='#6366f1';
      document.getElementById('sel-note').textContent='Network pre-selected from device screen.';
    }
  }catch(e){}
});
document.getElementById('f').onsubmit=async(e)=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.target));
  const m=document.getElementById('msg'),b=document.getElementById('b');
  b.disabled=true;m.className='';m.textContent='Connecting — this may take 30 s…';
  try{
    const r=await fetch('/wifi/reconfigure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||'Failed');
    m.className='ok';m.textContent='✓ Connected! Device is restarting…';
  }catch(err){m.className='err';m.textContent='✗ '+err.message;b.disabled=false;}
};
</script></body></html>)HTML";

static void startWifiReconfigPortal() {
  WiFi.mode(WIFI_AP);
  delay(100);
  String ap = "Dikly-" + macSuffix();
  WiFi.softAP(ap.c_str());
  IPAddress gw;
  uint32_t t0 = millis();
  do { delay(100); gw = WiFi.softAPIP(); } while (gw == IPAddress(0,0,0,0) && millis()-t0 < 5000);
  LOG("WiFi reconfig AP: " + ap + " @ " + gw.toString());

  dns.start(53, "*", gw);

  auto servePage = []() { localHttp.send_P(200, "text/html", WIFI_RECONFIG_HTML); };
  localHttp.on("/", HTTP_GET, servePage);
  localHttp.on("/generate_204", HTTP_GET, servePage);
  localHttp.on("/hotspot-detect.html", HTTP_GET, servePage);
  localHttp.onNotFound(servePage);

  localHttp.on("/wifi/scan", HTTP_GET, []() {
    int n = WiFi.scanNetworks();
    JsonDocument doc; JsonArray arr = doc.to<JsonArray>();
    for (int i = 0; i < n && i < 24; i++) {
      JsonObject o = arr.add<JsonObject>();
      o["ssid"] = WiFi.SSID(i); o["rssi"] = WiFi.RSSI(i);
      o["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
    }
    String s; serializeJson(doc, s);
    localHttp.send(200, "application/json", s);
  });

  // /wifi/selected-ssid — returns the SSID the rep tapped on device screen
  localHttp.on("/wifi/selected-ssid", HTTP_GET, []() {
    String j = "{\"ssid\":\"" + pendingSsid + "\"}";
    localHttp.send(200, "application/json", j);
  });

  // /wifi/reconfigure — save new credentials only, keep JWT + pairing
  localHttp.on("/wifi/reconfigure", HTTP_POST, []() {
    JsonDocument req;
    if (deserializeJson(req, localHttp.arg("plain"))) {
      localHttp.send(400, "application/json", "{\"error\":\"Bad JSON\"}"); return;
    }
    String ssid = req["ssid"] | "";
    String pass = req["password"] | "";
    if (ssid.isEmpty()) {
      localHttp.send(400, "application/json", "{\"error\":\"SSID required\"}"); return;
    }
    // Test the new credentials before saving
    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) {
      delay(200); localHttp.handleClient();
    }
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.mode(WIFI_AP);
      localHttp.send(502, "application/json", "{\"error\":\"Could not connect — check password\"}"); return;
    }
    // Connected — save only WiFi credentials, leave JWT/pairing untouched
    wifiSSID = ssid; wifiPass = pass;
    prefs.begin("kodex", false);
    prefs.putString("ssid", wifiSSID);
    prefs.putString("pass", wifiPass);
    prefs.end();
    LOG("WiFi updated → " + ssid);
    localHttp.send(200, "application/json", "{\"ok\":true}");
    delay(1200); ESP.restart();
  });

  localHttp.begin();
  curScreen = WIFI_RECONFIG;
  drawWifiReconfig(ap);
}

// ── CONNECTING ────────────────────────────────────────────────────────────────
static void drawConnecting(const String& ssid) {
  spr.fillSprite(COL_BG);

  // ── Header ───────────────────────────────────────────────────────────────────
  drawHeader(spr, false);
  // Accent bar below header (connecting state = primary)
  spr.fillRect(0, 44, SW, 2, COL_PRIMARY);

  // ── Title ────────────────────────────────────────────────────────────────────
  spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_BG);
  const char* t = "Connecting";
  int32_t tw = spr.textWidth(t);
  spr.setCursor((SW - tw) / 2, 54); spr.print(t);

  // ── Three pulsing concentric rings ───────────────────────────────────────────
  uint32_t ms = millis();
  int32_t cx = SW / 2, cy = 165;

  // Phase cycles: ring 1 in → ring 2 in → ring 3 in over ~1.8 s
  uint8_t phase = (uint8_t)((ms / 600) % 3);
  // Ring 3 — outermost r=60
  {
    uint16_t rc = (phase == 2) ? COL_PRIMARY : COL_BORDER;
    for (int8_t d = -1; d <= 1; d++) spr.drawCircle(cx, cy, 60 + d, rc);
  }
  // Ring 2 — middle r=42
  {
    uint16_t rc = (phase >= 1) ? COL_PRIMARY : COL_BORDER;
    for (int8_t d = -1; d <= 1; d++) spr.drawCircle(cx, cy, 42 + d, rc);
  }
  // Ring 1 — inner r=26
  {
    uint16_t rc = COL_PRIMARY;
    for (int8_t d = -1; d <= 1; d++) spr.drawCircle(cx, cy, 26 + d, rc);
  }
  // Center dot
  spr.fillCircle(cx, cy, 14, COL_PRIMARY);
  spr.drawCircle(cx, cy, 16, COL_BORDER);
  // "D" inside center
  spr.setFont(F_TINY); spr.setTextColor(COL_BG, COL_PRIMARY);
  tw = spr.textWidth("D");
  spr.setCursor(cx - tw / 2, cy - 4); spr.print("D");

  // ── SSID pill card ────────────────────────────────────────────────────────────
  spr.fillRoundRect(16, 240, SW - 32, 46, 8, COL_CARD);
  spr.drawRoundRect(16, 240, SW - 32, 46, 8, COL_BORDER);

  // WiFi icon in the pill
  spr.fillCircle(36, 263, 3, COL_PRIMARY);
  spr.drawArc(36, 267, 9, 7, 215, 325, COL_PRIMARY);
  spr.drawArc(36, 267, 15, 13, 210, 330, COL_BORDER);

  spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
  String s = ssid;
  if (spr.textWidth(s) > SW - 76) s = s.substring(0, 13) + "..";
  spr.setCursor(56, 248); spr.print(s);

  // Animated status text
  uint8_t dots = (uint8_t)((ms / 500) % 4);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  String statusTxt = "Establishing connection";
  for (uint8_t d = 0; d < dots; d++) statusTxt += ".";
  spr.setCursor(56, 266); spr.print(statusTxt);

  spr.pushSprite(0, 0);
}

// ── READY — Waiting for Session ───────────────────────────────────────────────
static void drawReady() {
  spr.fillSprite(COL_BG);

  bool syncOnline = (WiFi.status() == WL_CONNECTED);

  // ── Header ───────────────────────────────────────────────────────────────────
  drawHeader(spr, syncOnline);
  // Success accent line below header
  spr.fillRect(0, 44, SW, 2, COL_SUCCESS);

  drawTabBar(spr, 0);  // Home tab active

  // Content area y=56..278
  // ── READY status label ───────────────────────────────────────────────────────
  spr.setFont(F_MED); spr.setTextColor(COL_SUCCESS, COL_BG);
  const char* rdyLbl = "READY";
  int32_t tw = spr.textWidth(rdyLbl);
  spr.setCursor((SW - tw) / 2, 56); spr.print(rdyLbl);

  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  const char* subLbl = "Waiting for session";
  tw = spr.textWidth(subLbl);
  spr.setCursor((SW - tw) / 2, 82); spr.print(subLbl);

  // ── Pulse ring animation ──────────────────────────────────────────────────────
  uint32_t ms  = millis();
  uint8_t  p   = (uint8_t)((ms / 600) % 4);
  int32_t  pcx = SW / 2, pcy = 168;

  // Four concentric rings pulsing outward
  uint16_t rc4 = (p == 3) ? COL_PRIMARY : COL_BORDER;
  uint16_t rc3 = (p >= 2) ? COL_PRIMARY : COL_BORDER;
  uint16_t rc2 = (p >= 1) ? COL_PRIMARY : COL_BORDER;
  for (int8_t d = -1; d <= 1; d++) {
    spr.drawCircle(pcx, pcy, 65 + d, rc4);
    spr.drawCircle(pcx, pcy, 50 + d, rc3);
    spr.drawCircle(pcx, pcy, 35 + d, rc2);
    spr.drawCircle(pcx, pcy, 20 + d, COL_PRIMARY);
  }
  // Center filled circle with "D"
  spr.fillCircle(pcx, pcy, 14, COL_PRIMARY);
  spr.drawCircle(pcx, pcy, 16, COL_SUCCESS);
  spr.setFont(F_TINY); spr.setTextColor(COL_BG, COL_PRIMARY);
  tw = spr.textWidth("D");
  spr.setCursor(pcx - tw / 2, pcy - 4); spr.print("D");

  // ── Bottom info card (y=238..276) ─────────────────────────────────────────────
  spr.fillRoundRect(10, 238, SW - 20, 40, 6, COL_CARD);
  spr.drawRoundRect(10, 238, SW - 20, 40, 6, COL_BORDER);

  if (!sessionLecturer.isEmpty() || !sessionCourse.isEmpty()) {
    // Show pending session info
    String lbl1 = sessionLecturer.isEmpty() ? sessionCourse : sessionLecturer;
    if (spr.textWidth(lbl1) > SW - 40) lbl1 = lbl1.substring(0, 18) + "..";
    spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
    tw = spr.textWidth(lbl1);
    spr.setCursor((SW - tw) / 2, 246); spr.print(lbl1);
    if (!sessionCourse.isEmpty() && !sessionLecturer.isEmpty()) {
      spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
      String c = sessionCourse;
      if (spr.textWidth(c) > SW - 40) c = c.substring(0, 24) + "..";
      tw = spr.textWidth(c);
      spr.setCursor((SW - tw) / 2, 264); spr.print(c);
    }
  } else {
    // Default info: WiFi + SD status
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    // Left: WiFi status
    uint16_t wfC = syncOnline ? COL_SUCCESS : COL_MUTED;
    spr.fillCircle(22, 252, 4, wfC);
    spr.setTextColor(wfC, COL_CARD);
    String wfStr = syncOnline ? ("WiFi: " + wifiSSID) : "WiFi: Offline";
    if (spr.textWidth(wfStr) > 100) wfStr = wfStr.substring(0, 14) + "..";
    spr.setCursor(30, 248); spr.print(wfStr);
    // Right: SD status
    uint16_t sdC = sdAvailable ? COL_SUCCESS : COL_WARNING;
    spr.fillCircle(22, 268, 4, sdC);
    spr.setTextColor(sdC, COL_CARD);
    spr.setCursor(30, 264); spr.print(sdAvailable ? "SD Ready" : "No SD Card");
    // Enrolled count if available
    if (sessionTotalEnrolled > 0) {
      spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
      String enr = String(sessionTotalEnrolled) + " enrolled";
      spr.setCursor(140, 264); spr.print(enr);
    }
  }

  spr.pushSprite(0, 0);
}

// ── SESSION_START — Duration picker (offline session start) ──────────────────
static void drawSessionStart() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Start Session", online);
  drawTabBar(spr, 1);  // Session tab active

  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  int32_t tw = spr.textWidth("Select session duration:");
  spr.setCursor((SW - tw) / 2, 58); spr.print("Select session duration:");

  // 2x2 duration button grid
  // bw=107, bh=76. Columns at x=8 and x=8+107+10=125. Rows at y=72 and y=156.
  const int32_t bw = 107, bh = 76, gap = 10;
  const int32_t x0 = 8, x1 = x0 + bw + gap;
  const int32_t y0 = 72, y1 = y0 + bh + gap;

  struct { int32_t x, y; const char* label; const char* sub; } btns[4] = {
    { x0, y0, "30 min", "" },
    { x1, y0, "45 min", "" },
    { x0, y1, "1 hour", "" },
    { x1, y1, "2 hours", "" },
  };

  for (int i = 0; i < 4; i++) {
    spr.fillRoundRect(btns[i].x, btns[i].y, bw, bh, 8, COL_DIM_CARD);
    spr.drawRoundRect(btns[i].x, btns[i].y, bw, bh, 8, COL_PRIMARY);

    spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_DIM_CARD);
    tw = spr.textWidth(btns[i].label);
    spr.setCursor(btns[i].x + (bw - tw) / 2, btns[i].y + bh/2 - 8);
    spr.print(btns[i].label);
  }

  // Offline note
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  tw = spr.textWidth("Students connect to hotspot — no internet needed");
  if (tw > SW - 8) {
    spr.setCursor(4, 242); spr.print("Students connect to hotspot");
    tw = spr.textWidth("— no internet needed");
    spr.setCursor((SW - tw) / 2, 256); spr.print("— no internet needed");
  } else {
    spr.setCursor((SW - tw) / 2, 248); spr.print("Students connect to hotspot — no internet needed");
  }

  spr.pushSprite(0, 0);
}

// ── SESSION — Attendance Code Display ────────────────────────────────────────
static void drawSession(const String& code, uint32_t secsLeft, uint32_t secsTotal) {
  spr.fillSprite(COL_BG);

  // ── Header ───────────────────────────────────────────────────────────────────
  spr.fillRect(0, 0, SW, 44, COL_CARD);
  spr.fillRect(0, 44, SW, 2, COL_SUCCESS);
  // Live session indicator — pulsing dot
  uint32_t ms = millis();
  uint16_t dotPulse = ((ms / 600) % 2 == 0) ? COL_SUCCESS : 0x1342;
  spr.fillCircle(14, 22, 6, dotPulse);
  spr.fillCircle(14, 22, 3, COL_CARD);
  spr.fillCircle(14, 22, 1, dotPulse);
  spr.setFont(F_SMALL); spr.setTextColor(COL_SUCCESS, COL_CARD);
  spr.setCursor(26, 14); spr.print("Session Active");
  // Online dot top-right
  bool online = (WiFi.status() == WL_CONNECTED);
  uint16_t odC = online ? COL_SUCCESS : COL_MUTED;
  spr.fillCircle(219, 14, 4, odC);
  spr.setFont(F_TINY); spr.setTextColor(odC, COL_CARD);
  spr.setCursor(227, 8); spr.print(online ? "ON" : "OFF");

  drawTabBar(spr, 1);  // Session tab active

  // ── Course + Lecturer row card (y=56..90) ─────────────────────────────────────
  spr.fillRoundRect(8, 56, SW - 16, 34, 6, COL_CARD);
  spr.drawRoundRect(8, 56, SW - 16, 34, 6, COL_BORDER);

  String courseStr = sessionCourse.isEmpty() ? sessionTitle : sessionCourse;
  if (courseStr.isEmpty()) courseStr = "Attendance";
  spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
  if (spr.textWidth(courseStr) > SW - 100) courseStr = courseStr.substring(0, 12) + "..";
  spr.setCursor(14, 62); spr.print(courseStr);

  if (!sessionLecturer.isEmpty()) {
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    String lect = sessionLecturer;
    if (spr.textWidth(lect) > 110) lect = lect.substring(0, 16) + "..";
    int32_t lw2 = spr.textWidth(lect);
    spr.setCursor(SW - lw2 - 14, 70); spr.print(lect);
  }

  // ── Timer (directly below header) ────────────────────────────────────────────
  uint16_t barCol = secsLeft > 120 ? COL_SUCCESS : secsLeft > 60 ? COL_WARNING : COL_ERROR;
  uint32_t mins = secsLeft / 60, secs = secsLeft % 60;
  char timerBuf[12];
  if (mins > 0) snprintf(timerBuf, sizeof(timerBuf), "%um %02us", (unsigned)mins, (unsigned)secs);
  else          snprintf(timerBuf, sizeof(timerBuf), "%us", (unsigned)secs);
  spr.setFont(F_TINY); spr.setTextColor(barCol, COL_BG);
  int32_t tw = spr.textWidth(timerBuf);
  spr.setCursor((SW - tw) / 2, 96); spr.print(timerBuf);
  int32_t barW = (secsTotal > 0) ? (int32_t)((SW - 32) * secsLeft / secsTotal) : 0;
  spr.fillRoundRect(16, 106, SW - 32, 4, 2, COL_DIM_CARD);
  if (barW > 0) spr.fillRoundRect(16, 106, barW, 4, 2, barCol);

  // ── Stats row: Present | Time (y=116..256) ───────────────────────────────────
  int32_t cw = (SW - 26) / 2;

  // Present card — tall, big count
  spr.fillRoundRect(8, 116, cw, 138, 6, COL_CARD);
  spr.drawRoundRect(8, 116, cw, 138, 6, COL_BORDER);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  tw = spr.textWidth("Present");
  spr.setCursor(8 + (cw - tw) / 2, 124); spr.print("Present");
  spr.setTextFont(7); spr.setTextSize(1);
  spr.setTextColor(COL_SUCCESS, COL_CARD);
  String ps = String(studentsMarked);
  tw = spr.textWidth(ps);
  spr.setCursor(8 + (cw - tw) / 2, 148); spr.print(ps);
  if (sessionTotalEnrolled > 0) {
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    String totLbl = "/ " + String(sessionTotalEnrolled);
    tw = spr.textWidth(totLbl);
    spr.setCursor(8 + (cw - tw) / 2, 238); spr.print(totLbl);
  }

  // Time card
  int32_t tc = 18 + cw;
  spr.fillRoundRect(tc, 116, cw, 138, 6, COL_CARD);
  spr.drawRoundRect(tc, 116, cw, 138, 6, COL_BORDER);
  time_t nowT = time(nullptr); struct tm tmNow; localtime_r(&nowT, &tmNow);
  char timeBuf[9]; strftime(timeBuf, sizeof(timeBuf), "%I:%M %p", &tmNow);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  tw = spr.textWidth("Time");
  spr.setCursor(tc + (cw - tw) / 2, 124); spr.print("Time");
  spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
  tw = spr.textWidth(timeBuf);
  spr.setCursor(tc + (cw - tw) / 2, 170); spr.print(timeBuf);
  uint16_t sdC = sdAvailable ? COL_SUCCESS : COL_MUTED;
  spr.fillCircle(tc + 10, 241, 3, sdC);
  spr.setFont(F_TINY); spr.setTextColor(sdC, COL_CARD);
  spr.setCursor(tc + 17, 238);
  spr.print(sdAvailable ? (sdRecordCount > 0 ? "SD pend" : "SD OK") : "RAM");

  spr.pushSprite(0, 0);
}

// ── PAIR LECTURER — Screen 2 (hotspot connection info + spinner) ──────────────
static void drawPairScreen() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Pair Lecturer", online);
  drawTabBar(spr, 0);

  String apName = "Dikly-" + macSuffix();

  // ── Hotspot card ─────────────────────────────────────────────────────────────
  spr.fillRoundRect(10, 56, SW - 20, 80, 6, COL_CARD);
  spr.drawRoundRect(10, 56, SW - 20, 80, 6, COL_BORDER);

  // WiFi icon circle
  spr.fillCircle(32, 90, 14, COL_DIM_CARD);
  spr.drawCircle(32, 90, 14, COL_BORDER);
  spr.fillCircle(32, 94, 3, COL_CYAN);
  spr.drawArc(32, 96, 8, 6, 215, 325, COL_CYAN);
  spr.drawArc(32, 96, 14, 12, 210, 330, COL_BORDER);

  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(54, 64); spr.print("Connect to:");
  spr.setFont(F_SMALL); spr.setTextColor(COL_CYAN, COL_CARD);
  String shortAp = apName;
  if (spr.textWidth(shortAp) > SW - 80) shortAp = shortAp.substring(0, 14) + "..";
  spr.setCursor(54, 78); spr.print(shortAp);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(54, 98); spr.print("Open network — no password");
  spr.setCursor(54, 112); spr.print("Then open 192.168.4.1");

  // ── Device ID card ────────────────────────────────────────────────────────────
  spr.fillRoundRect(10, 144, SW - 20, 44, 6, COL_CARD);
  spr.drawRoundRect(10, 144, SW - 20, 44, 6, COL_BORDER);

  // Lock icon circle
  spr.fillCircle(32, 166, 14, COL_DIM_CARD);
  spr.drawCircle(32, 166, 14, COL_BORDER);
  spr.fillRoundRect(26, 164, 12, 9, 2, COL_MUTED);
  spr.fillRect(28, 160, 8, 6, COL_DIM_CARD);
  spr.drawRoundRect(28, 157, 8, 8, 4, COL_MUTED);
  spr.fillCircle(32, 168, 2, COL_DIM_CARD);

  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(54, 151); spr.print("Device ID:");
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(54, 165); spr.print(deviceId);

  // ── Waiting spinner card ──────────────────────────────────────────────────────
  spr.fillRoundRect(10, 196, SW - 20, 52, 6, COL_CARD);
  spr.drawRoundRect(10, 196, SW - 20, 52, 6, COL_BORDER);

  // Three-dot spinner using millis
  uint32_t ms = millis();
  uint8_t dotPhase = (uint8_t)((ms / 400) % 4);
  for (uint8_t d = 0; d < 3; d++) {
    uint16_t dc = (d < dotPhase) ? COL_PRIMARY : COL_DIM_CARD;
    spr.fillCircle(26 + (int32_t)d * 14, 218, 5, dc);
  }

  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(70, 211); spr.print("Waiting for connection...");
  spr.setCursor(70, 226); spr.print("Device is active as hotspot");

  // Institution label
  if (!institutionCode.isEmpty()) {
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    String instLbl = "Institution: " + institutionCode;
    int32_t lw2 = spr.textWidth(instLbl);
    spr.setCursor((SW - lw2) / 2, 258); spr.print(instLbl);
  }

  spr.pushSprite(0, 0);
}

// ── ATTENDANCE SUMMARY — Screen 4 ─────────────────────────────────────────────
static void drawSummary() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Session Summary", online);
  drawTabBar(spr, 2);  // Records tab active

  // Course subtitle
  if (!summaryCourse.isEmpty()) {
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    String cl = summaryCourse;
    if (spr.textWidth(cl) > SW - 28) cl = cl.substring(0, 26) + "..";
    int32_t clw = spr.textWidth(cl);
    spr.setCursor((SW - clw) / 2, 50); spr.print(cl);
  }

  // ── 2×2 stat grid (y=64..196) ─────────────────────────────────────────────────
  int32_t gW = (SW - 26) / 2;  // ~107 px per cell
  int32_t gH = 62;
  uint32_t absentNum = (summaryTotal > summaryPresent) ? summaryTotal - summaryPresent : 0;
  char pctBuf[8]; snprintf(pctBuf, sizeof(pctBuf), "%.0f%%", summaryPct);

  // Helper lambda for stat cell
  auto statCell = [&](int32_t x, int32_t y, const char* lbl, const char* val, uint16_t vc) {
    spr.fillRoundRect(x, y, gW, gH, 6, COL_CARD);
    spr.drawRoundRect(x, y, gW, gH, 6, COL_BORDER);
    // Top accent line in value color
    spr.fillRect(x + 6, y + 1, gW - 12, 2, vc);
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    int32_t lw2 = spr.textWidth(lbl);
    spr.setCursor(x + (gW - lw2) / 2, y + 8); spr.print(lbl);
    spr.setFont(F_MED); spr.setTextColor(vc, COL_CARD);
    int32_t vw2 = spr.textWidth(val);
    spr.setCursor(x + (gW - vw2) / 2, y + 28); spr.print(val);
  };

  statCell(10, 62,           "Students", String(summaryTotal).c_str(),    COL_TEXT);
  statCell(18 + gW, 62,      "Present",  String(summaryPresent).c_str(),   COL_SUCCESS);
  statCell(10, 132,          "Absent",   String(absentNum).c_str(),         COL_ERROR);
  statCell(18 + gW, 132,     "Rate",     pctBuf,                            COL_PRIMARY);

  // ── Action rows (y=204..268) ──────────────────────────────────────────────────
  // Row 1: View Attendance
  spr.fillRoundRect(10, 204, SW - 20, 38, 6, COL_CARD);
  spr.drawRoundRect(10, 204, SW - 20, 38, 6, COL_BORDER);
  // List icon circle
  spr.fillCircle(28, 223, 12, COL_DIM_CARD);
  spr.fillRect(22, 218, 3, 3, COL_MUTED);
  spr.fillRect(26, 219, 8, 2, COL_MUTED);
  spr.fillRect(22, 223, 3, 3, COL_MUTED);
  spr.fillRect(26, 224, 8, 2, COL_MUTED);
  spr.fillRect(22, 228, 3, 3, COL_MUTED);
  spr.fillRect(26, 229, 6, 2, COL_MUTED);
  spr.setFont(F_TINY); spr.setTextColor(COL_TEXT, COL_CARD);
  spr.setCursor(46, 211); spr.print("View Attendance");
  spr.setTextColor(COL_MUTED, COL_CARD);
  String cLbl = summaryCourse.isEmpty() ? "Session complete" : summaryCourse;
  if (spr.textWidth(cLbl) > 160) cLbl = cLbl.substring(0, 18) + "..";
  spr.setCursor(46, 226); spr.print(cLbl);
  // Chevron right
  spr.fillRect(SW - 22, 220, 8, 3, COL_MUTED);
  spr.fillRect(SW - 16, 216, 3, 7, COL_MUTED);

  // Row 2: Export Report
  spr.fillRoundRect(10, 248, SW - 20, 38, 6, COL_CARD);
  spr.drawRoundRect(10, 248, SW - 20, 38, 6, COL_BORDER);
  // SD icon circle
  uint16_t sdIconC = sdAvailable ? COL_SUCCESS : COL_MUTED;
  spr.fillCircle(28, 267, 12, COL_DIM_CARD);
  spr.drawRoundRect(22, 260, 12, 14, 2, sdIconC);
  spr.fillRect(25, 258, 6, 4, COL_DIM_CARD);  // notch
  spr.fillRect(26, 271, 8, 2, sdIconC);
  spr.setFont(F_TINY); spr.setTextColor(COL_TEXT, COL_CARD);
  spr.setCursor(46, 256); spr.print("Export Report");
  uint16_t sdLblC = sdAvailable ? COL_SUCCESS : COL_MUTED;
  spr.setTextColor(sdLblC, COL_CARD);
  spr.setCursor(46, 271); spr.print(sdAvailable ? "SD card ready" : "No SD card");
  // Chevron right
  spr.fillRect(SW - 22, 264, 8, 3, COL_MUTED);
  spr.fillRect(SW - 16, 260, 3, 7, COL_MUTED);

  spr.pushSprite(0, 0);
}

// ── SETTINGS — Screen 5 ───────────────────────────────────────────────────────
static void drawSettings() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Settings", online);
  drawTabBar(spr, 3);  // Settings tab active

  const int32_t ROW_H = 44;

  // Draw a settings row with icon circle, label, value, optional right badge/chevron
  auto settRow = [&](int32_t idx, uint16_t iconBg, uint16_t iconCol,
                     const char* label, const char* value, uint16_t valCol,
                     bool pill, bool danger) {
    int32_t y = 56 + idx * ROW_H;
    // Row background fill
    spr.fillRect(0, y, SW, ROW_H, COL_BG);
    // Bottom divider (not on last row)
    spr.drawFastHLine(14, y + ROW_H - 1, SW - 28, COL_BORDER);

    // Icon circle
    uint16_t circBg = danger ? (uint16_t)0x2000 : iconBg;
    spr.fillCircle(27, y + 22, 13, circBg);
    spr.drawCircle(27, y + 22, 13, danger ? COL_ERROR : COL_BORDER);

    // Icon text/glyph (single char drawn centered in the circle)
    spr.setFont(F_TINY); spr.setTextColor(iconCol, circBg);
    int32_t iw = spr.textWidth(label[0] == 'W' ? "~" :
                               label[0] == 'S' ? "S" :
                               label[0] == 'B' ? "O" :
                               label[0] == 'R' ? "R" :
                               label[0] == 'D' ? "i" : "!");
    // Draw simple pixel icon by label type
    if (danger) {
      // Warning triangle
      spr.fillTriangle(27, y + 12, 20, y + 31, 34, y + 31, COL_ERROR);
      spr.fillTriangle(27, y + 16, 22, y + 29, 32, y + 29, circBg);
      spr.fillRect(26, y + 18, 3, 6, COL_ERROR);
      spr.fillRect(26, y + 25, 3, 2, COL_ERROR);
    } else if (label[0] == 'W') {
      // WiFi icon
      spr.fillCircle(27, y + 25, 3, iconCol);
      spr.drawArc(27, y + 27, 7, 5, 215, 325, iconCol);
      spr.drawArc(27, y + 27, 12, 10, 210, 330, iconCol);
    } else if (label[0] == 'S') {
      // Sync arrows
      spr.drawArc(27, y + 22, 8, 6, 30, 150, iconCol);
      spr.drawArc(27, y + 22, 8, 6, 200, 330, iconCol);
      spr.fillTriangle(27, y + 14, 31, y + 20, 23, y + 20, iconCol);
      spr.fillTriangle(27, y + 30, 31, y + 24, 23, y + 24, iconCol);
    } else if (label[0] == 'B') {
      // Brightness / sun
      spr.fillCircle(27, y + 22, 4, iconCol);
      for (int8_t a = 0; a < 4; a++) {
        int32_t rx = (a == 0 || a == 2) ? 0 : (a == 1 ? 10 : -10);
        int32_t ry = (a == 1 || a == 3) ? 0 : (a == 0 ? -10 : 10);
        spr.fillRect(27 + rx - 1, y + 22 + ry - 1, 2, 2, iconCol);
      }
    } else if (label[0] == 'R') {
      // Signal bars icon for RSSI Range
      for (int8_t b = 0; b < 4; b++) {
        int32_t bh = 4 + b * 3;
        spr.fillRect(20 + b * 4, y + 32 - bh, 3, bh, iconCol);
      }
    } else {
      // Info "i"
      spr.fillCircle(27, y + 16, 2, iconCol);
      spr.fillRoundRect(25, y + 20, 4, 9, 1, iconCol);
    }

    // Label
    spr.setFont(F_TINY); spr.setTextColor(danger ? COL_ERROR : COL_TEXT, COL_BG);
    spr.setCursor(48, y + 11); spr.print(label);

    // Value / badge
    if (value && value[0]) {
      if (pill) {
        // Status pill
        uint16_t pc = valCol;
        spr.setFont(F_TINY);
        int32_t pw = spr.textWidth(value) + 12;
        int32_t px = SW - pw - 14;
        spr.fillRoundRect(px, y + 24, pw, 14, 7, pc);
        spr.setTextColor(COL_BG, pc);
        spr.setCursor(px + 6, y + 28); spr.print(value);
      } else {
        spr.setFont(F_TINY); spr.setTextColor(valCol, COL_BG);
        String vs = String(value);
        if (spr.textWidth(vs) > 130) vs = vs.substring(0, 16) + "..";
        spr.setCursor(48, y + 26); spr.print(vs);
      }
    }

    // Chevron (only if not pill and not danger with no value shown)
    if (!pill) {
      spr.fillRect(SW - 16, y + 19, 6, 3, COL_MUTED);
      spr.fillRect(SW - 13, y + 14, 3, 8, COL_MUTED);
    }
  };

  bool isOnline = (WiFi.status() == WL_CONNECTED);
  String wfVal = wifiSSID.isEmpty() ? "Not configured" :
                 (isOnline ? wifiSSID : "Connecting...");
  uint16_t wfCol = isOnline ? COL_SUCCESS : COL_MUTED;
  const char* syncVal  = isOnline ? "Connected" : "Offline";
  uint16_t syncCol2    = isOnline ? COL_SUCCESS : COL_MUTED;
  String brtStr        = (curBrightness >= 220) ? "High" :
                         (curBrightness >= 155) ? "Medium" : "Low";

  String rssiStr = String(rssiThreshold) + " dBm";
  settRow(0, COL_DIM_CARD, COL_PRIMARY,  "Wi-Fi Network",     wfVal.c_str(),  wfCol,    false, false);
  settRow(1, COL_DIM_CARD, COL_TEAL,     "Sync Status",       syncVal,        syncCol2, true,  false);
  settRow(2, COL_DIM_CARD, COL_WARNING,  "Brightness",        brtStr.c_str(), COL_TEXT, false, false);
  settRow(3, COL_DIM_CARD, COL_CYAN,     "RSSI Range",        rssiStr.c_str(),COL_TEXT, false, false);
  settRow(4, COL_DIM_CARD, COL_INDIGO,   "Device Information","",             COL_MUTED,false, false);
  settRow(5, 0x2000,       COL_ERROR,    "Factory Reset",     "Hold 3s",      COL_ERROR,false, true);

  spr.pushSprite(0, 0);
}

// ── DEVICE INFO — Screen 6 ────────────────────────────────────────────────────
static void drawDeviceInfo() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Device Info", online);
  drawTabBar(spr, 3);  // Settings tab active

  const int32_t ROW_H = 38;

  // Compact info row: label above value with divider
  auto infoRow = [&](int32_t idx, const char* label, const String& val, uint16_t valCol) {
    int32_t y = 56 + idx * ROW_H;
    spr.fillRect(0, y, SW, ROW_H, COL_BG);
    // Left colored accent bar
    spr.fillRect(10, y + 4, 3, ROW_H - 10, COL_INDIGO);
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    spr.setCursor(18, y + 4); spr.print(label);
    spr.setFont(F_TINY); spr.setTextColor(valCol, COL_BG);
    String vs = val;
    if (spr.textWidth(vs) > SW - 28) vs = vs.substring(0, 26) + "..";
    spr.setCursor(18, y + 17); spr.print(vs);
    // Divider
    spr.drawFastHLine(14, y + ROW_H - 1, SW - 28, COL_BORDER);
  };

  infoRow(0, "Device ID",        "Dikly-" + macSuffix(),       COL_PRIMARY);
  infoRow(1, "Model",            "ESP32-S3  (ES3C28P)",         COL_TEXT);
  infoRow(2, "Firmware",         String(FIRMWARE_VERSION),      COL_TEXT);

  uint32_t upSec = millis() / 1000;
  char upBuf[24]; snprintf(upBuf, sizeof(upBuf), "%uh %02um %02us",
                           upSec / 3600, (upSec % 3600) / 60, upSec % 60);
  infoRow(3, "Uptime", String(upBuf), COL_TEXT);

  // Memory row with progress bar
  {
    int32_t y = 56 + 4 * ROW_H;
    spr.fillRect(0, y, SW, ROW_H, COL_BG);
    spr.fillRect(10, y + 4, 3, ROW_H - 10, COL_INDIGO);
    uint32_t freeH  = ESP.getFreeHeap();
    uint32_t totalH = ESP.getHeapSize();
    uint32_t usedPct = (totalH > 0) ? (totalH - freeH) * 100 / totalH : 0;
    char memBuf[30];
    snprintf(memBuf, sizeof(memBuf), "%uKB free / %uKB", freeH / 1024, totalH / 1024);
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    spr.setCursor(18, y + 4); spr.print("Memory");
    spr.setTextColor(COL_TEXT, COL_BG);
    spr.setCursor(18, y + 17); spr.print(memBuf);
    // Progress bar
    uint16_t memBarC = (usedPct > 80) ? COL_ERROR : (usedPct > 60) ? COL_WARNING : COL_SUCCESS;
    int32_t bw2 = SW - 28, bf2 = (int32_t)(bw2 * usedPct / 100);
    spr.fillRoundRect(14, y + 30, bw2, 4, 2, COL_BORDER);
    if (bf2 > 0) spr.fillRoundRect(14, y + 30, bf2, 4, 2, memBarC);
    spr.drawFastHLine(14, y + ROW_H - 1, SW - 28, COL_BORDER);
  }

  // SD card row
  String sdStr = sdAvailable ?
    ("Present — " + String((uint32_t)(SD_MMC.cardSize() / (1024ULL * 1024ULL))) + " MB") :
    "Not found";
  infoRow(5, "SD Card", sdStr, sdAvailable ? COL_SUCCESS : COL_MUTED);

  spr.pushSprite(0, 0);
}

// ─── Captive-Portal Pairing HTML ─────────────────────────────────────────────
static const char PAIR_HTML[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dikly Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;max-width:440px;margin:0 auto}
  .logo{font-size:28px;font-weight:900;color:#e2e8f0;margin:12px 0 2px}
  .logo span{color:#6366f1}
  .sub{font-size:13px;color:#64748b;margin-bottom:28px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:20px;margin-bottom:16px}
  h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#6366f1;margin-bottom:14px}
  label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:12px 0 5px}
  label:first-child{margin-top:0}
  input{width:100%;padding:11px 13px;border-radius:9px;border:1.5px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px;transition:border-color .15s}
  input:focus{outline:none;border-color:#6366f1}
  .row{display:flex;gap:8px}
  .row input{flex:1}
  .scan-btn{padding:11px 14px;border-radius:9px;border:1.5px solid #6366f1;background:transparent;color:#6366f1;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
  .scan-btn:disabled{opacity:.4;cursor:default}
  .nets{margin-top:8px;border:1px solid #1e293b;border-radius:10px;overflow:hidden;max-height:180px;overflow-y:auto}
  .net{padding:10px 14px;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;border-bottom:1px solid #0f172a}
  .net:last-child{border-bottom:0}
  .net:hover,.net.sel{background:#1e3a5f}
  .bars{font-size:11px;color:#64748b}
  .submit{width:100%;padding:13px;border-radius:10px;border:0;background:#6366f1;color:#fff;font-weight:700;font-size:15px;cursor:pointer;margin-top:6px;transition:opacity .15s}
  .submit:disabled{opacity:.5;cursor:default}
  .ok{background:#052e16;border:1px solid #166534;color:#22c55e;padding:12px 14px;border-radius:10px;font-size:13px;margin-top:12px}
  .err{background:#450a0a;border:1px solid #991b1b;color:#fca5a5;padding:12px 14px;border-radius:10px;font-size:13px;margin-top:12px}
</style></head>
<body>
  <div class="logo">Di<span>kly</span></div>
  <p class="sub">Attendance Device Setup</p>
  <form id="f">
    <div class="card">
      <h3>Institution</h3>
      <label>Institution Code</label>
      <input id="ic" name="institutionCode" required autocomplete="off" placeholder="e.g. ABCD23" style="text-transform:uppercase">
      <label>Pairing Code <span style="color:#334155;font-weight:400">(from Admin Portal)</span></label>
      <input id="pc" name="pairingCode" required autocomplete="off" placeholder="from admin portal" maxlength="8" style="text-transform:uppercase">
    </div>
    <div class="card">
      <h3>School WiFi <span style="font-size:10px;font-weight:400;color:#475569;text-transform:none">(optional — for sync only)</span></h3>
      <p style="font-size:11px;color:#64748b;margin-bottom:10px">Device works offline without this. Add WiFi only if you want records to sync automatically to the portal.</p>
      <label>Network</label>
      <div class="row">
        <input id="ssid" name="ssid" autocomplete="off" placeholder="Select or type SSID (optional)">
        <button type="button" class="scan-btn" id="sb" onclick="scan()">Scan</button>
      </div>
      <div id="nl" class="nets" style="display:none"></div>
      <label>Password</label>
      <input name="password" type="password" autocomplete="new-password" placeholder="Leave blank if open">
      <label style="margin-top:16px;font-size:10px;color:#475569">Server (advanced)</label>
      <input name="apiBase" value="https://dikly.sbs" style="font-size:12px;color:#475569">
    </div>
    <button type="submit" class="submit" id="b">Pair Device</button>
  </form>
  <div id="msg"></div>
<script>
async function scan(){
  const sb=document.getElementById('sb'),nl=document.getElementById('nl');
  sb.disabled=true;sb.textContent='…';nl.style.display='block';
  nl.innerHTML='<div style="padding:10px 14px;font-size:12px;color:#64748b">Scanning…</div>';
  try{
    const r=await fetch('/wifi/scan');const nets=await r.json();
    if(!nets.length){nl.innerHTML='<div style="padding:10px 14px;font-size:12px;color:#64748b">No networks found.</div>';return;}
    nets.sort((a,b)=>(b.rssi||0)-(a.rssi||0));
    nl.innerHTML=nets.map(n=>{
      const bars=n.rssi>-60?'▂▄▆█':n.rssi>-75?'▂▄▆':n.rssi>-85?'▂▄':'▂';
      const lock=n.open===false?'🔒 ':'';
      const s=(n.ssid||'').replace(/'/g,"\\'");
      return `<div class="net" onclick="pick(this,'${s}')"><span>${n.ssid||'(Hidden)'}</span><span class="bars">${lock}${bars}</span></div>`;
    }).join('');
  }catch(e){nl.innerHTML='<div style="padding:10px;color:#fca5a5">Scan failed</div>';}
  finally{sb.disabled=false;sb.textContent='Scan';}
}
function pick(el,ssid){
  document.getElementById('ssid').value=ssid;
  document.querySelectorAll('.net').forEach(i=>i.classList.remove('sel'));
  el.classList.add('sel');
}
document.getElementById('f').onsubmit=async(e)=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.target));
  d.institutionCode=d.institutionCode.toUpperCase().trim();
  d.pairingCode=d.pairingCode.toUpperCase().trim();
  const m=document.getElementById('msg'),b=document.getElementById('b');
  b.disabled=true;m.className='';m.textContent='Pairing — this may take 30 s…';
  try{
    const r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||'Pairing failed');
    m.className='ok';m.textContent='✓ Connecting to WiFi & pairing… device will reboot in ~30 s. You can close this.';
  }catch(err){m.className='err';m.textContent='✗ '+err.message;b.disabled=false;}
};
</script></body></html>)HTML";

// ── PAIRING STATUS — step-by-step feedback during async pair ─────────────────
// step: 0=error, 1=wifi, 2=clock, 3=server, 4=done
static void drawPairStatus(const char* title, const char* line1, const char* line2, uint8_t step) {
  spr.fillSprite(COL_BG);

  // ── Compact header (no tab bar, no back button) ───────────────────────────────
  spr.setFont(F_LOGO); spr.setTextSize(1);
  spr.setTextColor(COL_CYAN, COL_BG);
  spr.setCursor(12, 8); spr.print("DIKLY");
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  spr.setCursor(12, 30); spr.print("Device Pairing");
  spr.drawFastHLine(12, 44, SW - 24, COL_BORDER);

  // ── Step progress dots (y=20 area — shifted to y=52) ─────────────────────────
  const uint8_t STEPS = 5;
  uint16_t titleCol = (step == 0) ? COL_ERROR : (step >= 4) ? COL_SUCCESS : COL_CYAN;
  int32_t dotSpacing = (SW - 32) / (STEPS - 1);
  for (uint8_t i = 1; i <= STEPS; i++) {
    int32_t dx = 16 + (i - 1) * dotSpacing;
    bool done    = (step > 0 && i < step);
    bool current = (i == step && step > 0);
    bool future  = (!done && !current);
    uint16_t dc  = done ? COL_SUCCESS : current ? titleCol : COL_BORDER;
    int32_t  dr  = done ? 6 : current ? 7 : 5;
    spr.fillCircle(dx, 56, dr, dc);
    if (done || current) spr.drawCircle(dx, 56, dr + 2, dc);
    if (i < STEPS)
      spr.drawFastHLine(dx + dr + 2, 56, dotSpacing - 2 * (dr + 2) - 2,
                        done ? COL_SUCCESS : COL_BORDER);
    // Step labels
    const char* stepLbls[] = {"Init", "WiFi", "Clock", "Server", "Done"};
    spr.setFont(F_TINY); spr.setTextColor(current ? titleCol : COL_MUTED, COL_BG);
    int32_t lw2 = spr.textWidth(stepLbls[i - 1]);
    spr.setCursor(dx - lw2 / 2, 67); spr.print(stepLbls[i - 1]);
  }

  // ── Large status icon circle (y=82..132) ─────────────────────────────────────
  const int32_t icx = SW / 2, icy = 108;
  const int32_t icr = 28;
  spr.fillCircle(icx, icy, icr, COL_DIM_CARD);
  spr.drawCircle(icx, icy, icr, step == 0 ? COL_ERROR : step >= 4 ? COL_SUCCESS : COL_BORDER);
  spr.drawCircle(icx, icy, icr + 2, step == 0 ? 0x3000 : step >= 4 ? 0x0342 : COL_BORDER);

  if (step == 0) {
    // Error X
    spr.fillRect(icx - 8, icy - 2, 16, 4, COL_ERROR);
    spr.fillRect(icx - 2, icy - 8, 4, 16, COL_ERROR);
    // Rotate 45 — draw diagonals
    for (int8_t d = -2; d <= 2; d++) {
      spr.drawLine(icx - 10, icy - 10 + d, icx + 10, icy + 10 + d, COL_ERROR);
      spr.drawLine(icx + 10, icy - 10 + d, icx - 10, icy + 10 + d, COL_ERROR);
    }
  } else if (step >= 4) {
    // Checkmark
    for (int8_t t = -2; t <= 2; t++) {
      spr.drawLine(icx - 10, icy + t,     icx - 2, icy + 8 + t,  COL_SUCCESS);
      spr.drawLine(icx - 2,  icy + 8 + t, icx + 10, icy - 6 + t, COL_SUCCESS);
    }
  } else {
    // Spinner using millis
    uint8_t sp = (uint8_t)((millis() / 150) % 8);
    const char* spinF[] = {"|", "/", "-", "\\", "|", "/", "-", "\\"};
    spr.setFont(F_MED); spr.setTextColor(COL_CYAN, COL_DIM_CARD);
    int32_t fw = spr.textWidth(spinF[sp]);
    spr.setCursor(icx - fw / 2, icy - 12); spr.print(spinF[sp]);
  }

  // ── Title ─────────────────────────────────────────────────────────────────────
  spr.setFont(F_SMALL); spr.setTextColor(titleCol, COL_BG);
  int32_t tw = spr.textWidth(title);
  spr.setCursor((SW - tw) / 2, 144); spr.print(title);

  // ── Info card ─────────────────────────────────────────────────────────────────
  uint16_t cardBd = (step == 0) ? COL_ERROR : (step >= 4) ? COL_SUCCESS : COL_BORDER;
  spr.fillRoundRect(12, 166, SW - 24, 60, 8, COL_CARD);
  spr.drawRoundRect(12, 166, SW - 24, 60, 8, cardBd);

  if (line1 && line1[0]) {
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    spr.setCursor(22, 174); spr.print(line1);
  }
  if (line2 && line2[0]) {
    spr.setFont(F_TINY);
    uint16_t l2col = (step == 0) ? COL_ERROR : COL_MUTED;
    spr.setTextColor(l2col, COL_CARD);
    spr.setCursor(22, 192); spr.print(line2);
  }

  // ── Bottom watermark ─────────────────────────────────────────────────────────
  spr.setFont(F_TINY); spr.setTextColor(0x2104, COL_BG);
  const char* wm = "dikly.sbs";
  int32_t wmw = spr.textWidth(wm);
  spr.setCursor((SW - wmw) / 2, SH - 16); spr.print(wm);

  spr.pushSprite(0, 0);
}

// ─── Captive-portal AP startup ────────────────────────────────────────────────
static void startApPortal() {
  WiFi.mode(WIFI_AP);
  delay(100);
  String ap = "Dikly-" + macSuffix();
  WiFi.softAP(ap.c_str());
  // Wait until the AP has a real IP (0.0.0.0 means not ready yet)
  IPAddress gw;
  uint32_t t0 = millis();
  do { delay(100); gw = WiFi.softAPIP(); } while (gw == IPAddress(0,0,0,0) && millis()-t0 < 5000);
  LOG("AP: " + ap + " @ " + gw.toString());

  dns.start(53, "*", gw);

  // Serve captive portal
  auto servePage = []() { localHttp.send_P(200, "text/html", PAIR_HTML); };
  localHttp.on("/", HTTP_GET, servePage);
  localHttp.on("/generate_204", HTTP_GET, servePage);
  localHttp.on("/hotspot-detect.html", HTTP_GET, servePage);
  localHttp.onNotFound(servePage);

  localHttp.on("/wifi/scan", HTTP_GET, []() {
    int n = WiFi.scanNetworks();
    JsonDocument doc; JsonArray arr = doc.to<JsonArray>();
    for (int i = 0; i < n && i < 24; i++) {
      JsonObject o = arr.add<JsonObject>();
      o["ssid"] = WiFi.SSID(i); o["rssi"] = WiFi.RSSI(i);
      o["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
    }
    String s; serializeJson(doc, s);
    localHttp.send(200, "application/json", s);
  });

  localHttp.on("/pair", HTTP_POST, []() {
    JsonDocument req;
    if (deserializeJson(req, localHttp.arg("plain"))) {
      localHttp.send(400, "application/json", "{\"error\":\"Bad JSON\"}"); return;
    }
    String inst  = req["institutionCode"] | "";
    String pcode = req["pairingCode"]     | "";
    String ssid  = req["ssid"]            | "";
    String pass  = req["password"]        | "";
    String api   = req["apiBase"]         | DEFAULT_API_BASE;
    inst.toUpperCase(); pcode.toUpperCase();
    if (inst.length() < 4 || pcode.length() < 4) {
      localHttp.send(400, "application/json", "{\"error\":\"Institution code and pairing code required\"}"); return;
    }
    // Respond immediately so iOS captive-portal doesn't drop the connection
    // while we're switching WiFi modes. Actual connect + pair happens in loop().
    apiBase = api; wifiSSID = ssid; wifiPass = pass;
    pairPendingInst = inst; pairPendingCode = pcode;
    pairPending = true;
    localHttp.send(200, "application/json", "{\"ok\":true}");
  });

  localHttp.begin();
  curScreen = SETUP;
  drawSetup("Dikly-" + macSuffix());
}

// ─── RSSI helper: looks up a connected station's signal strength by IP ───────
// Uses the lwIP ARP table (IP→MAC) then cross-references with the softAP
// station list (MAC→RSSI).  Returns 0 if not found — caller treats 0 as "allow".
static int8_t getClientRSSI(const String& clientIp) {
  wifi_sta_list_t stalist;
  if (esp_wifi_ap_get_sta_list(&stalist) != ESP_OK || stalist.num == 0) return 0;

  // Parse IP string into 4 bytes
  uint8_t ip4[4] = {0};
  int a, b, c, d;
  if (sscanf(clientIp.c_str(), "%d.%d.%d.%d", &a, &b, &c, &d) != 4) return 0;
  ip4[0]=(uint8_t)a; ip4[1]=(uint8_t)b; ip4[2]=(uint8_t)c; ip4[3]=(uint8_t)d;
  // lwIP stores IPv4 in little-endian word
  uint32_t target = (uint32_t)ip4[0] | ((uint32_t)ip4[1]<<8) |
                    ((uint32_t)ip4[2]<<16) | ((uint32_t)ip4[3]<<24);

  // Walk ARP table to find MAC for this IP
  for (size_t i = 0; i < ARP_TABLE_SIZE; i++) {
    ip4_addr_t*    arp_ip;
    struct netif*  arp_nif;
    struct eth_addr* arp_mac;
    if (etharp_get_entry(i, &arp_ip, &arp_nif, &arp_mac) && arp_ip->addr == target) {
      // Match MAC against station list to get RSSI
      for (int j = 0; j < stalist.num; j++) {
        if (memcmp(stalist.sta[j].mac, arp_mac->addr, 6) == 0)
          return stalist.sta[j].rssi;
      }
    }
  }
  return 0;  // not found — allow through
}

// ─── Local HTTP (WiFi proxy for Attendance Device page) ──────────────────────
static void registerLocalHttp() {
  localHttp.on("/status", HTTP_GET, []() {
    JsonDocument doc;
    doc["deviceId"]        = deviceId;
    doc["firmwareVersion"] = FIRMWARE_VERSION;
    doc["wifiSSID"]        = wifiSSID;
    doc["localIp"]         = WiFi.localIP().toString();
    doc["sessionActive"]   = !sessionId.isEmpty();
    if (!sessionId.isEmpty())    doc["sessionId"]    = sessionId;
    if (!sessionTitle.isEmpty()) doc["sessionTitle"] = sessionTitle;
    String s; serializeJson(doc, s);
    localHttp.sendHeader("Access-Control-Allow-Origin", "*");
    localHttp.sendHeader("X-ESP32-Device-Token", deviceJWT.substring(0, 16));
    localHttp.send(200, "application/json", s);
  });
  localHttp.on("/wifi/scan", HTTP_GET, []() {
    int n = WiFi.scanNetworks();
    JsonDocument doc; JsonArray nets = doc["networks"].to<JsonArray>();
    for (int i = 0; i < n && i < 24; i++) {
      JsonObject o = nets.add<JsonObject>();
      o["ssid"] = WiFi.SSID(i); o["rssi"] = WiFi.RSSI(i);
      o["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
    }
    String s; serializeJson(doc, s);
    localHttp.send(200, "application/json", s);
  });
  // /session — returns a signed connection-proof token for hotspot attendance.
  // Students connect to the device AP, call this endpoint with their studentId,
  // get a short-lived HMAC-signed token, then submit it + the verbal code to
  // the backend. Proves physical presence without the device touching the backend.
  localHttp.on("/session", HTTP_GET, []() {
    if (sessionId.isEmpty() || sessionSeed.isEmpty()) {
      localHttp.send(503, "application/json", "{\"error\":\"No active session\"}"); return;
    }
    if (!timeSynced) {
      localHttp.send(503, "application/json", "{\"error\":\"Device clock not synced\"}"); return;
    }
    String studentId = localHttp.arg("studentId");
    if (studentId.isEmpty()) {
      localHttp.send(400, "application/json", "{\"error\":\"studentId required\"}"); return;
    }

    // Build the message the backend will re-derive to verify the sig.
    unsigned long issuedAt = (unsigned long)time(nullptr);
    String message = "conn:" + sessionId + ":" + studentId + ":" + String(issuedAt);

    // HMAC-SHA256(sessionSeed, message) — first 16 bytes = 32 hex chars = 128-bit sig
    uint8_t hmacOut[32];
    hmacSha256((const uint8_t*)sessionSeed.c_str(), sessionSeed.length(),
               (const uint8_t*)message.c_str(),    message.length(), hmacOut);

    char sigHex[33];
    for (int i = 0; i < 16; i++) sprintf(sigHex + i * 2, "%02x", hmacOut[i]);
    sigHex[32] = '\0';

    JsonDocument resp;
    resp["sessionId"] = sessionId;
    resp["studentId"] = studentId;
    resp["issuedAt"]  = issuedAt;
    resp["sig"]       = sigHex;
    String s; serializeJson(resp, s);

    localHttp.sendHeader("Access-Control-Allow-Origin", "*");
    localHttp.send(200, "application/json", s);
  });

  // /proof?studentId=<id> — generates a one-time signed attendance proof.
  // Unique random nonce per call; 15-second expiry; replay prevented by server.
  // The Capacitor app calls this automatically — no manual code entry needed.
  localHttp.on("/proof", HTTP_GET, []() {
    localHttp.sendHeader("Access-Control-Allow-Origin", "*");
    if (sessionId.isEmpty() || sessionSeed.isEmpty()) {
      localHttp.send(503, "application/json", "{\"error\":\"No active session\"}"); return;
    }
    if (!timeSynced && !sessionLocallyStarted) {
      localHttp.send(503, "application/json", "{\"error\":\"Device clock not synced\"}"); return;
    }
    String userId = localHttp.arg("studentId");
    if (userId.isEmpty()) {
      localHttp.send(400, "application/json", "{\"error\":\"studentId required\"}"); return;
    }
    // ── RSSI proximity check ─────────────────────────────────────────────────
    // Only issue proofs to students close enough to the device.
    // rssiThreshold is configurable in Settings (default -70 dBm).
    // A return of 0 means the lookup failed — allow through to avoid false blocks.
    String clientIp = localHttp.client().remoteIP().toString();
    int8_t clientRSSI = getClientRSSI(clientIp);
    if (clientRSSI != 0 && clientRSSI < rssiThreshold) {
      String errMsg = "{\"error\":\"Too far from classroom device. Move closer and try again.\","
                      "\"rssi\":" + String(clientRSSI) + ","
                      "\"required\":" + String(rssiThreshold) + "}";
      localHttp.send(403, "application/json", errMsg);
      LOG("RSSI reject: " + String(clientRSSI) + " dBm (thresh " + String(rssiThreshold) + ")");
      return;
    }
    uint8_t nb[8];
    for (int i = 0; i < 8; i++) nb[i] = (uint8_t)(esp_random() & 0xFF);
    char nonce[17];
    for (int i = 0; i < 8; i++) sprintf(nonce + i * 2, "%02x", nb[i]);
    nonce[16] = '\0';
    time_t rawNowP = time(nullptr);
    unsigned long ts = (unsigned long)(rawNowP < 1700000000UL
      ? (time_t)(1700000000UL + millis() / 1000) : rawNowP);
    String msg = "proof:" + sessionId + ":" + userId + ":" + String(ts) + ":" + String(nonce);
    uint8_t hmacOut[32];
    hmacSha256((const uint8_t*)sessionSeed.c_str(), sessionSeed.length(),
               (const uint8_t*)msg.c_str(), msg.length(), hmacOut);
    char sigHex[33];
    for (int i = 0; i < 16; i++) sprintf(sigHex + i * 2, "%02x", hmacOut[i]);
    sigHex[32] = '\0';
    // If &mark=1, also record attendance locally right now so the count
    // updates on screen immediately — no internet or second request needed.
    bool markNow = (localHttp.arg("mark") == "1");
    bool alreadyMarked = false;
    if (markNow) {
      if (dedupSession != sessionId) dedupClear(sessionId);
      const char* dk = userId.c_str();
      if (dedupCheck(dk)) {
        alreadyMarked = true;  // already marked this session — still return proof for cloud sync
      } else if (!sdAvailable && offlineCount >= 200) {
        localHttp.send(503, "application/json", "{\"error\":\"Offline buffer full. Internet needed.\"}"); return;
      } else {
        bool stored = false;
        if (sdAvailable) {
          File f = SD_MMC.open(SD_ATT_FILE, FILE_APPEND);
          if (f) {
            char recId[40];
            snprintf(recId, sizeof(recId), "rec_%s_%lu", macSuffix().c_str(), (uint32_t)ts);
            JsonDocument entry;
            entry["id"]        = recId;
            entry["userId"]    = userId;
            entry["sessionId"] = sessionId;
            entry["courseId"]  = sessionCourse;
            entry["timestamp"] = (uint32_t)ts;
            entry["synced"]    = false;
            String line; serializeJson(entry, line); line += "\n";
            f.print(line); f.close();
            sdRecordCount++;
            stored = true;
          }
        }
        if (!stored) {
          if (!offlineBuf || offlineCount >= 200) {
            localHttp.send(507, "application/json", "{\"error\":\"storage_full\"}"); return;
          }
          OfflineRec& rec = offlineBuf[offlineCount++];
          strncpy(rec.userId,    userId.c_str(),    sizeof(rec.userId) - 1);
          strncpy(rec.sessionId, sessionId.c_str(), sizeof(rec.sessionId) - 1);
          strncpy(rec.courseId,  sessionCourse.c_str(), sizeof(rec.courseId) - 1);
          rec.ts = (uint32_t)ts;
        }
        dedupAdd(dk);
        studentsMarked++;
      }
    }

    JsonDocument resp;
    resp["sessionId"]     = sessionId;
    resp["studentId"]     = userId;
    resp["timestamp"]     = (long long)ts;
    resp["nonce"]         = nonce;
    resp["sig"]           = sigHex;
    if (markNow) resp["marked"] = !alreadyMarked;
    String s; serializeJson(resp, s);
    localHttp.sendHeader("Access-Control-Allow-Origin", "*");
    localHttp.send(200, "application/json", s);
  });

  // /mark — browser redirect flow: generates connectionToken and redirects to
  // https://dikly.sbs/?esp32session=...#mark-attendance so the browser can
  // prove classroom WiFi connection without a JS fetch (mixed-content bypass).
  localHttp.on("/mark", HTTP_GET, []() {
    if (sessionId.isEmpty() || sessionSeed.isEmpty()) {
      localHttp.send(503, "text/html",
        "<!doctype html><html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;padding:24px'>"
        "<h2>No active session</h2><p>Ask your lecturer to start a session, then try again.</p></body></html>");
      return;
    }
    String userId = localHttp.arg("studentId");
    if (userId.isEmpty()) {
      localHttp.send(400, "text/html",
        "<!doctype html><html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;padding:24px'>"
        "<h2>Open DIKLY first</h2><p>Go to Mark Attendance in the DIKLY app or website, then tap 'Verify WiFi Connection'.</p></body></html>");
      return;
    }
    // ── RSSI proximity check ─────────────────────────────────────────────────
    {
      String cip = localHttp.client().remoteIP().toString();
      int8_t rssi = getClientRSSI(cip);
      if (rssi != 0 && rssi < rssiThreshold) {
        String body = String("<!doctype html><html><head><meta charset='utf-8'>") +
          "<meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
          "<body style='font-family:sans-serif;padding:24px;background:#0a0f1e;color:#fff'>" +
          "<h2 style='color:#f87171'>Too far from classroom device</h2>" +
          "<p>Your signal is too weak (" + String(rssi) + " dBm). Move closer to the device and try again.</p>" +
          "<script>setTimeout(()=>history.back(),4000)</script></body></html>";
        localHttp.send(403, "text/html", body);
        LOG("RSSI reject /mark: " + String(rssi) + " dBm");
        return;
      }
    }
    // For locally-started sessions, allow millis-based timestamp when NTP unavailable
    if (!timeSynced && !sessionLocallyStarted) {
      localHttp.send(503, "text/html",
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'></head>"
        "<body style='font-family:sans-serif;padding:24px;background:#0a0f1e;color:#fff'>"
        "<h2>Device clock not synced</h2><p>Wait a moment and try again.</p>"
        "<script>setTimeout(()=>history.back(),3000)</script></body></html>");
      return;
    }
    time_t rawNow = time(nullptr);
    unsigned long issuedAt = (unsigned long)(rawNow < 1700000000UL
      ? (time_t)(1700000000UL + millis() / 1000) : rawNow);

    // ── One-time nonce — prevents URL replay even if token is intercepted ────
    uint8_t nb[8];
    for (int i = 0; i < 8; i++) nb[i] = (uint8_t)(esp_random() & 0xFF);
    char nonce[17];
    for (int i = 0; i < 8; i++) sprintf(nonce + i * 2, "%02x", nb[i]);
    nonce[16] = '\0';

    // ── HMAC-SHA256 over session + student + timestamp + nonce ───────────────
    // Server verifies this to confirm student was physically on the hotspot.
    String message = "conn:" + sessionId + ":" + userId + ":" + String(issuedAt) + ":" + String(nonce);
    uint8_t hmacOut[32];
    hmacSha256((const uint8_t*)sessionSeed.c_str(), sessionSeed.length(),
               (const uint8_t*)message.c_str(), message.length(), hmacOut);
    char sigHex[65];
    for (int i = 0; i < 32; i++) sprintf(sigHex + i * 2, "%02x", hmacOut[i]);
    sigHex[64] = '\0';

    // ── Mark locally BEFORE redirecting — fully offline ─────────────────────
    // ESP32 records attendance to SD/RAM now. Even if the phone never reaches
    // dikly.sbs, the record is safe and will sync on the next heartbeat.
    bool alreadyMarked = false;
    bool stored        = false;
    if (dedupSession != sessionId) dedupClear(sessionId);
    const char* dk = userId.c_str();
    if (dedupCheck(dk)) {
      alreadyMarked = true;
    } else {
      time_t ts = (time_t)issuedAt;
      if (sdAvailable) {
        File f = SD_MMC.open(SD_ATT_FILE, FILE_APPEND);
        if (f) {
          char recId[40];
          snprintf(recId, sizeof(recId), "rec_%s_%lu", macSuffix().c_str(), (uint32_t)ts);
          JsonDocument entry;
          entry["id"]        = recId;
          entry["userId"]    = userId;
          entry["sessionId"] = sessionId;
          entry["courseId"]  = sessionCourse;
          entry["timestamp"] = (uint32_t)ts;
          entry["synced"]    = false;
          entry["via"]       = "hotspot";
          String line; serializeJson(entry, line); line += "\n";
          f.print(line); f.close();
          sdRecordCount++;
          stored = true;
        }
      }
      if (!stored) {
        if (!offlineBuf || offlineCount >= 200) {
          localHttp.send(507, "text/html",
            "<!doctype html><html><body style='font-family:sans-serif;padding:24px'>"
            "<h2>Device buffer full</h2><p>Ask your lecturer to connect to internet to free space.</p>"
            "<script>setTimeout(()=>history.back(),4000)</script></body></html>");
          return;
        }
        OfflineRec& rec = offlineBuf[offlineCount++];
        strncpy(rec.userId,    userId.c_str(),         sizeof(rec.userId) - 1);
        strncpy(rec.sessionId, sessionId.c_str(),      sizeof(rec.sessionId) - 1);
        strncpy(rec.courseId,  sessionCourse.c_str(),  sizeof(rec.courseId) - 1);
        rec.ts = (uint32_t)ts;
        stored = true;
      }
      dedupAdd(dk);
      studentsMarked++;
      LOG("/mark local record stored for " + userId);
    }

    // ── Build redirect URL ────────────────────────────────────────────────────
    // esp32marked=1  → ESP32 has the record; app shows ✅ immediately.
    // esp32dup=1     → already marked this session; app shows "already checked in".
    String status = alreadyMarked ? "&esp32dup=1" : "&esp32marked=1";
    String url = "https://dikly.sbs/?esp32session=" + sessionId +
                 "&esp32student=" + userId +
                 "&esp32issued="  + String(issuedAt) +
                 "&esp32nonce="   + String(nonce) +
                 "&esp32sig="     + String(sigHex) +
                 status +
                 "#mark-attendance";
    // Serve a standalone success page.
    // If opened as a popup (window.opener available), postMessages the token back and closes.
    // If opened via direct navigation, shows ✅ + "Return to DIKLY" button — student taps
    // it when they have mobile data again, which avoids the offline-login race condition.
    String title  = alreadyMarked ? "Already Checked In" : "Attendance Marked!";
    String body   = alreadyMarked ? "You were already marked present for this session."
                                  : "You have been checked in. Tap below to return to DIKLY.";
    String html = String("<!doctype html><html><head><meta charset='utf-8'>") +
      "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
      "<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;" +
      "justify-content:center;background:#0a0f1e;color:#fff;font-family:sans-serif;padding:24px;text-align:center}" +
      ".card{background:#111827;border-radius:20px;padding:40px 24px;max-width:320px;width:100%;}" +
      ".btn{display:block;width:100%;padding:14px;background:#4f6ef7;color:#fff;border:none;border-radius:10px;" +
      "font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;margin-top:20px;}</style>" +
      "</head><body><div class='card'>" +
      "<div style='font-size:64px;margin-bottom:16px'>&#x2705;</div>" +
      "<div style='font-size:20px;font-weight:800;color:#22c55e'>" + title + "</div>" +
      "<p style='color:#9ca3af;font-size:14px;margin-top:8px;line-height:1.6'>" + body + "</p>" +
      "<a href='" + url + "' class='btn'>Return to DIKLY &#x2192;</a>" +
      "</div>" +
      "<script>(function(){" +
      "var d={type:'ESP32_MARK'," +
      "session:'" + sessionId + "'," +
      "student:'" + userId + "'," +
      "issued:" + String(issuedAt) + "," +
      "nonce:'" + String(nonce) + "'," +
      "sig:'" + String(sigHex) + "'," +
      "marked:" + (alreadyMarked ? "false" : "true") + "," +
      "dup:" + (alreadyMarked ? "true" : "false") + "};" +
      "if(window.opener&&!window.opener.closed){" +
      "try{window.opener.postMessage(d,'*');}catch(e){}" +
      "setTimeout(function(){try{window.close();}catch(e){}},400);" +
      "}" +
      "})();</script>" +
      "</body></html>";
    localHttp.send(200, "text/html", html);
  });

  // /attend — offline attendance submission (student connected to device AP)
  localHttp.on("/attend", HTTP_POST, []() {
    if (sessionId.isEmpty() || sessionSeed.isEmpty()) {
      localHttp.send(503, "application/json", "{\"error\":\"No active session\"}"); return;
    }
    // Capacity guard (SD: effectively unlimited; RAM fallback: 200 slots)
    if (!sdAvailable && offlineCount >= 200) {
      localHttp.send(503, "application/json", "{\"error\":\"Offline buffer full. Internet needed.\"}"); return;
    }
    JsonDocument req;
    if (deserializeJson(req, localHttp.arg("plain"))) {
      localHttp.send(400, "application/json", "{\"error\":\"Bad JSON\"}"); return;
    }
    String submittedCode = req["code"] | "";
    String indexNum      = req["indexNumber"] | "";
    String userId        = req["userId"] | "";
    submittedCode.trim();
    if (userId.isEmpty() && indexNum.isEmpty()) {
      localHttp.send(400, "application/json",
        "{\"error\":\"Login to the Dikly app to mark attendance\"}"); return;
    }
    if (submittedCode.length() != 6) {
      localHttp.send(400, "application/json", "{\"error\":\"Code must be 6 digits\"}"); return;
    }
    // Use NTP time if available; fall back to millis-based offset if clock not synced
    time_t now = time(nullptr);
    if (now < 1700000000UL) now = 1700000000UL + (millis() / 1000);

    // ── Session expiry check ──────────────────────────────────────────────────
    // Reject submissions more than 60 s after the session's declared end time.
    if (sessionStartedAt > 0 && sessionDuration > 0) {
      time_t sessionEnd = (time_t)(sessionStartedAt + sessionDuration + 60); // 60 s grace
      if (now > sessionEnd) {
        localHttp.send(403, "application/json", "{\"error\":\"Session has ended. Attendance is no longer accepted.\"}"); return;
      }
    }

    // ── Roster validation (soft — gracefully skips if index file missing) ─────
    // Prevents unknown index numbers from being recorded offline.
    if (indexNum.length() && sdAvailable && SD_MMC.exists("/roster_idx.txt")) {
      File ix = SD_MMC.open("/roster_idx.txt", FILE_READ);
      bool found = false;
      if (ix) {
        while (ix.available() && !found) {
          String line = ix.readStringUntil('\n');
          line.trim();
          if (line.equalsIgnoreCase(indexNum)) found = true;
        }
        ix.close();
      }
      if (!found) {
        localHttp.send(403, "application/json", "{\"error\":\"Your student ID is not enrolled in this class.\"}"); return;
      }
    }

    // Validate against current and previous window (±20s clock tolerance)
    bool valid = (submittedCode == deriveCode(sessionSeed, (uint32_t)now)) ||
                 (submittedCode == deriveCode(sessionSeed, (uint32_t)(now - WINDOW_SECONDS)));
    if (!valid) {
      localHttp.send(403, "application/json", "{\"error\":\"Incorrect code. Check the screen and try again.\"}"); return;
    }
    // ── Duplicate guard ───────────────────────────────────────────────────────
    if (dedupSession != sessionId) dedupClear(sessionId);
    const char* dedupKey = indexNum.length() ? indexNum.c_str() : userId.c_str();
    if (dedupCheck(dedupKey)) {
      localHttp.send(409, "application/json", "{\"error\":\"Attendance already recorded for this session.\"}"); return;
    }
    // ── Write to SD card (primary) ────────────────────────────────────────────
    bool stored = false;
    if (sdAvailable) {
      File f = SD_MMC.open(SD_ATT_FILE, FILE_APPEND);
      if (f) {
        char recId[40];
        snprintf(recId, sizeof(recId), "rec_%s_%lu", macSuffix().c_str(), (uint32_t)now);
        JsonDocument entry;
        entry["id"]        = recId;
        if (indexNum.length()) entry["indexNumber"] = indexNum;
        if (userId.length())   entry["userId"]      = userId;
        entry["sessionId"] = sessionId;
        entry["courseId"]  = sessionCourse;
        entry["timestamp"] = (uint32_t)now;
        entry["synced"]    = false;
        String line; serializeJson(entry, line); line += "\n";
        f.print(line); f.close();
        sdRecordCount++;
        stored = true;
        LOG("SD attendance [" + String(sdRecordCount) + "] idx=" + indexNum);
      }
    }
    // ── RAM fallback ──────────────────────────────────────────────────────────
    if (!stored) {
      if (!offlineBuf || offlineCount >= 200) {
        LOG("RAM buffer full or unavailable — attendance lost");
        localHttp.send(507, "application/json", "{\"error\":\"storage_full\"}");
        return;
      }
      OfflineRec& rec = offlineBuf[offlineCount++];
      strncpy(rec.indexNumber, indexNum.c_str(),       sizeof(rec.indexNumber) - 1);
      strncpy(rec.userId,      userId.c_str(),         sizeof(rec.userId) - 1);
      strncpy(rec.code,        submittedCode.c_str(),  sizeof(rec.code) - 1);
      strncpy(rec.sessionId,   sessionId.c_str(),      sizeof(rec.sessionId) - 1);
      strncpy(rec.courseId,    sessionCourse.c_str(),  sizeof(rec.courseId) - 1);
      rec.ts = (uint32_t)now;
      LOG("RAM attendance [" + String(offlineCount) + "] idx=" + indexNum);
    }
    dedupAdd(dedupKey);
    studentsMarked++;  // update count immediately — visible on screen without waiting for server heartbeat
    localHttp.send(200, "application/json", "{\"ok\":true,\"message\":\"Attendance recorded.\"}");
  });

  // /session/start — lecturer creates a session locally (no internet required)
  localHttp.on("/session/start", HTTP_POST, []() {
    JsonDocument req;
    if (deserializeJson(req, localHttp.arg("plain"))) {
      localHttp.send(400, "application/json", "{\"error\":\"Bad JSON\"}"); return;
    }
    if (!sessionId.isEmpty()) {
      localHttp.send(409, "application/json", "{\"error\":\"Session already active. Stop it first.\"}"); return;
    }
    String courseCode = req["courseCode"] | "";
    String title      = req["title"]      | "Attendance";
    String lecturer   = req["lecturer"]   | "";
    uint32_t duration = req["duration"]   | 300;

    time_t now = time(nullptr);
    if (now < 1700000000UL) now = 1700000000UL + (millis() / 1000);

    char sid[52]; snprintf(sid, sizeof(sid), "local_%s_%lu", macSuffix().c_str(), (uint32_t)now);
    uint8_t seedBytes[32]; esp_fill_random(seedBytes, 32);
    char seed[65];
    for (int i = 0; i < 32; i++) snprintf(seed + i * 2, 3, "%02x", seedBytes[i]);
    seed[64] = '\0';

    sessionId       = String(sid);
    sessionSeed     = String(seed);
    sessionTitle    = title;
    sessionCourse   = courseCode;
    sessionLecturer = lecturer;
    sessionDuration = duration;
    sessionStartedAt = (uint32_t)now;
    studentsMarked  = 0;
    dedupClear(sessionId);
    timeSynced      = true;  // allow code display — time is good enough

    if (sdAvailable) {
      File sf = SD_MMC.open("/sessions.jsonl", FILE_APPEND);
      if (sf) {
        JsonDocument sDoc;
        sDoc["sessionId"]  = sessionId;
        sDoc["courseCode"] = courseCode;
        sDoc["title"]      = title;
        sDoc["lecturer"]   = lecturer;
        sDoc["startedAt"]  = (uint32_t)now;
        sDoc["duration"]   = duration;
        sDoc["seed"]       = sessionSeed;   // needed for server-side code verification
        sDoc["synced"]     = false;
        String sl; serializeJson(sDoc, sl); sl += "\n";
        sf.print(sl); sf.close();
      }
    }
    bleUpdatePayload();
    JsonDocument resp;
    resp["ok"] = true; resp["sessionId"] = sessionId;
    String s; serializeJson(resp, s);
    localHttp.sendHeader("Access-Control-Allow-Origin", "*");
    localHttp.send(200, "application/json", s);
  });

  // /session/stop — end active session
  localHttp.on("/session/stop", HTTP_POST, []() {
    if (sessionId.isEmpty()) {
      localHttp.send(409, "application/json", "{\"error\":\"No active session\"}"); return;
    }
    LOG("Session stopped: " + sessionId);
    sessionId = ""; sessionSeed = "";
    sessionTitle = ""; sessionCourse = ""; sessionLecturer = "";
    studentsMarked = 0;
    bleStop();
    localHttp.sendHeader("Access-Control-Allow-Origin", "*");
    localHttp.send(200, "application/json", "{\"ok\":true}");
  });

  localHttp.on("/wifi/configure", HTTP_POST, []() {
    JsonDocument req;
    if (deserializeJson(req, localHttp.arg("plain"))) {
      localHttp.send(400, "application/json", "{\"status\":\"failed\",\"message\":\"Bad JSON\"}"); return;
    }
    String ssid = req["ssid"] | ""; String pass = req["password"] | "";
    if (ssid.isEmpty()) {
      localHttp.send(400, "application/json", "{\"status\":\"failed\",\"message\":\"ssid required\"}"); return;
    }
    wifiSSID = ssid; wifiPass = pass; saveConfig();
    localHttp.send(200, "application/json", "{\"status\":\"saved\",\"message\":\"Reconnecting...\"}");
    delay(300); ESP.restart();
  });
}

// ─── Paired-screen touch dispatcher ──────────────────────────────────────────
static void handlePairedTap(uint16_t tx, uint16_t ty) {
  // Tab bar (y ≥ 280)
  if (ty >= 280) {
    uint8_t tabIdx = (uint8_t)(tx / 60);
    if      (tabIdx == 0) curScreen = READY;
    else if (tabIdx == 1) curScreen = sessionId.isEmpty() ? SESSION_START : SESSION;
    else if (tabIdx == 2) curScreen = SUMMARY;
    else if (tabIdx == 3) curScreen = SETTINGS;
    return;
  }
  // Back button (header area, left quarter)
  if (ty < 46 && tx < 50) {
    if (curScreen == PAIR_SCREEN || curScreen == SUMMARY) curScreen = READY;
    else if (curScreen == SESSION_START)                  curScreen = READY;
    else if (curScreen == SETTINGS)                       curScreen = READY;
    else if (curScreen == DEVICE_INFO)                    curScreen = SETTINGS;
    return;
  }
  // READY screen
  if (curScreen == READY) {
    if      (ty >= 138 && ty <= 168) curScreen = PAIR_SCREEN;  // Pair Lecturer button
    else if (ty >= 250)              curScreen = DEVICE_INFO;  // Device ID row
  }
  // SESSION_START — 2×2 duration grid
  else if (curScreen == SESSION_START) {
    const int32_t bw = 107, bh = 76, gap = 10;
    const int32_t x0 = 8, x1 = x0 + bw + gap;
    const int32_t y0 = 72, y1 = y0 + bh + gap;
    // Top-left: 30 min
    if      (tx >= x0 && tx < x0+bw && ty >= y0 && ty < y0+bh) startLocalSession(30*60);
    // Top-right: 45 min
    else if (tx >= x1 && tx < x1+bw && ty >= y0 && ty < y0+bh) startLocalSession(45*60);
    // Bottom-left: 1 hour
    else if (tx >= x0 && tx < x0+bw && ty >= y1 && ty < y1+bh) startLocalSession(60*60);
    // Bottom-right: 2 hours
    else if (tx >= x1 && tx < x1+bw && ty >= y1 && ty < y1+bh) startLocalSession(120*60);
  }
  // SESSION screen
  else if (curScreen == SESSION) {
    if (ty >= 262 && ty <= 278) {   // End Session button
      summaryTotal   = sessionTotalEnrolled;
      summaryPresent = studentsMarked;
      summaryPct     = (summaryTotal > 0) ?
                       (float)summaryPresent * 100.0f / (float)summaryTotal : 0.0f;
      summaryCourse  = sessionCourse.isEmpty() ? sessionTitle : sessionCourse;
      sessionId = ""; sessionSeed = "";
      sessionTitle = ""; sessionCourse = ""; sessionLecturer = "";
      studentsMarked = 0; sessionTotalEnrolled = 0;
      sessionLocallyStarted = false;
      bleStop();
      curScreen = SUMMARY;
    }
  }
  // SETTINGS screen — 6 rows × 44 px starting at y=56
  else if (curScreen == SETTINGS) {
    if (ty >= 56 && ty < 56 + 6 * 44) {
      int32_t rowIdx = ((int32_t)ty - 56) / 44;
      if (rowIdx == 0) {                           // Wi-Fi Network
        if (wifiNetCount == 0) doWifiScan();
        curScreen = WIFI_SCAN;
      } else if (rowIdx == 2) {                    // Brightness cycle
        if      (curBrightness >= 220) curBrightness = 180;
        else if (curBrightness >= 155) curBrightness = 100;
        else                           curBrightness = 255;
        display.setBrightness(curBrightness);
      } else if (rowIdx == 3) {                    // RSSI Range cycle
        // Cycles: -50 → -55 → -60 → -65 → -70 → -75 → -80 → -85 → -50
        if      (rssiThreshold >= -50) rssiThreshold = -55;
        else if (rssiThreshold >= -55) rssiThreshold = -60;
        else if (rssiThreshold >= -60) rssiThreshold = -65;
        else if (rssiThreshold >= -65) rssiThreshold = -70;
        else if (rssiThreshold >= -70) rssiThreshold = -75;
        else if (rssiThreshold >= -75) rssiThreshold = -80;
        else if (rssiThreshold >= -80) rssiThreshold = -85;
        else                           rssiThreshold = -50;
        saveConfig();
      } else if (rowIdx == 4) {                    // Device Information
        curScreen = DEVICE_INFO;
      }
      // rowIdx == 5 (Factory Reset) requires long-press — handled in loop()
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  SETUP & LOOP
// ═════════════════════════════════════════════════════════════════════════════
void setup() {
  // Backlight FIRST — GPIO 45 on ES3C28P. Must be before anything that could
  // crash/hang so we can always tell whether firmware has booted at all.
  // LovyanGFX's Light_PWM will also manage this pin after display.init().
  pinMode(45, OUTPUT);
  digitalWrite(45, HIGH);

  Serial.begin(115200); delay(150);
  pinMode(LED_PIN, OUTPUT);

  // Redirect mbedTLS heap allocations to PSRAM so TLS handshakes never fail
  // due to internal SRAM fragmentation (maxBlock ~19KB when WiFi is active).
  // mbedTLS is pure-software crypto — it needs no DMA, so PSRAM is fine.
  mbedtls_platform_set_calloc_free(
    [](size_t n, size_t sz) -> void* {
      void* p = heap_caps_calloc(n, sz, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
      if (!p) p = calloc(n, sz);
      return p;
    },
    free
  );


  // Soft resets leave WiFi DMA rx-buffer pool partially allocated in internal
  // DRAM. Arduino WiFi.disconnect/mode(OFF) is not sufficient to free them —
  // call the raw ESP-IDF teardown so fresh init always gets a clean heap.
  // These return ESP_ERR_WIFI_NOT_INIT on a true cold boot; that is fine.
  esp_wifi_stop();
  esp_wifi_deinit();
  delay(200);

  // Move large arrays to PSRAM to free ~38 KB of internal DRAM for WiFi init.
  // EXT_RAM_BSS_ATTR is ineffective without .ext_ram.bss in the linker script,
  // so we allocate explicitly. Fall back to internal heap only if PSRAM is full.
  offlineBuf = (OfflineRec*)heap_caps_calloc(200, sizeof(OfflineRec), MALLOC_CAP_SPIRAM);
  if (!offlineBuf) offlineBuf = (OfflineRec*)calloc(200, sizeof(OfflineRec));
  dedupIds = (char (*)[32])heap_caps_calloc(400, 32, MALLOC_CAP_SPIRAM);
  if (!dedupIds) dedupIds = (char (*)[32])calloc(400, 32);

  // Display + sprite BEFORE BLE/WiFi so the 150 KB sprite buffer is allocated
  // from unfragmented PSRAM. BLE grabs large contiguous chunks; if it runs first
  // createSprite() can fail even though total free PSRAM is sufficient.
  display.init();
  display.setRotation(0);  // 0 = portrait
  display.fillScreen(COL_BG);

  spr.setColorDepth(16);
  void* sprBuf = spr.createSprite(SW, SH);
  if (!sprBuf) {
    LOG("PSRAM sprite alloc failed — check OPI PSRAM setting or free heap");
    display.setTextColor(TFT_WHITE, COL_BG);
    display.setTextSize(2);
    display.drawString("DIKLY", 80, 140);
    display.setTextSize(1);
    display.drawString("PSRAM alloc failed", 35, 170);
    display.drawString("Free: " + String(ESP.getFreePsram()), 55, 185);
  }

  // Touch init
  touchInit();

  // Splash (does not need SD or WiFi)
  splashStart = millis();
  drawSplash();

  loadConfig();
  LOG("Boot — " + deviceId + " fw=" + String(FIRMWARE_VERSION));

  // Not yet paired — go to captive portal for setup
  if (deviceJWT.isEmpty()) {
    LOG("Entering setup AP mode");
    LOG("DMA heap free:    " + String(heap_caps_get_free_size(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL)));
    LOG("DMA largest block:" + String(heap_caps_get_largest_free_block(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL)));
    esp_bt_controller_mem_release(ESP_BT_MODE_BLE);
    startApPortal();
    return;
  }

  // ── Paired operation — device is always the AP ────────────────────────────
  // Students connect directly to the device hotspot. No school WiFi needed for
  // attendance. School WiFi (if configured) is used only for background sync.

  LOG("DMA heap free:    " + String(heap_caps_get_free_size(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL)));
  LOG("DMA largest block:" + String(heap_caps_get_largest_free_block(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL)));

  // WiFi driver init FIRST with reduced DMA config.
  // esp_wifi_init() claims WiFi's internal structures (pp_wdev, DMA rings) from
  // the still-unfragmented heap (~10-15 KB DMA). WiFi.mode/softAP later reuse
  // these already-allocated structures and do not allocate fresh DMA.
  // BLE then gets the remaining heap (~45+ KB) with a large contiguous block,
  // easily satisfying the 4 KB EMI allocation (emi.c:164).
  // tx_buf_type=1 (WIFI_DYNAMIC_TX_BUFFER) moves TX buffers to 320 KB general
  // heap; static_rx_buf_num=4 (was 10) saves ~10 KB DMA.
  {
    wifi_init_config_t wcfg = WIFI_INIT_CONFIG_DEFAULT();
    wcfg.static_rx_buf_num  = 4;
    wcfg.static_tx_buf_num  = 0;
    wcfg.tx_buf_type        = 1;  // WIFI_DYNAMIC_TX_BUFFER
    wcfg.dynamic_tx_buf_num = 32;
    esp_wifi_init(&wcfg);
  }
  LOG("Post-WiFi-drv DMA free:  " + String(heap_caps_get_free_size(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL)));
  LOG("Post-WiFi-drv DMA block: " + String(heap_caps_get_largest_free_block(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL)));

  // BLE SECOND — after WiFi driver claimed its DMA, remaining heap still has a
  // large contiguous block for BLE's 4 KB EMI controller buffer.
  initBle();

  String apName = "Dikly-" + macSuffix();
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str());
  IPAddress apGw;
  uint32_t apWait = millis();
  do { delay(100); apGw = WiFi.softAPIP(); } while (apGw == IPAddress(0,0,0,0) && millis()-apWait < 5000);
  MDNS.begin("dikly");  // reachable as http://dikly.local on both AP and school WiFi
  LOG("Device AP: " + apName + " @ " + apGw.toString());

  SD_MMC.setPins(SD_CLK, SD_CMD, SD_D0, SD_D1, SD_D2, SD_D3);
  sdAvailable = SD_MMC.begin("/sdcard", false, false);
  if (!sdAvailable) {
    SD_MMC.end();
    SD_MMC.setPins(SD_CLK, SD_CMD, SD_D0);
    sdAvailable = SD_MMC.begin("/sdcard", true, false);
  }
  if (sdAvailable) {
    uint64_t mb = SD_MMC.cardSize() / (1024ULL * 1024ULL);
    LOG("SD card OK — " + String((uint32_t)mb) + " MB ("
        + String(SD_MMC.cardType()) + "-type)");
    if (SD_MMC.exists(SD_ATT_FILE)) {
      File cf = SD_MMC.open(SD_ATT_FILE, FILE_READ);
      if (cf) {
        while (cf.available()) { if (cf.read() == '\n') sdRecordCount++; }
        cf.close();
        if (sdRecordCount) LOG("SD: " + String(sdRecordCount) + " unsynced records");
      }
    }
  } else {
    LOG("SD not found — using 200-slot RAM buffer");
  }

  // NTP attempted now; succeeds only if STA connects later in loop().
  // Records use millis-based fallback timestamps until NTP succeeds.
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  registerLocalHttp();
  localHttp.begin();
  curScreen = READY;
  digitalWrite(LED_PIN, HIGH);

  // If WiFi credentials stored, add STA for background sync (non-blocking).
  if (!wifiSSID.isEmpty()) {
    WiFi.mode(WIFI_AP_STA);
    WiFi.setSleep(false);
    WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    LOG("STA: connecting to " + wifiSSID + " for sync");
  }
}

void loop() {
  dns.processNextRequest();
  localHttp.handleClient();

  // WiFi scanner screen (paired device, no WiFi connection yet)
  if (curScreen == WIFI_SCAN) {
    uint16_t tx, ty;
    bool touched = touchRead(tx, ty);
    if (touched) {
      // Save position while finger is down so the tap handler gets the
      // last known good coordinates when the finger lifts (touchRead returns
      // false on release, leaving tx/ty uninitialised without this save).
      touchX = tx; touchY = ty;
      if (!touchActive) {
        touchActive = true; touchDownMs = millis(); touchHandled = false;
      } else if (!touchHandled && millis() - touchDownMs >= 3000) {
        touchHandled = true; factoryReset();
      }
    } else {
      if (touchActive && !touchHandled) {
        handleWifiScanTap(touchX, touchY);  // use saved position
      }
      touchActive = false; touchHandled = false;
    }
    drawWifiScan();
    delay(80);
    return;
  }

  // Async pairing: browser got 200 already; now do WiFi connect + server pair
  if (pairPending) {
    pairPending = false;
    delay(300); // let HTTP response flush to the browser

    // Step 1 — connect to WiFi (if credentials provided; optional)
    if (!wifiSSID.isEmpty()) {
      drawPairStatus("Connecting to WiFi…", wifiSSID.c_str(), "", 1);
      WiFi.mode(WIFI_AP_STA);
      WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
      uint32_t t0 = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) {
        delay(200); localHttp.handleClient();
      }
      if (WiFi.status() != WL_CONNECTED) {
        WiFi.mode(WIFI_AP);
        drawPairStatus("WiFi Failed", "Wrong password or network", "WiFi skipped — will add later", 1);
        wifiSSID = ""; wifiPass = "";  // clear bad creds, pairing continues
        delay(1500);
      }
    } else {
      if (WiFi.status() != WL_CONNECTED) {
        drawPairStatus("No Internet", "Provide a WiFi network to pair", "You can skip WiFi after pairing", 0);
        delay(3000); return;
      }
    }

    // Step 2 — sync time
    drawPairStatus("Syncing clock…", "", "", 2);
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    uint32_t tw = millis();
    while (time(nullptr) < 1000000000UL && millis() - tw < 5000) delay(100);

    // Step 3 — switch to STA-only to free AP heap for mbedTLS SSL context.
    // AP+STA coexistence leaves maxBlock ~19KB; pure STA raises it above 36KB.
    dns.stop();
    localHttp.stop();
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    delay(300);
    LOG("Pre-pair heap free=" + String(ESP.getFreeHeap()) +
        " maxBlock=" + String(ESP.getMaxAllocHeap()));
    drawPairStatus("Contacting server…", "dikly.sbs", "", 3);
    if (!tryPair(pairPendingCode, pairPendingInst)) {
      // Restart AP so user can retry
      WiFi.disconnect();
      WiFi.mode(WIFI_AP);
      { String an = "Dikly-" + macSuffix(); WiFi.softAP(an.c_str()); }
      delay(500);
      dns.start(53, "*", WiFi.softAPIP());
      localHttp.begin();
      String errLine = pairErrorMsg.isEmpty() ? "Check institution + pairing code" : pairErrorMsg;
      drawPairStatus("Pairing Failed", errLine.c_str(), "Generate a new code and retry", 0);
      return;
    }

    drawPairStatus("Paired!", "Device rebooting…", "", 4);
    delay(1500); ESP.restart();
    return;
  }

  // Setup portal (not yet paired)
  if (deviceJWT.isEmpty()) {
    uint16_t tx, ty;
    if (touchRead(tx, ty)) {
      touchX = tx; touchY = ty;
      if (!touchActive) { touchActive = true; touchDownMs = millis(); }
      else if (millis() - touchDownMs >= 3000) factoryReset();
    } else { touchActive = false; }
    if (curScreen == SETUP)         drawSetup("Dikly-" + macSuffix());
    if (curScreen == WIFI_RECONFIG) drawWifiReconfig("Dikly-" + macSuffix());
    delay(60);
    return;
  }

  // ── Paired operation (AP always on, STA optional for sync) ───────────────
  // Background STA reconnect — only for sync, never blocks attendance.
  bool staConnected = (WiFi.status() == WL_CONNECTED);
  if (!wifiSSID.isEmpty()) {
    static uint32_t lastReconn = 0;
    if (!staConnected && millis() - lastReconn > 30000) {
      lastReconn = millis();
      if (WiFi.getMode() == WIFI_AP) WiFi.mode(WIFI_AP_STA);
      WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    }
    if (forceReconn) {
      forceReconn = false;
      WiFi.disconnect(false); delay(200);
      WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    }
    if (staConnected && !timeSynced) {
      // NTP just came up — re-trigger time sync
      configTime(0, 0, "pool.ntp.org", "time.google.com");
    }
  }

  // Heartbeat + sync (only when STA connected to internet)
  uint32_t now = millis();
  if (staConnected && now - lastHbMs >= HEARTBEAT_MS) { lastHbMs = now; sendHeartbeat(); }

  // ── Touch handling for all paired screens ────────────────────────────────
  {
    uint16_t tx, ty;
    bool touched = touchRead(tx, ty);
    if (touched) {
      touchX = tx; touchY = ty;
      if (!touchActive) {
        touchActive = true; touchDownMs = millis(); touchHandled = false;
      }
      // Factory reset: 3-second hold on row 5 of Settings (y 276-320)
      if (curScreen == SETTINGS && !touchHandled &&
          touchY >= 276 && touchY < 320 &&
          millis() - touchDownMs >= 3000) {
        touchHandled = true; factoryReset();
      }
    } else {
      if (touchActive && !touchHandled) handlePairedTap(touchX, touchY);
      touchActive = false; touchHandled = false;
    }
  }

  // ── Session state → screen transition ────────────────────────────────────
  static bool wasSessActive = false;
  bool sessActive = !sessionId.isEmpty() && !sessionSeed.isEmpty() && (timeSynced || sessionLocallyStarted);
  if (sessActive && !wasSessActive) {
    // Session just became active — navigate home screens to SESSION
    if (curScreen == READY || curScreen == PAIR_SCREEN) curScreen = SESSION;
  } else if (!sessActive && wasSessActive) {
    // Session just ended via heartbeat (server removed it) — go to READY
    sessionLocallyStarted = false;
    if (curScreen == SESSION) curScreen = READY;
  }
  wasSessActive = sessActive;

  // Render at ~10 fps
  static uint32_t lastDraw = 0;
  if (now - lastDraw < 100) { delay(10); return; }
  lastDraw = now;

  switch (curScreen) {
    case SESSION_START: drawSessionStart(); break;
    case SESSION: {
      if (!sessActive) { curScreen = READY; drawReady(); break; }
      time_t unixNow = time(nullptr);
      // Use millis-based time if clock not synced (offline local session)
      if (unixNow < 1700000000UL) unixNow = (time_t)(1700000000UL + millis() / 1000);
      // Session duration remaining (for timer bar and countdown)
      long sessionSecsLeft = (long)(sessionStartedAt + sessionDuration) - (long)unixNow;
      if (sessionSecsLeft < 0) sessionSecsLeft = 0;
      String code = deriveCode(sessionSeed, (uint32_t)unixNow);
      // Auto-expire: session duration exceeded → show summary
      if (sessionStartedAt && unixNow > (time_t)(sessionStartedAt + sessionDuration)) {
        summaryTotal   = sessionTotalEnrolled;
        summaryPresent = studentsMarked;
        summaryPct     = (summaryTotal > 0) ?
                         (float)summaryPresent * 100.0f / (float)summaryTotal : 0.0f;
        summaryCourse  = sessionCourse.isEmpty() ? sessionTitle : sessionCourse;
        sessionId = ""; sessionSeed = "";
        sessionTitle = ""; sessionCourse = ""; sessionLecturer = "";
        studentsMarked = 0; sessionTotalEnrolled = 0;
        sessionLocallyStarted = false;
        bleStop(); curScreen = SUMMARY; drawSummary(); return;
      }
      bleUpdatePayload();
      drawSession(code, (uint32_t)sessionSecsLeft, sessionDuration);
      break;
    }
    case SUMMARY:     drawSummary();    break;
    case PAIR_SCREEN: drawPairScreen(); break;
    case SETTINGS:    drawSettings();   break;
    case DEVICE_INFO: drawDeviceInfo(); break;
    default:
      bleStop();
      curScreen = READY;
      drawReady();
      break;
  }
}
