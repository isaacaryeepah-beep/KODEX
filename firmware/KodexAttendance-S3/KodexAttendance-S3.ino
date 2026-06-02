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
static const uint32_t WINDOW_SECONDS      = 300;  // code rotation period (5 minutes)

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

// BLE beacon state
static BLEAdvertising *bleAdv  = nullptr;
static uint32_t        bleSlot = UINT32_MAX;   // slot currently on-air

// Async pairing (avoids iOS captive-portal dropping the fetch before we respond)
bool     pairPending     = false;
String   pairPendingInst = "";
String   pairPendingCode = "";

// Screen state machine
enum Screen { SPLASH, SETUP, WIFI_SCAN, WIFI_RECONFIG, CONNECTING, READY, SESSION, SUMMARY, SETTINGS, DEVICE_INFO, PAIR_SCREEN };
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
  if (!id || id[0] == '\0') return false;
  for (uint16_t i = 0; i < dedupCount; i++)
    if (strncmp(dedupIds[i], id, 31) == 0) return true;
  return false;
}

static void dedupAdd(const char* id) {
  if (!id || id[0] == '\0' || dedupCount >= 400) return;
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
  ty = rawY;
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
  wifiSSID        = prefs.getString("ssid", "");
  wifiPass        = prefs.getString("pass", "");
  deviceId        = prefs.getString("did",  "");
  deviceJWT       = prefs.getString("jwt",  "");
  apiBase         = prefs.getString("api",  DEFAULT_API_BASE);
  institutionCode = prefs.getString("inst", "");
  prefs.end();
  if (deviceId.isEmpty()) deviceId = "esp32s3-" + macSuffix();
}
static void saveConfig() {
  prefs.begin("kodex", false);
  prefs.putString("ssid", wifiSSID); prefs.putString("pass", wifiPass);
  prefs.putString("did",  deviceId); prefs.putString("jwt",  deviceJWT);
  prefs.putString("api",  apiBase);  prefs.putString("inst", institutionCode);
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

// ─── Offline attendance sync ──────────────────────────────────────────────────
static void syncOfflineAttendance() {
  // ── SD path ──────────────────────────────────────────────────────────────────
  if (sdAvailable && sdRecordCount > 0 && SD_MMC.exists(SD_ATT_FILE)) {
    File f = SD_MMC.open(SD_ATT_FILE, FILE_READ);
    if (f) {
      JsonDocument doc;
      JsonArray arr = doc["records"].to<JsonArray>();
      uint32_t parsed = 0;
      while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
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
      if (parsed == 0) { SD_MMC.remove(SD_ATT_FILE); sdRecordCount = 0; return; }
      String body; serializeJson(doc, body);
      String resp; int code = postJson("/api/devices/sync", body, resp);
      if (code == 200) {
        LOG("SD sync: " + String(parsed) + " records sent");
        SD_MMC.remove(SD_ATT_FILE);
        sdRecordCount = 0;
      } else {
        LOG("SD sync failed " + String(code) + ": " + resp);
      }
    }
    return;
  }

  // ── RAM fallback path ─────────────────────────────────────────────────────────
  if (offlineCount == 0) return;
  JsonDocument doc;
  JsonArray arr = doc["records"].to<JsonArray>();
  for (uint8_t i = 0; i < offlineCount; i++) {
    JsonObject o = arr.add<JsonObject>();
    if (offlineBuf[i].indexNumber[0]) o["indexNumber"] = offlineBuf[i].indexNumber;
    if (offlineBuf[i].userId[0])      o["userId"]      = offlineBuf[i].userId;
    o["sessionId"] = offlineBuf[i].sessionId[0] ? offlineBuf[i].sessionId : sessionId.c_str();
    o["courseId"]  = offlineBuf[i].courseId[0]  ? offlineBuf[i].courseId  : "";
    o["timestamp"] = offlineBuf[i].ts;
  }
  String body; serializeJson(doc, body);
  String resp; int code = postJson("/api/devices/sync", body, resp);
  if (code == 200) {
    LOG("RAM sync: " + String(offlineCount) + " records sent");
    offlineCount = 0;
  } else {
    LOG("RAM sync failed " + String(code) + ": " + resp);
  }
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
  // Flush any offline attendance records now that we have internet.
  syncOfflineAttendance();
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
                 uint32_t fill, uint32_t border = COL_BORDER, int32_t r = 10) {
  s.fillRoundRect(x, y, w, h, r, fill);
  s.drawRoundRect(x, y, w, h, r, border);
}

// ── Utility: centred text (lgfx vector font) ──────────────────────────────────
static void centreText(LGFX_Sprite& s, const String& txt, int32_t y,
                       const lgfx::IFont* font, uint16_t col) {
  s.setFont(font); s.setTextSize(1); s.setTextColor(col, COL_BG);
  int32_t tw = s.textWidth(txt);
  s.setCursor((SW - tw) / 2, y); s.print(txt);
}

// ── Utility: draw status dot + "Dikly" header bar ────────────────────────────
static void drawHeader(LGFX_Sprite& s, bool online) {
  s.fillRect(0, 0, SW, 42, COL_CARD);
  s.fillRect(0, 42, SW, 2, COL_PRIMARY);   // thin primary accent line under header
  // Logo — Orbitron gives a premium tech feel
  s.setFont(F_LOGO); s.setTextSize(1); s.setTextColor(COL_PRIMARY, COL_CARD);
  s.setCursor(14, 10); s.print("DIKLY");
  // Status badge
  uint16_t dotCol = online ? COL_SUCCESS : COL_ERROR;
  s.fillCircle(SW - 18, 21, 8, dotCol);
  s.fillCircle(SW - 18, 21, 5, COL_CARD);   // ring effect
  s.fillCircle(SW - 18, 21, 3, dotCol);
  s.setFont(F_TINY); s.setTextColor(COL_MUTED, COL_CARD);
  String lbl = online ? "Online" : "Offline";
  int32_t lw = s.textWidth(lbl);
  s.setCursor(SW - 18 - 12 - lw, 16); s.print(lbl);
}

// ── Utility: 3-bar WiFi signal icon, right-edge at (rx,ty), 10px tall ────────
static void _wifiBars(LGFX_Sprite& s, int32_t rx, int32_t ty, uint16_t col) {
  s.fillRect(rx - 7, ty + 6, 2, 4, col);
  s.fillRect(rx - 4, ty + 3, 2, 7, col);
  s.fillRect(rx - 1, ty,     2, 10, col);
}

// ── Utility: bottom tab bar — active: 0=Home 1=Session 2=Records 3=Settings ──
static void drawTabBar(LGFX_Sprite& s, uint8_t active) {
  s.fillRect(0, 280, SW, 40, COL_CARD);
  s.fillRect(0, 280, SW,  1, COL_BORDER);

  const char* labels[4] = { "Home", "Session", "Records", "Settings" };
  for (uint8_t i = 0; i < 4; i++) {
    int32_t cx  = 30 + (int32_t)i * 60;
    uint16_t col = (i == active) ? COL_PRIMARY : COL_MUTED;

    if (i == active)
      s.fillRect(cx - 18, 280, 36, 2, COL_PRIMARY);  // active indicator bar

    int32_t iy = 293;
    if (i == 0) {                          // House
      s.fillTriangle(cx, iy - 7, cx - 7, iy, cx + 7, iy, col);
      s.fillRect(cx - 5, iy, 10, 7, col);
      s.fillRect(cx - 2, iy + 3, 4, 4, COL_CARD);
    } else if (i == 1) {                   // Calendar
      s.drawRoundRect(cx - 6, iy - 5, 13, 12, 2, col);
      s.fillRect(cx - 2, iy - 9, 2, 5, col);
      s.fillRect(cx + 2, iy - 9, 2, 5, col);
      s.fillRect(cx - 4, iy - 1, 9, 1, col);
      s.fillRect(cx - 3, iy + 2, 2, 2, col);
      s.fillRect(cx + 2, iy + 2, 2, 2, col);
    } else if (i == 2) {                   // List / Records
      s.fillRect(cx - 7, iy - 5, 14, 2, col);
      s.fillRect(cx - 7, iy,     14, 2, col);
      s.fillRect(cx - 7, iy + 5, 10, 2, col);
    } else {                               // Gear / Settings
      s.fillCircle(cx, iy, 5, col);
      s.fillCircle(cx, iy, 2, COL_CARD);
      s.fillRect(cx - 1, iy - 8, 2, 4, col);
      s.fillRect(cx - 1, iy + 4, 2, 4, col);
      s.fillRect(cx - 8, iy - 1, 4, 2, col);
      s.fillRect(cx + 4, iy - 1, 4, 2, col);
    }

    s.setFont(F_TINY); s.setTextColor(col, COL_CARD);
    int32_t lw = s.textWidth(labels[i]);
    s.setCursor(cx - lw / 2, 307); s.print(labels[i]);
  }
}

// ── Utility: sub-screen header — back arrow + centred title + online dot ──────
static void _drawSubHeader(LGFX_Sprite& s, const char* title, bool online) {
  s.fillRect(0, 0, SW, 44, COL_CARD);
  s.fillRect(0, 44, SW, 2, COL_PRIMARY);
  // Back arrow (left-pointing chevron)
  s.fillTriangle(14, 22, 26, 13, 26, 31, COL_TEXT);
  s.fillRect(26, 18, 6, 8, COL_TEXT);
  // Centred title
  s.setFont(F_SMALL); s.setTextColor(COL_TEXT, COL_CARD);
  int32_t tw = s.textWidth(title);
  s.setCursor((SW - tw) / 2, 15); s.print(title);
  // Online dot (right side)
  uint16_t dc = online ? COL_SUCCESS : COL_MUTED;
  s.fillCircle(SW - 16, 22, 5, dc);
}

// ── SPLASH / WELCOME ─────────────────────────────────────────────────────────
static void drawSplash() {
  spr.fillSprite(COL_BG);

  // ── Logo group (D badge + wordmark, centred horizontally) ─────────────────
  spr.setFont(F_LOGO_L); spr.setTextSize(1);
  int32_t logoTxtW = spr.textWidth("Dikly");
  const int32_t BW = 56, BH = 56, BGAP = 10;
  int32_t BX = (SW - BW - BGAP - logoTxtW) / 2;
  const int32_t BY = 46;

  spr.fillRoundRect(BX, BY, BW, BH, 14, COL_PRIMARY);
  spr.setTextColor(COL_WHITE, COL_PRIMARY);
  int32_t dw = spr.textWidth("D");
  int32_t dh = spr.fontHeight();
  spr.setCursor(BX + (BW - dw) / 2, BY + (BH - dh) / 2); spr.print("D");

  spr.setFont(F_LOGO_L); spr.setTextColor(COL_TEXT, COL_BG);
  spr.setCursor(BX + BW + BGAP, BY + 4); spr.print("Dikly");

  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  int32_t subW = spr.textWidth("Smart Attendance System");
  spr.setCursor((SW - subW) / 2, BY + BH + 8); spr.print("Smart Attendance System");

  // ── Divider ───────────────────────────────────────────────────────────────
  spr.drawFastHLine(18, BY + BH + 22, SW - 36, COL_BORDER);

  // ── Institution card ──────────────────────────────────────────────────────
  int32_t cardY = BY + BH + 30;
  card(spr, 14, cardY, SW - 28, 78, COL_CARD, COL_BORDER, 12);

  spr.fillCircle(38, cardY + 38, 20, COL_PRIMARY);
  spr.setFont(F_SMALL); spr.setTextColor(COL_WHITE, COL_PRIMARY);
  int32_t kw = spr.textWidth("K");
  spr.setCursor(38 - kw / 2, cardY + 28); spr.print("K");

  spr.setFont(F_TINY); spr.setTextColor(COL_TEXT, COL_CARD);
  String inst = institutionCode.isEmpty() ? "Attendance Device" : institutionCode;
  spr.setCursor(66, cardY + 10); spr.print(inst);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(66, cardY + 26); spr.print("Excellence · Integrity · Impact");
  spr.setCursor(66, cardY + 42); spr.print("Firmware v" + String(FIRMWARE_VERSION));

  // ── "Get Started" call-to-action button ──────────────────────────────────
  int32_t btnY = cardY + 78 + 10;
  spr.fillRoundRect(14, btnY, SW - 28, 54, 14, COL_PRIMARY);
  // Highlight stripe
  spr.fillRoundRect(14, btnY, SW - 28, 20, 14, 0x3C7F);
  spr.fillRect(14, btnY + 10, SW - 28, 10, 0x3C7F);
  spr.setFont(F_SMALL); spr.setTextColor(COL_WHITE, COL_PRIMARY);
  String btn = "Get Started";
  int32_t tw = spr.textWidth(btn);
  spr.setCursor((SW - tw) / 2 - 10, btnY + 17); spr.print(btn);
  int32_t ax = (SW + tw) / 2 + 2, ay = btnY + 27;
  spr.fillTriangle(ax + 10, ay, ax, ay - 8, ax, ay + 8, COL_WHITE);

  spr.pushSprite(0, 0);
}

// ── SETUP (captive portal) ────────────────────────────────────────────────────
static void drawSetup(const String& apName) {
  spr.fillSprite(COL_BG);

  const uint16_t CYAN  = 0x07FF;
  const uint16_t GLASS = 0x10A2;

  // ── DIKLY — smaller logo, single cyan ──────────────────────────────────────
  spr.setFont(F_LOGO); spr.setTextSize(1);
  spr.setTextColor(CYAN, COL_BG);
  spr.setCursor(14, 12); spr.print("DIKLY");

  // ── WiFi icon — compact, top right ─────────────────────────────────────────
  {
    const int32_t wx = 216, wy = 22;
    spr.fillCircle(wx, wy, 2, CYAN);
    spr.drawArc(wx, wy, 7,  5,  220, 320, CYAN);
    spr.drawArc(wx, wy, 13, 11, 215, 325, CYAN);
  }

  // ── Subtitle ────────────────────────────────────────────────────────────────
  spr.setFont(F_TINY); spr.setTextSize(1);
  spr.setTextColor(COL_MUTED, COL_BG);
  spr.setCursor(14, 38); spr.print("Device Setup");

  // ── Divider ─────────────────────────────────────────────────────────────────
  spr.drawFastHLine(14, 52, SW - 28, COL_BORDER);

  // ── Section label ───────────────────────────────────────────────────────────
  {
    const char* lbl = "3 STEPS TO CONNECT THIS DEVICE";
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    spr.setCursor((SW - (int32_t)spr.textWidth(lbl)) / 2, 58);
    spr.print(lbl);
  }

  // ── Step cards — minimal glass panels, no borders ───────────────────────────
  const int32_t CX = 10, CW = SW - 20, CG = 8;
  int32_t cy = 72;

  auto stepCard = [&](uint8_t num,
                      const char* hint, const lgfx::IFont* vfont,
                      const char* val1, const char* val2,
                      const char* note, int32_t ch) {
    // Glass panel — flat fill only, no border
    spr.fillRoundRect(CX, cy, CW, ch, 8, GLASS);

    // Step indicator — dark circle with thin cyan ring
    const int32_t bx = CX + 18, by = cy + ch / 2;
    spr.fillCircle(bx, by, 8, COL_BG);
    spr.drawCircle(bx, by, 8, CYAN);
    spr.setFont(F_TINY); spr.setTextColor(CYAN, COL_BG);
    char ns[2] = {(char)('0' + num), '\0'};
    spr.setCursor(bx - (int32_t)spr.textWidth(ns) / 2, by - 4);
    spr.print(ns);

    // Text block
    const int32_t tx = CX + 34;
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, GLASS);
    spr.setCursor(tx, cy + 8); spr.print(hint);
    spr.setFont(vfont); spr.setTextColor(CYAN, GLASS);
    spr.setCursor(tx, cy + 20); spr.print(val1);
    if (val2) {
      spr.setFont(F_TINY); spr.setTextColor(CYAN, GLASS);
      spr.setCursor(tx, cy + 32); spr.print(val2);
    }
    if (note) {
      spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, GLASS);
      spr.setCursor(tx, val2 ? cy + 42 : cy + 32); spr.print(note);
    }
    cy += ch + CG;
  };

  stepCard(1, "Connect phone to Wi-Fi:", F_SMALL, apName.c_str(), nullptr, nullptr, 40);
  stepCard(2, "Open in your browser:",   F_SMALL, "192.168.4.1", nullptr, nullptr, 40);
  stepCard(3, "Enter your details:",     F_TINY,
           "Institution code +", "pairing code",
           "then your school Wi-Fi", 54);

  // ── Factory reset bar — subtle, minimal ─────────────────────────────────────
  cy += 6;
  {
    const int32_t bh = 22;
    spr.fillRoundRect(CX, cy, CW, bh, 11, 0x1800);
    const int32_t gx = CX + 14, gy = cy + bh / 2;
    spr.fillCircle(gx, gy, 4, COL_WARNING);
    spr.fillCircle(gx, gy, 2, 0x1800);
    spr.fillRect(gx - 1, gy - 6, 2, 2, COL_WARNING);
    spr.fillRect(gx - 1, gy + 4, 2, 2, COL_WARNING);
    spr.fillRect(gx - 6, gy - 1, 2, 2, COL_WARNING);
    spr.fillRect(gx + 4, gy - 1, 2, 2, COL_WARNING);
    spr.setFont(F_TINY); spr.setTextColor(COL_WARNING, 0x1800);
    spr.setCursor(gx + 9, gy - 4); spr.print("HOLD 3s  |  FACTORY RESET");
  }

  spr.pushSprite(0, 0);
}

