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
 *    from the lecturer portal, and your school WiFi credentials.
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
 *    slot   = floor(unixSeconds / 20)
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
      cfg.dma_channel = SPI_DMA_CH_AUTO;
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
#include <ArduinoJson.h>
#include <SPI.h>
#include <SD.h>

// Forward declarations
static void startWifiReconfigPortal();

// ─── Pin / Hardware Config ───────────────────────────────────────────────────
// Confirmed from board silkscreen (Shenzhen Hong Shu Yuan ES3C28P):
//   I2C header: IO15 = SCL, IO16 = SDA
static const uint8_t TOUCH_SDA  = 16;
static const uint8_t TOUCH_SCL  = 15;
static const uint8_t TOUCH_INT  = 17;
static const uint8_t TOUCH_RST  = 18;
static const uint8_t LED_PIN    = 42;  // single-wire RGB LED on IO42
static const uint8_t FT6X36_ADDR = 0x38;

// SD card — shares FSPI bus (SCLK=12, MISO=13, MOSI=11) with display.
static const uint8_t SD_CS_PIN = 38;

// ─── App Config ──────────────────────────────────────────────────────────────
static const char*   FIRMWARE_VERSION     = "s3-2.1.0";
static const char*   DEFAULT_API_BASE     = "https://dikly.sbs";
static const uint32_t HEARTBEAT_MS        = 5000;
static const uint32_t WIFI_TIMEOUT_MS     = 30000;
static const uint32_t WINDOW_SECONDS      = 300;  // code rotation period (5 minutes)

// ─── Colour Palette (RGB565) ─────────────────────────────────────────────────
#define COL_BG        0x0841   // #0f172a  dark navy
#define COL_CARD      0x1082   // #1e293b  slate card
#define COL_BORDER    0x2124   // #334155  border
#define COL_PRIMARY   0x639B   // #6366f1  indigo
#define COL_SUCCESS   0x2764   // #22c55e  green
#define COL_WARNING   0xFD00   // #f59e0b  amber
#define COL_ERROR     0xE904   // #ef4444  red
#define COL_TEXT      0xE71C   // #e2e8f0  light text
#define COL_MUTED     0x8430   // #94a3b8  muted text
#define COL_WHITE     0xFFFF
#define COL_BLACK     0x0000
#define COL_DIM_CARD  0x0C62   // slightly lighter than bg for alternating

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
uint32_t studentsMarked   = 0;

uint32_t lastHbMs    = 0;
uint8_t  hbFails     = 0;
bool     timeSynced  = false;
bool     forceReconn = false;

// Screen state machine
enum Screen { SPLASH, SETUP, WIFI_SCAN, WIFI_RECONFIG, CONNECTING, READY, SESSION };
Screen curScreen = SPLASH;
String statusMsg = "";
uint32_t splashStart = 0;

// Touch state
bool     touchActive  = false;
uint16_t touchX = 0, touchY = 0;
uint32_t touchDownMs  = 0;
bool     touchHandled = false;   // prevents hold-repeat firing as a tap

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

// SD: ES3C28P uses SDIO (CLK=IO38, CMD=IO40, DATA0-3=IO39/41/48/47), not SPI.
// SPI-mode SD init on the same FSPI bus as the display corrupts the GPIO matrix
// and causes a white screen.  SDMMC driver support can be added later.
static bool        sdAvailable  = false;
static uint32_t    sdRecordCount = 0;  // tracks records written to SD file

struct OfflineRec {
  char indexNumber[32];
  char userId[32];
  char code[8];
  char sessionId[48];
  uint32_t ts;
};
static OfflineRec offlineBuf[200];
static uint8_t    offlineCount = 0;

// ─── Per-session duplicate guard ─────────────────────────────────────────────
static char     dedupIds[400][32];   // 400 students × 32 chars ≈ 12.5 KB
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

// ─── Touch (FT6X36) ──────────────────────────────────────────────────────────
static void touchInit() {
  Wire.begin(TOUCH_SDA, TOUCH_SCL);
  if (TOUCH_RST >= 0) {
    pinMode(TOUCH_RST, OUTPUT);
    digitalWrite(TOUCH_RST, LOW); delay(10);
    digitalWrite(TOUCH_RST, HIGH); delay(100);
  }
  if (TOUCH_INT >= 0) pinMode(TOUCH_INT, INPUT);
}