// ── WIFI RECONFIG (paired, but saved network unavailable) ────────────────────
static void drawWifiReconfig(const String& apName) {
  spr.fillSprite(COL_BG);

  spr.fillRect(0, 0, SW, 5, COL_WARNING);
  spr.fillRect(0, 5, SW, 2, COL_BORDER);

  spr.setFont(F_MED); spr.setTextColor(COL_TEXT, COL_BG);
  String title = "Change Wi-Fi";
  int32_t tw = spr.textWidth(title);
  spr.setCursor((SW - tw) / 2, 10); spr.print(title);

  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  String sub = "Saved network unavailable";
  tw = spr.textWidth(sub);
  spr.setCursor((SW - tw) / 2, 40); spr.print(sub);

  spr.drawFastHLine(14, 54, SW - 28, COL_BORDER);

  card(spr, 8, 60, SW - 16, 68, COL_CARD, COL_BORDER, 12);
  spr.fillCircle(30, 94, 14, COL_WARNING);
  spr.setFont(F_MED); spr.setTextColor(COL_BG, COL_WARNING);
  tw = spr.textWidth("!"); spr.setCursor(30 - tw/2, 82); spr.print("!");
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(54, 68); spr.print("Connect phone to Wi-Fi:");
  spr.setFont(F_SMALL); spr.setTextColor(COL_WARNING, COL_CARD);
  spr.setCursor(54, 84); spr.print(apName);

  spr.setFont(F_TINY); spr.setTextColor(COL_TEXT, COL_BG);
  spr.setCursor(14, 140); spr.print("Then open 192.168.4.1 in browser");
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  spr.setCursor(14, 155); spr.print("and enter the new Wi-Fi details.");

  card(spr, 8, 180, SW - 16, 46, 0x0841, COL_SUCCESS, 10);
  spr.fillCircle(30, 203, 11, COL_SUCCESS);
  spr.setFont(F_SMALL); spr.setTextColor(COL_BG, COL_SUCCESS);
  tw = spr.textWidth("i"); spr.setCursor(30 - tw/2, 196); spr.print("i");
  spr.setFont(F_TINY); spr.setTextColor(COL_SUCCESS, 0x0841);
  spr.setCursor(52, 186); spr.print("Device pairing is preserved.");
  spr.setCursor(52, 202); spr.print("Only Wi-Fi credentials change.");

  card(spr, 8, 240, SW - 16, 28, 0x2000, 0x4000, 8);
  spr.setFont(F_TINY); spr.setTextColor(COL_WARNING, 0x2000);
  String rst = "Hold 3 s anywhere  —  factory reset";
  tw = spr.textWidth(rst);
  spr.setCursor((SW - tw) / 2, 250); spr.print(rst);

  // ── Pulse indicator dot ─────────────────────────────────────────────────────
  spr.fillCircle(SW / 2, 310, 4, COL_WARNING);

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
  drawHeader(spr, false);

  // ── Title + subtitle ─────────────────────────────────────────────────────────
  spr.setFont(F_MED); spr.setTextColor(COL_PRIMARY, COL_BG);
  spr.setCursor(12, 50); spr.print("Wi-Fi Setup");
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  spr.setCursor(12, 74); spr.print("Connect Dikly to your network");

  if (wifiScanning) {
    spr.setFont(F_SMALL); spr.setTextColor(COL_MUTED, COL_BG);
    int32_t tw = spr.textWidth("Scanning...");
    spr.setCursor((SW - tw) / 2, 170); spr.print("Scanning...");
    spr.pushSprite(0, 0); return;
  }

  if (!wifiMsg.isEmpty() && wifiNetCount == 0) {
    spr.setFont(F_SMALL); spr.setTextColor(COL_MUTED, COL_BG);
    int32_t tw = spr.textWidth(wifiMsg);
    spr.setCursor((SW - tw) / 2, 164); spr.print(wifiMsg);
    spr.setFont(F_TINY); spr.setTextColor(COL_BORDER, COL_BG);
    String hint = "Tap Scan Again below";
    tw = spr.textWidth(hint);
    spr.setCursor((SW - tw) / 2, 184); spr.print(hint);
  }

  // ── Network list ─────────────────────────────────────────────────────────────
  uint8_t visible = (uint8_t)min((int)wifiNetCount - wifiScroll, MAX_VIS);
  for (uint8_t i = 0; i < visible; i++) {
    uint8_t idx = wifiScroll + i;
    WifiNet& n  = wifiNets[idx];
    int32_t  y  = LIST_Y + i * ITEM_H;

    card(spr, 4, y, 212, ITEM_H - 3, COL_CARD, COL_BORDER, 8);

    // Signal bars
    for (uint8_t b = 0; b < 4; b++) {
      uint8_t bh = 4 + b * 5;
      uint16_t bc = (b < (uint8_t)n.bars) ? COL_SUCCESS : COL_BORDER;
      spr.fillRoundRect(10 + b * 8, y + (ITEM_H - 3) - 7 - bh, 6, bh, 1, bc);
    }

    // SSID
    spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
    String ssid = String(n.ssid);
    if (spr.textWidth(ssid) > 118) { ssid = ssid.substring(0, 13); ssid += ".."; }
    spr.setCursor(46, y + 7); spr.print(ssid);

    // Open / locked badge
    if (n.open) {
      spr.fillRoundRect(165, y + 8, 42, 16, 8, COL_SUCCESS);
      spr.setFont(F_TINY); spr.setTextColor(COL_WHITE, COL_SUCCESS);
      spr.setCursor(170, y + 12); spr.print("OPEN");
    } else {
      spr.fillRoundRect(165, y + 8, 42, 16, 8, COL_BORDER);
      spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BORDER);
      spr.setCursor(174, y + 12); spr.print("PWD");
    }
  }

  // Scroll arrows
  if (wifiScroll > 0)
    spr.fillTriangle(SCROLL_X + 9, LIST_Y - 8,
                     SCROLL_X,     LIST_Y + 8,
                     SCROLL_X + 18, LIST_Y + 8, COL_PRIMARY);
  if (wifiScroll + MAX_VIS < wifiNetCount)
    spr.fillTriangle(SCROLL_X + 9, LIST_Y + MAX_VIS * ITEM_H + 8,
                     SCROLL_X,     LIST_Y + MAX_VIS * ITEM_H - 8,
                     SCROLL_X + 18, LIST_Y + MAX_VIS * ITEM_H - 8, COL_PRIMARY);

  // ── "Scan Again" full-width bottom button ────────────────────────────────────
  uint16_t sbCol = wifiScanning ? COL_MUTED : COL_PRIMARY;
  spr.fillRoundRect(16, 287, SW - 32, 26, 13, sbCol);
  spr.setFont(F_TINY); spr.setTextColor(COL_WHITE, sbCol);
  String scanLabel = wifiScanning ? "Scanning..." : "Scan Again";
  int32_t stw = spr.textWidth(scanLabel);
  spr.setCursor((SW - stw) / 2, 294); spr.print(scanLabel);

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
  static uint8_t dots = 0; dots = (dots + 1) % 4;
  static uint8_t wave = 0; wave = (wave + 1) % 40;
  spr.fillSprite(COL_BG);

  // ── Header ──────────────────────────────────────────────────────────────────
  spr.fillRect(0, 0, SW, 44, COL_CARD);
  spr.fillRect(0, 44, SW, 2, COL_PRIMARY);
  spr.setFont(F_LOGO); spr.setTextColor(COL_PRIMARY, COL_CARD);
  spr.setCursor(14, 10); spr.print("DIKLY");
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(14, 32); spr.print("Connecting to Network");

  // ── Title + animated dots ───────────────────────────────────────────────────
  spr.setFont(F_MED); spr.setTextColor(COL_TEXT, COL_BG);
  const char* t = "Connecting";
  int32_t tw = spr.textWidth(t);
  spr.setCursor((SW - tw) / 2, 58); spr.print(t);

  spr.setFont(F_MED); spr.setTextColor(COL_BORDER, COL_BG);
  tw = spr.textWidth("...");
  spr.setCursor((SW - tw) / 2, 82); spr.print("...");
  spr.setFont(F_MED); spr.setTextColor(COL_PRIMARY, COL_BG);
  String dotStr; for (uint8_t i = 0; i < dots; i++) dotStr += ".";
  spr.setCursor((SW - spr.textWidth("...")) / 2, 82); spr.print(dotStr);

  // ── Pulsing ring outlines ──────────────────────────────────────────────────
  uint8_t p = wave;
  uint16_t c1 = COL_BORDER, c2 = COL_BORDER, c3 = COL_BORDER;
  if      (p < 14) c1 = COL_PRIMARY;
  else if (p < 27) { c1 = COL_CARD; c2 = COL_PRIMARY; }
  else             { c2 = COL_CARD; c3 = COL_PRIMARY; }

  int32_t cx = SW / 2, cy = 168;
  for (int8_t d = -1; d <= 1; d++) {
    spr.drawCircle(cx, cy, 56 + d, c3);
    spr.drawCircle(cx, cy, 40 + d, c2);
    spr.drawCircle(cx, cy, 24 + d, c1);
  }
  spr.fillCircle(cx, cy, 14, COL_PRIMARY);
  spr.setFont(F_LOGO); spr.setTextColor(COL_BG, COL_PRIMARY);
  tw = spr.textWidth("D");
  spr.setCursor(cx - tw / 2, cy - 12); spr.print("D");

  // ── SSID pill card ─────────────────────────────────────────────────────────
  card(spr, 18, 238, SW - 36, 40, COL_CARD, COL_BORDER, 20);
  // WiFi icon dots (3 arcs)
  spr.fillCircle(38, 258, 3, COL_PRIMARY);
  for (int8_t d = -1; d <= 1; d++) {
    spr.drawCircle(38, 268, 10 + d, COL_PRIMARY);
    spr.drawCircle(38, 268, 16 + d, COL_BORDER);
  }
  spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
  String s = ssid;
  if (spr.textWidth(s) > SW - 72) s = s.substring(0, 13) + "..";
  spr.setCursor(56, 248); spr.print(s);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(56, 264); spr.print("Please wait...");

  spr.pushSprite(0, 0);
}

// ── READY — Waiting for Session ───────────────────────────────────────────────
static void drawReady() {
  spr.fillSprite(COL_BG);

  // ── Header ──────────────────────────────────────────────────────────────────
  spr.fillRect(0, 0, SW, 44, COL_CARD);
  spr.fillRect(0, 44, SW, 2, COL_SUCCESS);
  spr.setFont(F_LOGO); spr.setTextColor(COL_PRIMARY, COL_CARD);
  spr.setCursor(14, 10); spr.print("DIKLY");
  // Sync status badge — green when STA connected to internet, grey when offline
  bool syncOnline = (WiFi.status() == WL_CONNECTED);
  uint16_t badgeCol = syncOnline ? COL_SUCCESS : COL_MUTED;
  spr.fillRoundRect(SW - 66, 13, 54, 18, 9, badgeCol);
  spr.fillCircle(SW - 58, 22, 3, COL_CARD);
  spr.setFont(F_TINY); spr.setTextColor(COL_CARD, badgeCol);
  spr.setCursor(SW - 50, 17); spr.print(syncOnline ? "Online" : "Offline");

  // ── Title ──────────────────────────────────────────────────────────────────
  spr.setFont(F_MED); spr.setTextColor(COL_PRIMARY, COL_BG);
  String title = "Waiting for Session";
  int32_t tw = spr.textWidth(title);
  if (tw > SW - 16) { spr.setFont(F_SMALL); tw = spr.textWidth(title); }
  spr.setCursor((SW - tw) / 2, 54); spr.print(title);

  // ── Subtitle ───────────────────────────────────────────────────────────────
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  const char* sub1 = "Connect to device hotspot";
  String apLabel = "Dikly-" + macSuffix();
  spr.setCursor((SW - spr.textWidth(sub1)) / 2, 80); spr.print(sub1);
  int32_t alw = spr.textWidth(apLabel);
  spr.setTextColor(COL_PRIMARY, COL_BG);
  spr.setCursor((SW - alw) / 2, 92); spr.print(apLabel);
  spr.setTextColor(COL_MUTED, COL_BG);

  // ── Outward ring pulse ─────────────────────────────────────────────────────
  static uint8_t pulse = 0; pulse = (pulse + 1) % 40;
  uint8_t p = pulse;
  uint16_t c1 = COL_BORDER, c2 = COL_BORDER, c3 = COL_BORDER, c4 = COL_BORDER;
  if      (p < 10) c1 = COL_SUCCESS;
  else if (p < 20) { c1 = COL_CARD; c2 = COL_SUCCESS; }
  else if (p < 30) { c2 = COL_CARD; c3 = COL_SUCCESS; }
  else             { c3 = COL_CARD; c4 = COL_SUCCESS; }

  int32_t pcx = SW / 2, pcy = 166;
  for (int8_t d = -1; d <= 1; d++) {
    spr.drawCircle(pcx, pcy, 66 + d, c4);
    spr.drawCircle(pcx, pcy, 50 + d, c3);
    spr.drawCircle(pcx, pcy, 34 + d, c2);
    spr.drawCircle(pcx, pcy, 18 + d, c1);
  }
  spr.fillCircle(pcx, pcy, 14, COL_PRIMARY);
  spr.setFont(F_LOGO); spr.setTextColor(COL_BG, COL_PRIMARY);
  tw = spr.textWidth("D");
  spr.setCursor(pcx - tw / 2, pcy - 12); spr.print("D");

  // ── Bottom info card ───────────────────────────────────────────────────────
  card(spr, 10, 248, SW - 20, 58, COL_CARD, COL_BORDER, 12);
  if (!sessionLecturer.isEmpty() || !sessionCourse.isEmpty()) {
    spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
    String l = sessionLecturer.isEmpty() ? sessionCourse : sessionLecturer;
    if (spr.textWidth(l) > SW - 40) l = l.substring(0, 18) + "..";
    tw = spr.textWidth(l);
    spr.setCursor((SW - tw) / 2, 256); spr.print(l);
    if (!sessionCourse.isEmpty() && !sessionLecturer.isEmpty()) {
      spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
      String c = sessionCourse;
      if (spr.textWidth(c) > SW - 40) c = c.substring(0, 22) + "..";
      tw = spr.textWidth(c);
      spr.setCursor((SW - tw) / 2, 278); spr.print(c);
    }
  } else {
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    String apIp = "AP: " + WiFi.softAPIP().toString();
    tw = spr.textWidth(apIp);
    spr.setCursor((SW - tw) / 2, 255); spr.print(apIp);
    uint16_t sdC = sdAvailable ? COL_SUCCESS : COL_WARNING;
    spr.fillCircle(20, 277, 4, sdC);
    spr.setTextColor(sdC, COL_CARD);
    spr.setCursor(29, 273); spr.print(sdAvailable ? "SD Ready" : "No SD");
    // Sync status
    bool syncing = (WiFi.status() == WL_CONNECTED);
    uint16_t syncC = syncing ? COL_SUCCESS : COL_MUTED;
    spr.fillCircle(20, 293, 4, syncC);
    spr.setTextColor(syncC, COL_CARD);
    spr.setCursor(29, 289); spr.print(syncing ? "Sync Online" : "Offline");
  }

  spr.pushSprite(0, 0);
}