// Returns true if a finger is down; sets tx, ty.
static bool touchRead(uint16_t& tx, uint16_t& ty) {
  Wire.beginTransmission(FT6X36_ADDR);
  Wire.write(0x02); // TD_STATUS
  if (Wire.endTransmission(false) != 0) return false;
  Wire.requestFrom((uint8_t)FT6X36_ADDR, (uint8_t)6);
  if (Wire.available() < 6) return false;
  uint8_t td  = Wire.read();
  uint8_t xh  = Wire.read(); uint8_t xl = Wire.read();
  uint8_t yh  = Wire.read(); uint8_t yl = Wire.read();
  Wire.read(); // misc
  if ((td & 0x0F) == 0) return false;
  tx = ((xh & 0x0F) << 8) | xl;
  ty = ((yh & 0x0F) << 8) | yl;
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
  HTTPClient http;
  if (!http.begin(client, apiBase + path)) return -1;
  http.addHeader("Content-Type", "application/json");
  if (authed && !deviceJWT.isEmpty())
    http.addHeader("Authorization", "Bearer " + deviceJWT);
  http.setTimeout(20000);
  int code = http.POST(body); out = http.getString(); http.end();
  return code;
}

// ─── Offline attendance sync ──────────────────────────────────────────────────
static void syncOfflineAttendance() {
  // ── SD path ──────────────────────────────────────────────────────────────────
  if (sdAvailable && sdRecordCount > 0 && SD.exists(SD_ATT_FILE)) {
    File f = SD.open(SD_ATT_FILE, FILE_READ);
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
          if (rec["indexNumber"].is<const char*>()) o["indexNumber"] = rec["indexNumber"];
          if (rec["userId"].is<const char*>())      o["userId"]      = rec["userId"];
          o["codeUsed"]  = rec["code"];
          o["timestamp"] = rec["ts"];
          o["sessionId"] = rec["sid"];
          parsed++;
        }
      }
      f.close();
      if (parsed == 0) { SD.remove(SD_ATT_FILE); sdRecordCount = 0; return; }
      String body; serializeJson(doc, body);
      String resp; int code = postJson("/api/devices/sync", body, resp);
      if (code == 200) {
        LOG("SD sync: " + String(parsed) + " records sent");
        SD.remove(SD_ATT_FILE);
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
    o["codeUsed"]  = offlineBuf[i].code;
    o["timestamp"] = offlineBuf[i].ts;
    o["sessionId"] = offlineBuf[i].sessionId[0] ? offlineBuf[i].sessionId : sessionId.c_str();
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
static bool tryPair(const String& pcode, const String& inst) {
  JsonDocument req;
  req["pairingCode"]     = pcode;
  req["deviceId"]        = deviceId;
  req["deviceName"]      = "Dikly-" + macSuffix();
  req["institutionCode"] = inst;
  String body; serializeJson(req, body);
  String resp; int code = postJson("/api/devices/pair", body, resp, false);
  LOG("Pair → " + String(code));
  if (code != 200 && code != 201) { LOG("Pair fail: " + resp); return false; }
  JsonDocument doc;
  if (deserializeJson(doc, resp)) return false;
  if (!doc["token"].is<const char*>()) return false;
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
  hbFails = 0;
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
      studentsMarked = 0;
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
    studentsMarked  = sess["studentsMarked"]  | 0;
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

// ── Utility: centred text ─────────────────────────────────────────────────────
static void centreText(LGFX_Sprite& s, const String& txt, int32_t y,
                       uint8_t font, uint16_t col, uint8_t size = 1) {
  s.setTextFont(font); s.setTextSize(size); s.setTextColor(col, COL_BG);
  int32_t tw = s.textWidth(txt);
  s.setCursor((SW - tw) / 2, y); s.print(txt);
}

// ── Utility: draw status dot + "Dikly" header bar ────────────────────────────
static void drawHeader(LGFX_Sprite& s, bool online) {
  s.fillRect(0, 0, SW, 38, COL_CARD);
  s.drawFastHLine(0, 38, SW, COL_BORDER);
  // Logo
  s.setTextFont(4); s.setTextSize(1); s.setTextColor(COL_TEXT, COL_CARD);
  s.setCursor(14, 9); s.print("Dikly");
  // Status dot
  uint16_t dotCol = online ? COL_SUCCESS : COL_ERROR;
  s.fillCircle(SW - 20, 19, 7, dotCol);
  // Label
  s.setTextFont(2); s.setTextSize(1); s.setTextColor(COL_MUTED, COL_CARD);
  s.setCursor(SW - 58, 11);
  s.print(online ? "Online" : "Offline");
}

// ── SPLASH ────────────────────────────────────────────────────────────────────
static void drawSplash() {
  spr.fillSprite(COL_BG);
  // Accent bar
  spr.fillRect(0, 0, SW, 6, COL_PRIMARY);
  // Dikly large
  spr.setTextFont(6); spr.setTextSize(1); spr.setTextColor(COL_TEXT, COL_BG);
  int32_t tw = spr.textWidth("Dikly");
  spr.setCursor((SW - tw) / 2, 90); spr.print("Dikly");
  // Indigo line under logo
  spr.fillRect((SW - 80) / 2, 148, 80, 3, COL_PRIMARY);
  // Subtitle
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_BG);
  String sub = "Attendance System";
  tw = spr.textWidth(sub);
  spr.setCursor((SW - tw) / 2, 162); spr.print(sub);
  // Version
  spr.setTextFont(2); spr.setTextColor(COL_BORDER, COL_BG);
  String ver = String("v") + FIRMWARE_VERSION;
  tw = spr.textWidth(ver);
  spr.setCursor((SW - tw) / 2, 295); spr.print(ver);
  spr.pushSprite(0, 0);
}

// ── SETUP (captive portal) ────────────────────────────────────────────────────
static void drawSetup(const String& apName) {
  spr.fillSprite(COL_BG);
  spr.fillRect(0, 0, SW, 6, COL_WARNING);
  // Title
  spr.setTextFont(4); spr.setTextColor(COL_TEXT, COL_BG);
  String t = "Device Setup";
  int32_t tw = spr.textWidth(t);
  spr.setCursor((SW - tw) / 2, 20); spr.print(t);
  // Instruction card
  card(spr, 10, 58, SW - 20, 90, COL_CARD, COL_BORDER, 12);
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(22, 68); spr.print("1. Connect your phone to WiFi:");
  spr.setTextFont(4); spr.setTextColor(COL_PRIMARY, COL_CARD);
  tw = spr.textWidth(apName);
  spr.setCursor((SW - tw) / 2, 86); spr.print(apName);
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(22, 118); spr.print("2. Open browser → 192.168.4.1");
  // Arrow / divider
  spr.setTextFont(2); spr.setTextColor(COL_TEXT, COL_BG);
  spr.setCursor(22, 160); spr.print("3. Enter institution code,");
  spr.setCursor(22, 176); spr.print("   pairing code & school WiFi.");
  // Factory reset hint
  card(spr, 10, 210, SW - 20, 40, 0x2000, 0x4000, 8);
  spr.setTextFont(2); spr.setTextColor(COL_WARNING, 0x2000);
  spr.setCursor(20, 223); spr.print("Hold anywhere 3 s to factory reset");
  // Pulsing dot (static — loop redraws)
  spr.fillCircle(SW / 2, 278, 8, COL_WARNING);
  spr.pushSprite(0, 0);
}

// ── WIFI RECONFIG (paired, but saved network unavailable) ────────────────────
static void drawWifiReconfig(const String& apName) {
  spr.fillSprite(COL_BG);
  spr.fillRect(0, 0, SW, 6, COL_WARNING);
  // Title
  spr.setTextFont(4); spr.setTextColor(COL_TEXT, COL_BG);
  String t = "Change WiFi";
  int32_t tw = spr.textWidth(t);
  spr.setCursor((SW - tw) / 2, 20); spr.print(t);
  // Info card
  card(spr, 10, 52, SW - 20, 56, COL_CARD, COL_BORDER, 10);
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(18, 62); spr.print("Saved network not found.");
  spr.setCursor(18, 78); spr.print("Connect phone to:");
  spr.setTextFont(2); spr.setTextColor(COL_PRIMARY, COL_CARD);
  tw = spr.textWidth(apName);
  spr.setCursor((SW - tw) / 2, 94); spr.print(apName);
  // Steps
  spr.setTextFont(2); spr.setTextColor(COL_TEXT, COL_BG);
  spr.setCursor(18, 124); spr.print("Then open 192.168.4.1 and");
  spr.setCursor(18, 140); spr.print("enter the new WiFi details.");
  // Note — pairing is kept
  card(spr, 10, 165, SW - 20, 44, 0x0841, COL_SUCCESS, 8);
  spr.setTextFont(2); spr.setTextColor(COL_SUCCESS, 0x0841);
  spr.setCursor(18, 174); spr.print("Device pairing is preserved.");
  spr.setCursor(18, 190); spr.print("Only WiFi will change.");
  // Factory reset hint
  card(spr, 10, 224, SW - 20, 36, 0x2000, 0x4000, 8);
  spr.setTextFont(2); spr.setTextColor(COL_WARNING, 0x2000);
  spr.setCursor(18, 235); spr.print("Hold 3 s to full factory reset");
  spr.fillCircle(SW / 2, 284, 8, COL_WARNING);
  spr.pushSprite(0, 0);
}

// ── WIFI SCAN (on-device WiFi picker) ────────────────────────────────────────
#define LIST_Y      70    // y where network list starts
#define ITEM_H      41    // height of each list item (38px + 3px gap)
#define MAX_VIS      6    // max visible items at once
#define SCAN_BTN_X  162   // scan button x
#define SCROLL_X    220   // scroll arrow column x

static void drawWifiScan() {
  spr.fillSprite(COL_BG);
  drawHeader(spr, false);

  // Title
  spr.setTextFont(4); spr.setTextColor(COL_TEXT, COL_BG);
  spr.setCursor(10, 46); spr.print("WiFi Networks");

  // Scan button (top-right)
  uint16_t sbCol = wifiScanning ? COL_MUTED : COL_PRIMARY;
  spr.fillRoundRect(SCAN_BTN_X, 42, 68, 26, 13, sbCol);
  spr.setTextFont(2); spr.setTextColor(COL_WHITE, sbCol);
  String scanLabel = wifiScanning ? "Scanning" : "Scan";
  int32_t stw = spr.textWidth(scanLabel);
  spr.setCursor(SCAN_BTN_X + (68 - stw) / 2, 51); spr.print(scanLabel);

  if (wifiScanning) { spr.pushSprite(0, 0); return; }

  if (!wifiMsg.isEmpty()) {
    spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_BG);
    int32_t tw = spr.textWidth(wifiMsg);
    spr.setCursor((SW - tw) / 2, 170); spr.print(wifiMsg);
    spr.setTextFont(2); spr.setTextColor(COL_BORDER, COL_BG);
    String hint = "Tap Scan to search";
    tw = spr.textWidth(hint);
    spr.setCursor((SW - tw) / 2, 192); spr.print(hint);
    spr.pushSprite(0, 0); return;
  }

  // Network rows
  uint8_t visible = (uint8_t)min((int)wifiNetCount - wifiScroll, MAX_VIS);
  for (uint8_t i = 0; i < visible; i++) {
    uint8_t idx = wifiScroll + i;
    WifiNet& n  = wifiNets[idx];
    int32_t  y  = LIST_Y + i * ITEM_H;

    card(spr, 4, y, 212, 38, COL_CARD, COL_BORDER, 8);

    // Signal bars (4 vertical bars, left side)
    for (uint8_t b = 0; b < 4; b++) {
      uint8_t bh = 6 + b * 5;
      uint16_t bc = (b < (uint8_t)n.bars) ? COL_SUCCESS : COL_BORDER;
      spr.fillRoundRect(10 + b * 8, y + 30 - bh, 6, bh, 1, bc);
    }

    // SSID
    spr.setTextFont(2); spr.setTextColor(COL_TEXT, COL_CARD);
    String ssid = String(n.ssid);
    if (spr.textWidth(ssid) > 118) { ssid = ssid.substring(0, 15); ssid += ".."; }
    spr.setCursor(46, y + 12); spr.print(ssid);

    // Badge — OPEN (green) or PWD (slate)
    if (n.open) {
      spr.fillRoundRect(167, y + 10, 40, 18, 9, COL_SUCCESS);
      spr.setTextFont(2); spr.setTextColor(COL_WHITE, COL_SUCCESS);
      spr.setCursor(172, y + 13); spr.print("OPEN");
    } else {
      spr.fillRoundRect(167, y + 10, 40, 18, 9, COL_BORDER);
      spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_BORDER);
      spr.setCursor(174, y + 13); spr.print("PWD");
    }
  }

  // Scroll arrows (right strip)
  if (wifiScroll > 0)
    spr.fillTriangle(SCROLL_X + 9, LIST_Y - 8,
                     SCROLL_X,     LIST_Y + 8,
                     SCROLL_X + 18,LIST_Y + 8, COL_PRIMARY);
  if (wifiScroll + MAX_VIS < wifiNetCount)
    spr.fillTriangle(SCROLL_X + 9, LIST_Y + MAX_VIS * ITEM_H + 8,
                     SCROLL_X,     LIST_Y + MAX_VIS * ITEM_H - 8,
                     SCROLL_X + 18,LIST_Y + MAX_VIS * ITEM_H - 8, COL_PRIMARY);

  // Footer hint
  spr.setTextFont(2); spr.setTextColor(COL_BORDER, COL_BG);
  String ft = "Hold 3s to factory reset";
  int32_t ftw = spr.textWidth(ft);
  spr.setCursor((SW - ftw) / 2, 308); spr.print(ft);

  spr.pushSprite(0, 0);
}