// ── SESSION — Attendance Code Display ────────────────────────────────────────
static void drawSession(const String& code, uint32_t secsLeft, uint32_t secsTotal) {
  spr.fillSprite(COL_BG);

  // ── Header ──────────────────────────────────────────────────────────────────
  spr.fillRect(0, 0, SW, 44, COL_CARD);
  spr.fillRect(0, 44, SW, 2, COL_SUCCESS);
  // Pulsing green dot
  spr.fillCircle(16, 22, 7, COL_SUCCESS);
  spr.fillCircle(16, 22, 4, COL_CARD);
  spr.fillCircle(16, 22, 2, COL_SUCCESS);
  spr.setFont(F_SMALL); spr.setTextColor(COL_SUCCESS, COL_CARD);
  spr.setCursor(30, 14); spr.print("Session Active");

  // ── Course + Lecturer card ─────────────────────────────────────────────────
  card(spr, 8, 50, SW - 16, 40, COL_CARD, COL_BORDER, 10);
  spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
  String courseStr = sessionCourse.isEmpty() ? "Attendance" : sessionCourse;
  if (spr.textWidth(courseStr) > SW - 40) courseStr = courseStr.substring(0, 13) + "..";
  int32_t tw = spr.textWidth(courseStr);
  spr.setCursor((SW - tw) / 2, 54); spr.print(courseStr);
  if (!sessionLecturer.isEmpty()) {
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
    String l = sessionLecturer;
    if (spr.textWidth(l) > SW - 40) l = l.substring(0, 26) + "..";
    tw = spr.textWidth(l);
    spr.setCursor((SW - tw) / 2, 72); spr.print(l);
  }

  // ── "ATTENDANCE CODE" label ────────────────────────────────────────────────
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  tw = spr.textWidth("ATTENDANCE CODE");
  spr.setCursor((SW - tw) / 2, 98); spr.print("ATTENDANCE CODE");

  // ── Code background card + 7-segment digits ────────────────────────────────
  spr.fillRoundRect(10, 108, SW - 20, 58, 12, COL_CARD);
  spr.drawRoundRect(10, 108, SW - 20, 58, 12, COL_BORDER);
  spr.setTextFont(7); spr.setTextSize(1);
  spr.setTextColor(COL_PRIMARY, COL_CARD);
  String cA = code.substring(0, 3), cB = code.substring(3);
  int32_t wA = spr.textWidth(cA), wB = spr.textWidth(cB), gap = 16;
  int32_t codeX = (SW - wA - gap - wB) / 2;
  spr.setCursor(codeX, 114);             spr.print(cA);
  spr.setCursor(codeX + wA + gap, 114); spr.print(cB);

  // ── Countdown bar + label ──────────────────────────────────────────────────
  uint16_t barCol = secsLeft > 120 ? COL_SUCCESS : secsLeft > 60 ? COL_WARNING : COL_ERROR;
  int32_t barW = secsTotal > 0 ? (int32_t)((SW - 32) * secsLeft / secsTotal) : 0;
  spr.fillRoundRect(16, 174, SW - 32, 6, 3, COL_CARD);
  if (barW > 0) spr.fillRoundRect(16, 174, barW, 6, 3, barCol);
  spr.setFont(F_TINY); spr.setTextColor(barCol, COL_BG);
  String ct = "Expires in " + String(secsLeft) + "s";
  tw = spr.textWidth(ct);
  spr.setCursor((SW - tw) / 2, 185); spr.print(ct);

  // ── Stats row: Present | Time ──────────────────────────────────────────────
  int32_t cw = (SW - 24) / 2;

  card(spr, 8, 198, cw, 64, COL_CARD, COL_BORDER, 10);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  tw = spr.textWidth("Present");
  spr.setCursor(8 + (cw - tw) / 2, 207); spr.print("Present");
  spr.setFont(F_LARGE); spr.setTextColor(COL_SUCCESS, COL_CARD);
  String ps = String(studentsMarked);
  tw = spr.textWidth(ps);
  spr.setCursor(8 + (cw - tw) / 2, 220); spr.print(ps);

  card(spr, 16 + cw, 198, cw, 64, COL_CARD, COL_BORDER, 10);
  time_t now = time(nullptr); struct tm tmNow; localtime_r(&now, &tmNow);
  char timeBuf[9]; strftime(timeBuf, sizeof(timeBuf), "%I:%M %p", &tmNow);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  tw = spr.textWidth("Time");
  spr.setCursor(16 + cw + (cw - tw) / 2, 207); spr.print("Time");
  spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
  tw = spr.textWidth(timeBuf);
  spr.setCursor(16 + cw + (cw - tw) / 2, 228); spr.print(timeBuf);

  // ── SD / sync footer ──────────────────────────────────────────────────────
  uint16_t sdC = sdAvailable ? COL_SUCCESS : COL_MUTED;
  String syncStr = sdAvailable
    ? (sdRecordCount > 0 ? "SD: " + String(sdRecordCount) + " pending" : "SD: Ready")
    : "RAM buffer active";
  spr.fillCircle(14, 280, 3, sdC);
  spr.setFont(F_TINY); spr.setTextColor(sdC, COL_BG);
  spr.setCursor(22, 276); spr.print(syncStr);

  spr.pushSprite(0, 0);
}

// ── PAIR LECTURER — Screen 2 (hotspot connection info + spinner) ──────────────
static void drawPairScreen() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Pair Lecturer", online);

  String apName = "Dikly-" + macSuffix();

  // Connection info card
  card(spr, 10, 56, SW - 20, 76, COL_CARD, COL_BORDER, 12);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(20, 62); spr.print("Connect phone to hotspot:");
  spr.setFont(F_SMALL); spr.setTextColor(COL_PRIMARY, COL_CARD);
  spr.setCursor(20, 78); spr.print(apName);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(20, 99); spr.print("Open network — no password");
  spr.setCursor(20, 113); spr.print("Then open: 192.168.4.1");

  // Device ID card
  card(spr, 10, 138, SW - 20, 38, COL_CARD, COL_BORDER, 10);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(20, 144); spr.print("Device ID");
  spr.setFont(F_SMALL); spr.setTextColor(COL_TEXT, COL_CARD);
  spr.setCursor(20, 158); spr.print(apName);

  // Waiting for connection — animated spinner card
  static uint8_t pairSpin = 0; pairSpin = (pairSpin + 1) % 8;
  const char* sf[8] = { "|", "/", "-", "\\", "|", "/", "-", "\\" };
  card(spr, 10, 182, SW - 20, 48, COL_CARD, COL_BORDER, 10);
  spr.setFont(F_MED); spr.setTextColor(COL_PRIMARY, COL_CARD);
  spr.setCursor(22, 194); spr.print(sf[pairSpin]);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(48, 190); spr.print("Waiting for connection...");
  spr.setCursor(48, 205); spr.print("Device is active as hotspot");

  if (!institutionCode.isEmpty()) {
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    String instLbl = "Institution: " + institutionCode;
    int32_t lw2 = spr.textWidth(instLbl);
    spr.setCursor((SW - lw2) / 2, 240); spr.print(instLbl);
  }

  drawTabBar(spr, 0);
  spr.pushSprite(0, 0);
}