// ── Tap handler for WiFi scan screen ─────────────────────────────────────────
static void handleWifiScanTap(uint16_t tx, uint16_t ty) {
  // Scan button
  if (tx >= SCAN_BTN_X && ty >= 42 && ty <= 68) {
    drawWifiScan();   // show "Scanning" label immediately
    doWifiScan();
    return;
  }
  // Scroll up
  if (tx >= SCROLL_X && ty >= LIST_Y - 12 && ty <= LIST_Y + 12 && wifiScroll > 0) {
    wifiScroll--; return;
  }
  // Scroll down
  int32_t downY = LIST_Y + MAX_VIS * ITEM_H;
  if (tx >= SCROLL_X && ty >= downY - 12 && ty <= downY + 12
      && wifiScroll + MAX_VIS < wifiNetCount) {
    wifiScroll++; return;
  }
  // Network item tap
  if (tx < 216) {
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
  String ap = "Dikly-" + macSuffix();
  WiFi.softAP(ap.c_str()); delay(200);
  IPAddress gw = WiFi.softAPIP();
  LOG("WiFi reconfig AP: " + ap);

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
  spr.fillSprite(COL_BG);
  spr.fillRect(0, 0, SW, 6, COL_PRIMARY);
  spr.setTextFont(4); spr.setTextColor(COL_TEXT, COL_BG);
  String t = "Connecting";
  int32_t tw = spr.textWidth(t);
  spr.setCursor((SW - tw) / 2, 80); spr.print(t);
  // Animated dots
  String dotStr = "";
  for (uint8_t i = 0; i < dots; i++) dotStr += ".";
  spr.setTextFont(4); spr.setTextColor(COL_PRIMARY, COL_BG);
  tw = spr.textWidth(dotStr);
  spr.setCursor((SW - tw) / 2, 112); spr.print(dotStr);
  // SSID pill
  card(spr, 20, 155, SW - 40, 40, COL_CARD, COL_BORDER, 20);
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_CARD);
  tw = spr.textWidth(ssid);
  spr.setCursor((SW - tw) / 2, 168); spr.print(ssid);
  // Spinning WiFi bars (manual)
  static uint8_t wave = 0; wave = (wave + 1) % 8;
  int32_t bx = SW / 2 - 22, by = 228;
  for (uint8_t i = 0; i < 4; i++) {
    uint8_t h = 6 + i * 7;
    uint16_t col = (i <= wave % 5) ? COL_PRIMARY : COL_BORDER;
    spr.fillRoundRect(bx + i * 14, by + (28 - h), 10, h, 3, col);
  }
  spr.pushSprite(0, 0);
}

// ── READY (idle — no active session) ─────────────────────────────────────────
static void drawReady() {
  spr.fillSprite(COL_BG);
  drawHeader(spr, true);
  // Big green checkmark circle
  spr.fillCircle(SW / 2, 148, 52, COL_SUCCESS);
  // Checkmark via lines
  spr.drawLine(SW/2 - 22, 148, SW/2 - 5, 167, COL_WHITE);
  spr.drawLine(SW/2 - 21, 148, SW/2 - 4, 167, COL_WHITE);
  spr.drawLine(SW/2 - 5,  167, SW/2 + 24, 128, COL_WHITE);
  spr.drawLine(SW/2 - 4,  167, SW/2 + 25, 128, COL_WHITE);
  // Ready text
  spr.setTextFont(4); spr.setTextColor(COL_TEXT, COL_BG);
  String rt = "Ready";
  int32_t tw = spr.textWidth(rt);
  spr.setCursor((SW - tw) / 2, 216); spr.print(rt);
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_BG);
  String sub = "Waiting for a session to start";
  tw = spr.textWidth(sub);
  spr.setCursor((SW - tw) / 2, 246); spr.print(sub);
  // IP + SD status row
  String ip = WiFi.localIP().toString();
  card(spr, 8, 272, SW - 16, 34, COL_CARD, COL_BORDER, 12);
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_CARD);
  tw = spr.textWidth(ip);
  spr.setCursor((SW - tw) / 2, 279); spr.print(ip);
  // SD dot
  uint16_t sdDotCol = sdAvailable ? COL_SUCCESS : COL_WARNING;
  spr.fillCircle(22, 289, 5, sdDotCol);
  spr.setTextFont(2); spr.setTextColor(sdAvailable ? COL_SUCCESS : COL_WARNING, COL_CARD);
  spr.setCursor(30, 283);
  spr.print(sdAvailable ? "SD" : "SD?");
  spr.pushSprite(0, 0);
}