// ── ATTENDANCE SUMMARY — Screen 4 ─────────────────────────────────────────────
static void drawSummary() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Session Summary", online);

  int32_t gW = (SW - 28) / 2;  // ~106 px per cell

  // Row 1: Total Students | Present
  card(spr, 10, 58, gW, 64, COL_CARD, COL_BORDER, 10);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  int32_t tw2 = spr.textWidth("Total Students");
  spr.setCursor(10 + (gW - tw2) / 2, 64); spr.print("Total Students");
  spr.setFont(F_MED); spr.setTextColor(COL_TEXT, COL_CARD);
  String totStr = String(summaryTotal);
  tw2 = spr.textWidth(totStr);
  spr.setCursor(10 + (gW - tw2) / 2, 84); spr.print(totStr);

  card(spr, 10 + gW + 8, 58, gW, 64, COL_CARD, COL_BORDER, 10);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  tw2 = spr.textWidth("Present");
  spr.setCursor(10 + gW + 8 + (gW - tw2) / 2, 64); spr.print("Present");
  spr.setFont(F_MED); spr.setTextColor(COL_SUCCESS, COL_CARD);
  String presStr = String(summaryPresent);
  tw2 = spr.textWidth(presStr);
  spr.setCursor(10 + gW + 8 + (gW - tw2) / 2, 84); spr.print(presStr);

  // Row 2: Absent | Percentage
  uint32_t absentNum = (summaryTotal > summaryPresent) ? summaryTotal - summaryPresent : 0;
  card(spr, 10, 128, gW, 64, COL_CARD, COL_BORDER, 10);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  tw2 = spr.textWidth("Absent");
  spr.setCursor(10 + (gW - tw2) / 2, 134); spr.print("Absent");
  spr.setFont(F_MED); spr.setTextColor(COL_ERROR, COL_CARD);
  String absStr = String(absentNum);
  tw2 = spr.textWidth(absStr);
  spr.setCursor(10 + (gW - tw2) / 2, 154); spr.print(absStr);

  card(spr, 10 + gW + 8, 128, gW, 64, COL_CARD, COL_BORDER, 10);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  tw2 = spr.textWidth("Percentage");
  spr.setCursor(10 + gW + 8 + (gW - tw2) / 2, 134); spr.print("Percentage");
  spr.setFont(F_MED); spr.setTextColor(COL_PRIMARY, COL_CARD);
  char pctBuf[8]; snprintf(pctBuf, sizeof(pctBuf), "%.0f%%", summaryPct);
  tw2 = spr.textWidth(pctBuf);
  spr.setCursor(10 + gW + 8 + (gW - tw2) / 2, 154); spr.print(pctBuf);

  // Action: View Attendance List
  card(spr, 10, 200, SW - 20, 34, COL_CARD, COL_BORDER, 8);
  spr.setFont(F_TINY); spr.setTextColor(COL_TEXT, COL_CARD);
  spr.setCursor(18, 208); spr.print("View Attendance List");
  spr.setTextColor(COL_MUTED, COL_CARD);
  String cLbl = summaryCourse.isEmpty() ? "Session complete" : summaryCourse;
  spr.setCursor(18, 221); spr.print(cLbl);
  spr.setFont(F_SMALL); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(SW - 22, 212); spr.print(">");

  // Action: Export Report (SD card)
  card(spr, 10, 240, SW - 20, 30, COL_CARD, COL_BORDER, 8);
  spr.drawRoundRect(18, 246, 8, 12, 2, sdAvailable ? COL_SUCCESS : COL_MUTED);
  spr.fillRect(21, 244, 3, 3, COL_CARD);  // notch
  spr.setFont(F_TINY); spr.setTextColor(COL_TEXT, COL_CARD);
  spr.setCursor(32, 246); spr.print("Export Report");
  spr.setTextColor(sdAvailable ? COL_SUCCESS : COL_MUTED, COL_CARD);
  spr.setCursor(32, 259); spr.print(sdAvailable ? "SD card ready" : "No SD card");
  spr.setFont(F_SMALL); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(SW - 22, 252); spr.print(">");

  drawTabBar(spr, 2);  // Records tab active
  spr.pushSprite(0, 0);
}