// ── SESSION (attendance code display) ────────────────────────────────────────
static void drawSession(const String& code, uint32_t secsLeft, uint32_t secsTotal) {
  spr.fillSprite(COL_BG);
  drawHeader(spr, true);

  // ── Course + Lecturer ───────────────────────────────────────────────────
  card(spr, 8, 46, SW - 16, 56, COL_CARD, COL_BORDER, 10);
  if (!sessionCourse.isEmpty()) {
    spr.setTextFont(4); spr.setTextColor(COL_TEXT, COL_CARD);
    String c = sessionCourse;
    if (spr.textWidth(c) > SW - 40) c = c.substring(0, 10) + "...";
    int32_t tw = spr.textWidth(c);
    spr.setCursor((SW - tw) / 2, 52); spr.print(c);
  }
  if (!sessionLecturer.isEmpty()) {
    spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_CARD);
    String l = sessionLecturer;
    if (spr.textWidth(l) > SW - 40) l = l.substring(0, 20) + "...";
    int32_t tw = spr.textWidth(l);
    spr.setCursor((SW - tw) / 2, 76); spr.print(l);
  }

  // ── Label ───────────────────────────────────────────────────────────────
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_BG);
  String lbl = "ATTENDANCE CODE";
  int32_t tw = spr.textWidth(lbl);
  spr.setCursor((SW - tw) / 2, 112); spr.print(lbl);

  // ── Big 7-segment code ──────────────────────────────────────────────────
  // Font 7 is a 7-segment style — perfect for attendance codes.
  spr.setTextFont(7); spr.setTextSize(1);
  tw = spr.textWidth(code);
  spr.setTextColor(COL_PRIMARY, COL_BG);
  spr.setCursor((SW - tw) / 2, 126); spr.print(code);

  // ── Countdown bar ────────────────────────────────────────────────────────
  // Urgency colour: green → amber → red
  uint16_t barCol = secsLeft > 120 ? COL_SUCCESS   // > 2 min → green
                  : secsLeft > 60  ? COL_WARNING   // > 1 min → amber
                  :                  COL_ERROR;    // ≤ 1 min → red
  int32_t barW = (int32_t)((SW - 24) * secsLeft / secsTotal);
  // Track
  spr.fillRoundRect(12, 208, SW - 24, 14, 7, COL_CARD);
  // Fill
  if (barW > 0) spr.fillRoundRect(12, 208, barW, 14, 7, barCol);
  // Countdown text
  spr.setTextFont(2); spr.setTextColor(barCol, COL_BG);
  String ct = "Refreshes in " + String(secsLeft) + "s";
  tw = spr.textWidth(ct);
  spr.setCursor((SW - tw) / 2, 228); spr.print(ct);

  // ── Student count card ───────────────────────────────────────────────────
  card(spr, 8, 252, SW - 16, 44, COL_CARD, COL_BORDER, 10);
  spr.setTextFont(4); spr.setTextColor(COL_TEXT, COL_CARD);
  String sc = String(studentsMarked);
  tw = spr.textWidth(sc);
  spr.setCursor((SW / 2) - tw - 4, 258); spr.print(sc);
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_CARD);
  spr.setCursor(SW / 2 + 2, 262); spr.print("students");
  spr.setCursor(SW / 2 + 2, 278); spr.print("marked in");

  // ── Time ────────────────────────────────────────────────────────────────
  time_t now = time(nullptr); struct tm tmNow; localtime_r(&now, &tmNow);
  char timeBuf[9]; strftime(timeBuf, sizeof(timeBuf), "%I:%M %p", &tmNow);
  spr.setTextFont(2); spr.setTextColor(COL_MUTED, COL_BG);
  tw = spr.textWidth(timeBuf);
  spr.setCursor((SW - tw) / 2, 302); spr.print(timeBuf);

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
      <label>Pairing Code <span style="color:#334155;font-weight:400">(from Lecturer Portal)</span></label>
      <input id="pc" name="pairingCode" required autocomplete="off" placeholder="from lecturer portal" maxlength="8" style="text-transform:uppercase">
    </div>
    <div class="card">
      <h3>School WiFi</h3>
      <label>Network</label>
      <div class="row">
        <input id="ssid" name="ssid" required autocomplete="off" placeholder="Select or type SSID">
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
    m.className='ok';m.textContent='✓ Paired! Device is rebooting…';
  }catch(err){m.className='err';m.textContent='✗ '+err.message;b.disabled=false;}
};
</script></body></html>)HTML";

// ─── Captive-portal AP startup ────────────────────────────────────────────────
static void startApPortal() {
  WiFi.mode(WIFI_AP);
  String ap = "Dikly-" + macSuffix();
  WiFi.softAP(ap.c_str()); delay(200);
  IPAddress gw = WiFi.softAPIP();
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
    if (inst.length() < 4 || pcode.length() < 4 || ssid.isEmpty()) {
      localHttp.send(400, "application/json", "{\"error\":\"Missing fields\"}"); return;
    }
    apiBase = api; wifiSSID = ssid; wifiPass = pass;
    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) {
      delay(200); localHttp.handleClient();
    }
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.mode(WIFI_AP);
      localHttp.send(502, "application/json", "{\"error\":\"WiFi connect failed\"}"); return;
    }
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    uint32_t tw = millis();
    while (time(nullptr) < 1000000000UL && millis() - tw < 5000) delay(100);
    if (!tryPair(pcode, inst)) {
      WiFi.disconnect(); WiFi.mode(WIFI_AP);
      localHttp.send(401, "application/json", "{\"error\":\"Pairing rejected — check institution code and pairing code\"}");
      return;
    }
    saveConfig();
    localHttp.send(200, "application/json", "{\"ok\":true}");
    delay(1200); ESP.restart();
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
  // /attend — offline attendance submission (student on school WiFi, no internet)
  localHttp.on("/attend", HTTP_POST, []() {
    if (sessionId.isEmpty() || sessionSeed.isEmpty()) {
      localHttp.send(503, "application/json", "{\"error\":\"No active session\"}"); return;
    }
    if (!timeSynced) {
      localHttp.send(503, "application/json", "{\"error\":\"Device clock not synced yet. Try again in a moment.\"}"); return;
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
    if (submittedCode.length() != 6) {
      localHttp.send(400, "application/json", "{\"error\":\"Code must be 6 digits\"}"); return;
    }
    // Validate against current and previous window (±20s clock tolerance)
    time_t now = time(nullptr);
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
      File f = SD.open(SD_ATT_FILE, FILE_APPEND);
      if (f) {
        JsonDocument entry;
        if (indexNum.length()) entry["indexNumber"] = indexNum;
        if (userId.length())   entry["userId"]      = userId;
        entry["code"] = submittedCode;
        entry["sid"]  = sessionId;
        entry["ts"]   = (uint32_t)now;
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
      strncpy(rec.indexNumber, indexNum.c_str(), sizeof(rec.indexNumber) - 1);
      strncpy(rec.userId,      userId.c_str(),   sizeof(rec.userId) - 1);
      strncpy(rec.code,        submittedCode.c_str(), sizeof(rec.code) - 1);
      strncpy(rec.sessionId,   sessionId.c_str(), sizeof(rec.sessionId) - 1);
      rec.ts = (uint32_t)now;
      LOG("RAM attendance [" + String(offlineCount) + "] idx=" + indexNum);
    }
    dedupAdd(dedupKey);
    localHttp.send(200, "application/json", "{\"ok\":true,\"message\":\"Attendance recorded. Will sync when internet returns.\"}");
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

  // Display init — LovyanGFX with SPI2_HOST, ILI9341, pins confirmed working
  display.init();
  display.invertDisplay(true);  // ES3C28P ILI9341 requires INVON (sends 0x21)
  display.setRotation(0);  // 0 = portrait
  display.fillScreen(COL_BG);

  // Sprite for flicker-free rendering (~150 KB PSRAM).
  // Requires Tools → PSRAM → OPI PSRAM in Arduino IDE.
  spr.setColorDepth(16);
  void* sprBuf = spr.createSprite(SW, SH);
  if (!sprBuf) {
    LOG("PSRAM not available — sprite disabled, using direct display draw");
    display.setTextColor(TFT_WHITE, COL_BG);
    display.setTextSize(2);
    display.drawString("DIKLY", 80, 140);
    display.setTextSize(1);
    display.drawString("Enable OPI PSRAM", 40, 170);
    display.drawString("in Arduino IDE Tools", 30, 185);
  }

  // Touch init
  touchInit();

  // SD: ES3C28P uses SDIO (not SPI). Calling SPIClass::begin() on the same FSPI
  // bus that LovyanGFX owns reconfigures the GPIO matrix and kills the display.
  // SD is disabled here; use RAM buffer for offline records.
  sdAvailable = false;
  LOG("SD disabled — ES3C28P SD is SDIO, not SPI; using RAM buffer");

  // Splash
  splashStart = millis();
  drawSplash();

  loadConfig();
  LOG("Boot — " + deviceId + " fw=" + String(FIRMWARE_VERSION));

  // Unpaired or no WiFi → captive portal
  if (deviceJWT.isEmpty() || wifiSSID.isEmpty()) {
    LOG("Entering setup AP mode");
    startApPortal();
    return;
  }

  // Connect to school WiFi
  curScreen = CONNECTING;
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) {
    drawConnecting(wifiSSID);
    delay(180);
  }
  if (WiFi.status() != WL_CONNECTED) {
    LOG("WiFi fail — showing on-device WiFi scanner");
    curScreen = WIFI_SCAN;
    wifiMsg = "Tap Scan to find networks.";
    drawWifiScan();
    return;
  }
  digitalWrite(LED_PIN, HIGH);
  LOG("WiFi OK: " + WiFi.localIP().toString());
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  registerLocalHttp();
  localHttp.begin();
  curScreen = READY;
}

void loop() {
  dns.processNextRequest();
  localHttp.handleClient();

  // WiFi scanner screen (paired device, no WiFi connection yet)
  if (curScreen == WIFI_SCAN) {
    uint16_t tx, ty;
    bool touched = touchRead(tx, ty);
    if (touched) {
      if (!touchActive) {
        touchActive = true; touchDownMs = millis(); touchHandled = false;
      } else if (!touchHandled && millis() - touchDownMs >= 3000) {
        touchHandled = true; factoryReset();
      }
    } else {
      if (touchActive && !touchHandled) {
        // Short tap released
        handleWifiScanTap(tx, ty);
      }
      touchActive = false; touchHandled = false;
    }
    drawWifiScan();
    delay(80);
    return;
  }

  // AP portal paths (setup or wifi-reconfig for password entry)
  if (deviceJWT.isEmpty() || WiFi.getMode() == WIFI_AP) {
    uint16_t tx, ty;
    if (touchRead(tx, ty)) {
      if (!touchActive) { touchActive = true; touchDownMs = millis(); }
      else if (millis() - touchDownMs >= 3000) factoryReset();
    } else { touchActive = false; }
    if (curScreen == SETUP)         drawSetup("Dikly-" + macSuffix());
    if (curScreen == WIFI_RECONFIG) drawWifiReconfig("Dikly-" + macSuffix());
    delay(60);
    return;
  }

  // WiFi reconnect
  if (WiFi.status() != WL_CONNECTED) {
    curScreen = CONNECTING;
    drawConnecting(wifiSSID);
    static uint32_t lastReconn = 0;
    if (millis() - lastReconn > 10000) {
      lastReconn = millis();
      WiFi.disconnect(false); delay(200);
      WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    }
    delay(300); return;
  }
  if (forceReconn) {
    forceReconn = false;
    WiFi.disconnect(false); delay(200);
    WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    return;
  }

  // Heartbeat
  uint32_t now = millis();
  if (now - lastHbMs >= HEARTBEAT_MS) { lastHbMs = now; sendHeartbeat(); }

  // Render at ~10 fps
  static uint32_t lastDraw = 0;
  if (now - lastDraw < 100) { delay(10); return; }
  lastDraw = now;

  if (!sessionId.isEmpty() && !sessionSeed.isEmpty() && timeSynced) {
    curScreen = SESSION;
    time_t unixNow = time(nullptr);
    uint32_t secsInWin = (uint32_t)unixNow % WINDOW_SECONDS;
    uint32_t secsLeft  = WINDOW_SECONDS - secsInWin;
    String code = deriveCode(sessionSeed, (uint32_t)unixNow);

    // Auto-clear if session window closed
    if (sessionStartedAt && unixNow > (time_t)(sessionStartedAt + sessionDuration)) {
      sessionId = ""; sessionSeed = "";
      curScreen = READY; drawReady(); return;
    }
    drawSession(code, secsLeft, WINDOW_SECONDS);
  } else {
    curScreen = READY;
    drawReady();
  }
}