// ── SETTINGS — Screen 5 ───────────────────────────────────────────────────────
static void drawSettings() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Settings", online);

  const int32_t ROW_H = 40;

  auto settRow = [&](int32_t idx, uint16_t iconCol, const char* iconTxt,
                     const char* label, const char* value, uint16_t valCol, bool danger) {
    int32_t y = 58 + idx * ROW_H;
    spr.fillRect(0, y, SW, ROW_H, COL_BG);
    spr.fillRect(14, y + ROW_H - 1, SW - 28, 1, COL_BORDER);
    spr.fillCircle(26, y + 20, 11, danger ? 0x2000U : (uint32_t)COL_CARD);
    spr.drawCircle(26, y + 20, 11, danger ? COL_ERROR : COL_BORDER);
    spr.setFont(F_TINY); spr.setTextColor(iconCol, danger ? 0x2000U : (uint32_t)COL_CARD);
    int32_t iw = spr.textWidth(iconTxt);
    spr.setCursor(26 - iw / 2, y + 16); spr.print(iconTxt);
    spr.setFont(F_TINY); spr.setTextColor(danger ? COL_ERROR : COL_TEXT, COL_BG);
    spr.setCursor(46, y + 10); spr.print(label);
    if (value && value[0]) {
      spr.setTextColor(valCol, COL_BG);
      spr.setCursor(46, y + 24); spr.print(value);
    }
    spr.setTextColor(COL_MUTED, COL_BG);
    spr.setCursor(SW - 14, y + 16); spr.print(">");
  };

  String wfVal = wifiSSID.isEmpty() ? "Not configured" :
                 (WiFi.status() == WL_CONNECTED ? wifiSSID : "Connecting...");
  uint16_t wfCol = (WiFi.status() == WL_CONNECTED) ? COL_SUCCESS : COL_MUTED;
  String syncVal = (WiFi.status() == WL_CONNECTED) ? "Connected" : "Offline";
  uint16_t syncCol2 = (WiFi.status() == WL_CONNECTED) ? COL_SUCCESS : COL_MUTED;
  String brtStr = (curBrightness >= 220) ? "High" :
                  (curBrightness >= 155) ? "Medium" : "Low";

  settRow(0, COL_SUCCESS, "W", "Wi-Fi Network",     wfVal.c_str(),        wfCol,    false);
  settRow(1, COL_PRIMARY, "S", "Sync Status",        syncVal.c_str(),      syncCol2, false);
  settRow(2, COL_WARNING, "B", "Brightness",         brtStr.c_str(),       COL_TEXT, false);
  settRow(3, COL_MUTED,   "i", "Device Information", "",                   COL_MUTED,false);
  settRow(4, COL_ERROR,   "!", "Factory Reset",      "Hold 3s to confirm", COL_MUTED,true);

  drawTabBar(spr, 3);  // Settings tab active
  spr.pushSprite(0, 0);
}

// ── DEVICE INFO — Screen 6 ────────────────────────────────────────────────────
static void drawDeviceInfo() {
  spr.fillSprite(COL_BG);
  bool online = (WiFi.status() == WL_CONNECTED);
  _drawSubHeader(spr, "Device Info", online);

  const int32_t ROW_H = 36;

  auto infoRow = [&](int32_t idx, const char* label, const String& val, uint16_t valCol) {
    int32_t y = 58 + idx * ROW_H;
    spr.fillRect(0, y, SW, ROW_H, COL_BG);
    spr.fillRect(14, y + ROW_H - 1, SW - 28, 1, COL_BORDER);
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    spr.setCursor(14, y + 5); spr.print(label);
    spr.setTextColor(valCol, COL_BG);
    spr.setCursor(14, y + 19); spr.print(val);
  };

  infoRow(0, "Device ID",        "Dikly-" + macSuffix(),       COL_PRIMARY);
  infoRow(1, "Model",            "ES3C28P  ESP32-S3",           COL_TEXT);
  infoRow(2, "Firmware Version", String(FIRMWARE_VERSION),      COL_TEXT);

  uint32_t upSec = millis() / 1000;
  char upBuf[24]; snprintf(upBuf, sizeof(upBuf), "%uh %02um %02us",
                           upSec / 3600, (upSec % 3600) / 60, upSec % 60);
  infoRow(3, "Uptime", String(upBuf), COL_TEXT);

  // Memory usage row — custom with purple progress bar
  {
    int32_t y = 58 + 4 * ROW_H;
    spr.fillRect(0, y, SW, ROW_H, COL_BG);
    spr.fillRect(14, y + ROW_H - 1, SW - 28, 1, COL_BORDER);
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    spr.setCursor(14, y + 4); spr.print("Memory Usage");
    uint32_t freeH  = ESP.getFreeHeap();
    uint32_t totalH = ESP.getHeapSize();
    uint32_t usedPct = (totalH > 0) ? (totalH - freeH) * 100 / totalH : 0;
    char memBuf[30];
    snprintf(memBuf, sizeof(memBuf), "%uKB free / %uKB total", freeH / 1024, totalH / 1024);
    spr.setFont(F_TINY); spr.setTextColor(COL_TEXT, COL_BG);
    spr.setCursor(14, y + 17); spr.print(memBuf);
    int32_t bx = 14, bby = y + 28, bw = SW - 28;
    int32_t bf = (int32_t)(bw * usedPct / 100);
    spr.fillRoundRect(bx, bby, bw, 6, 3, COL_BORDER);
    if (bf > 0) spr.fillRoundRect(bx, bby, bf, 6, 3, COL_PRIMARY);
  }

  String sdStr = sdAvailable ?
    ("OK — " + String((uint32_t)(SD_MMC.cardSize() / (1024ULL * 1024ULL))) + " MB") :
    "Not found";
  infoRow(5, "SD Card", sdStr, sdAvailable ? COL_SUCCESS : COL_MUTED);

  drawTabBar(spr, 3);  // Settings tab active
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

  const uint16_t CYAN = 0x07FF;

  // Header
  spr.setFont(F_LOGO); spr.setTextSize(1);
  spr.setTextColor(CYAN, COL_BG);
  spr.setCursor(14, 12); spr.print("DIKLY");
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
  spr.setCursor(14, 38); spr.print("Device Pairing");
  spr.drawFastHLine(14, 52, SW - 28, COL_BORDER);

  // Title
  uint16_t titleCol = (step == 0) ? COL_ERROR : (step == 4) ? COL_SUCCESS : CYAN;
  spr.setFont(F_SMALL); spr.setTextColor(titleCol, COL_BG);
  int32_t tw = spr.textWidth(title);
  spr.setCursor((SW - tw) / 2, 62); spr.print(title);

  // Step progress dots
  const uint8_t STEPS = 4;
  int32_t dotSpacing = (SW - 28) / (STEPS - 1);
  for (uint8_t i = 1; i <= STEPS; i++) {
    int32_t dx = 14 + (i - 1) * dotSpacing;
    uint16_t dc = (step == 0) ? COL_MUTED : (i < step) ? COL_SUCCESS : (i == step) ? titleCol : COL_BORDER;
    spr.fillCircle(dx, 92, 6, dc);
    if (i < STEPS) spr.drawFastHLine(dx + 7, 92, dotSpacing - 14, i < step ? COL_SUCCESS : COL_BORDER);
    spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_BG);
    const char* labels[] = {"WiFi", "Clock", "Server", "Done"};
    int32_t lw = spr.textWidth(labels[i - 1]);
    spr.setCursor(dx - lw / 2, 103); spr.print(labels[i - 1]);
  }

  // Info card
  spr.fillRoundRect(10, 120, SW - 20, 80, 10, COL_CARD);
  spr.drawRoundRect(10, 120, SW - 20, 80, 10, step == 0 ? COL_ERROR : step == 4 ? COL_SUCCESS : COL_BORDER);
  spr.setFont(F_TINY); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(20, 130); spr.print(line1);
  if (line2 && line2[0]) {
    spr.setTextColor(COL_ERROR, COL_CARD);
    spr.setCursor(20, 148); spr.print(line2);
  }

  // Spinner / checkmark
  if (step > 0 && step < 4) {
    static uint8_t spin = 0; spin = (spin + 1) % 8;
    const char* frames[] = {"|", "/", "—", "\\", "|", "/", "—", "\\"};
    spr.setFont(F_MED); spr.setTextColor(CYAN, COL_BG);
    tw = spr.textWidth(frames[spin]);
    spr.setCursor((SW - tw) / 2, 215); spr.print(frames[spin]);
  } else if (step == 4) {
    spr.setFont(F_MED); spr.setTextColor(COL_SUCCESS, COL_BG);
    tw = spr.textWidth("✓");
    spr.setCursor((SW - tw) / 2, 215); spr.print("✓");
  }

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

// ─── Local HTTP (WiFi proxy for Attendance Device page) ──────────────────────
static void registerLocalHttp() {
  localHttp.on("/status", HTTP_GET, []() {
    JsonDocument doc;
    doc["deviceId"]        = deviceId;
    doc["firmwareVersion"] = FIRMWARE_VERSION;
    doc["wifiSSID"]        = wifiSSID;
    doc["localIp"]         = WiFi.localIP().toString();
    doc["sessionActive"]   = !sessionId.isEmpty();
    String s; serializeJson(doc, s);
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
    else if (tabIdx == 1) curScreen = sessionId.isEmpty() ? READY : SESSION;
    else if (tabIdx == 2) curScreen = SUMMARY;
    else if (tabIdx == 3) curScreen = SETTINGS;
    return;
  }
  // Back button (header area, left quarter)
  if (ty < 46 && tx < 50) {
    if (curScreen == PAIR_SCREEN || curScreen == SUMMARY) curScreen = READY;
    else if (curScreen == SETTINGS)                       curScreen = READY;
    else if (curScreen == DEVICE_INFO)                    curScreen = SETTINGS;
    return;
  }
  // READY screen
  if (curScreen == READY) {
    if      (ty >= 138 && ty <= 168) curScreen = PAIR_SCREEN;  // Pair Lecturer button
    else if (ty >= 250)              curScreen = DEVICE_INFO;  // Device ID row
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
      bleStop();
      curScreen = SUMMARY;
    }
  }
  // SETTINGS screen — 5 rows × 40 px starting at y=58
  else if (curScreen == SETTINGS) {
    if (ty >= 58 && ty < 58 + 5 * 40) {
      int32_t rowIdx = ((int32_t)ty - 58) / 40;
      if (rowIdx == 0) {                           // Wi-Fi Network
        if (wifiNetCount == 0) doWifiScan();
        curScreen = WIFI_SCAN;
      } else if (rowIdx == 2) {                    // Brightness cycle
        if      (curBrightness >= 220) curBrightness = 180;
        else if (curBrightness >= 155) curBrightness = 100;
        else                           curBrightness = 255;
        display.setBrightness(curBrightness);
      } else if (rowIdx == 3) {                    // Device Information
        curScreen = DEVICE_INFO;
      }
      // rowIdx == 4 (Factory Reset) requires long-press — handled in loop()
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
      // Factory reset: 3-second hold on row 4 of Settings (y 218-258)
      if (curScreen == SETTINGS && !touchHandled &&
          touchY >= 218 && touchY < 258 &&
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
  bool sessActive = !sessionId.isEmpty() && !sessionSeed.isEmpty() && timeSynced;
  if (sessActive && !wasSessActive) {
    // Session just became active — navigate home screens to SESSION
    if (curScreen == READY || curScreen == PAIR_SCREEN) curScreen = SESSION;
  } else if (!sessActive && wasSessActive) {
    // Session just ended via heartbeat (server removed it) — go to READY
    if (curScreen == SESSION) curScreen = READY;
  }
  wasSessActive = sessActive;

  // Render at ~10 fps
  static uint32_t lastDraw = 0;
  if (now - lastDraw < 100) { delay(10); return; }
  lastDraw = now;

  switch (curScreen) {
    case SESSION: {
      if (!sessActive) { curScreen = READY; drawReady(); break; }
      time_t unixNow = time(nullptr);
      uint32_t secsInWin = (uint32_t)unixNow % WINDOW_SECONDS;
      uint32_t secsLeft  = WINDOW_SECONDS - secsInWin;
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
        bleStop(); curScreen = SUMMARY; drawSummary(); return;
      }
      bleUpdatePayload();
      drawSession(code, secsLeft, WINDOW_SECONDS);
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
