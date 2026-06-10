/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DIKLY Attendance Device — TE066 Board Firmware
 *
 *  Board: Custom ESP32 (TE066 series)
 *         Manufacturer: Shenzhen Hong Yuan Technology Co. Ltd.
 *
 *  Hardware on this board
 *  ─────────────────────
 *   • ESP32 (WiFi + BT)
 *   • USB-C power / programming
 *   • BOOT + RESET buttons
 *   • I2C connector  → SDA = GPIO 16 / SCL = GPIO 15   (3.3V, GND, IO16, IO15)
 *   • UART connector → RXD = GPIO 3  / TXD = GPIO 1    (5V, GND, TXD0, RXD0)
 *   • BAT connector  → LiPo single cell (3.7 V)
 *   • SD card slot   → SPI (MOSI=23, MISO=19, CLK=18, CS=5)
 *   • Speaker/buzzer → GPIO 26  (configure PIN_SPEAKER below)
 *   • WS2812B RGB LED→ GPIO 27  (configure PIN_LED below)
 *
 *  Attach a 128×64 SSD1306 OLED to the I2C connector (3V3, GND, SDA, SCL).
 *
 *  WHAT IT DOES
 *  ────────────
 *   1. First boot → AP mode "DIKLY-XXXXXX".
 *      Open 192.168.4.1, enter institution code + 6-char pairing code
 *      (from Lecturer Portal → Attendance Device), choose WiFi network.
 *      Calls POST /api/devices/pair → saves long-lived JWT in NVS.
 *
 *   2. Normal boot → connects to school WiFi, syncs NTP, sends heartbeat
 *      every 5 s to POST /api/devices/heartbeat with Bearer JWT.
 *      Heartbeat response carries the active AttendanceSession seed.
 *      Derives the rotating 6-digit code locally via HMAC-SHA256 and
 *      shows it on the OLED with a 5-minute countdown bar.
 *      No per-rotation network call — device and server stay in sync
 *      because both use the same UNIX time slot formula.
 *
 *   3. Local HTTP server (port 80) exposes /status, /wifi/scan,
 *      /wifi/configure so the DIKLY web portal can proxy WiFi reconfig.
 *
 *  ROTATING CODE FORMULA  (must match src/services/attendanceCodeService.js)
 *  ──────────────────────────────────────────────────────────────────────────
 *    slot   = floor(unixSeconds / 120)          // 120 s = 2-minute window
 *    digest = HMAC-SHA256(key=seed, msg=slot)   // ascii(slot) as message
 *    n      = uint32(digest[0..3]) % 1 000 000
 *    code   = zero-pad(n, 6)
 *
 *  REQUIRED LIBRARIES  (Arduino IDE → Sketch → Manage Libraries)
 *   • Adafruit GFX Library  (Adafruit)
 *   • Adafruit SSD1306      (Adafruit)
 *   • FastLED               (Daniel Garcia)  — WS2812B RGB LED
 *   • ArduinoJson  ≥ 7.0    (Benoit Blanchon)
 *  Built into ESP32 core: WiFi, WebServer, HTTPClient, DNSServer,
 *                          Preferences, SD, SPI, mbedtls.
 *
 *  BUILD SETTINGS (Arduino IDE)
 *   Board            : "ESP32 Dev Module"
 *   Partition Scheme : "Default 4MB with spiffs (1.2MB APP / 1.5MB SPIFFS)"
 *   CPU Frequency    : 240 MHz
 *   Flash Frequency  : 80 MHz
 *   Upload Speed     : 921600
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Wire.h>
#include <SD.h>
#include <SPI.h>
#include <time.h>
#include <mbedtls/md.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <FastLED.h>

// ═══════════════════════════════════════════════════════════════════════════
//  BOARD PIN MAP  — TE066
// ═══════════════════════════════════════════════════════════════════════════
#define PIN_SDA        16    // I2C data  (I2C connector label: IO16 SDA)
#define PIN_SCL        15    // I2C clock (I2C connector label: IO15 SCL)
#define PIN_SD_CS       5    // SD card chip-select
#define PIN_SPEAKER    26    // Passive buzzer / speaker (adjust if different)
#define PIN_LED        27    // WS2812B data pin         (adjust if different)
#define NUM_LEDS        1    // Single onboard RGB LED

// ═══════════════════════════════════════════════════════════════════════════
//  OLED
// ═══════════════════════════════════════════════════════════════════════════
#define OLED_W    128
#define OLED_H     64
#define OLED_ADDR 0x3C
#define OLED_RST   -1       // Reset tied to ESP32 EN — no dedicated pin

// ═══════════════════════════════════════════════════════════════════════════
//  FIRMWARE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
static const char*    FIRMWARE_VER        = "te066-1.0.0";
static const char*    DEFAULT_API_BASE    = "https://dikly.sbs";
static const char*    NVS_NAMESPACE       = "dikly";
static const uint32_t WINDOW_SECONDS      = 120;   // MUST match backend WINDOW_SECONDS
static const uint32_t HEARTBEAT_INTERVAL  = 5000;  // ms between heartbeats
static const uint32_t WIFI_CONNECT_TIMEOUT= 30000; // ms to wait for WiFi
static const uint32_t NTP_TIMEOUT         = 8000;  // ms to wait for NTP

// ═══════════════════════════════════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════════════════════════════════
Adafruit_SSD1306 oled(OLED_W, OLED_H, &Wire, OLED_RST);
Preferences      prefs;
WebServer        httpServer(80);
DNSServer        dns;
CRGB             leds[NUM_LEDS];

// Persistent config (NVS)
String cfgSsid, cfgPass, cfgJwt, cfgApi, cfgInst, cfgDeviceId;

// Runtime session state (received via heartbeat)
String  sessId, sessTitle, sessSeed;
uint32_t sessStartedAt = 0;
uint32_t sessDuration  = 300;

// Runtime flags
bool     sdOk           = false;
bool     timeSynced     = false;
uint32_t lastHbMs       = 0;
uint8_t  hbFailCount    = 0;

// ═══════════════════════════════════════════════════════════════════════════
//  LED HELPERS
// ═══════════════════════════════════════════════════════════════════════════
void ledSet(CRGB c) { leds[0] = c; FastLED.show(); }
void ledOff()    { ledSet(CRGB::Black);  }
void ledBlue()   { ledSet(CRGB(0, 40, 200)); }
void ledGreen()  { ledSet(CRGB(0, 180, 0)); }
void ledYellow() { ledSet(CRGB(220, 140, 0)); }
void ledRed()    { ledSet(CRGB(200, 0, 0)); }
void ledPurple() { ledSet(CRGB(100, 0, 220)); }
void ledWhite()  { ledSet(CRGB(80, 80, 80)); }  // dim white

// ═══════════════════════════════════════════════════════════════════════════
//  SPEAKER HELPERS
// ═══════════════════════════════════════════════════════════════════════════
void beep(uint16_t freq, uint16_t ms) {
  tone(PIN_SPEAKER, freq, ms);
  delay(ms + 20);
  noTone(PIN_SPEAKER);
}
void beepOk()    { beep(1800, 80); delay(50); beep(2400, 80); }
void beepError() { beep(400, 350); }
void beepBoot()  { beep(880, 60); delay(40); beep(1100, 60); delay(40); beep(1320, 100); }

// ═══════════════════════════════════════════════════════════════════════════
//  OLED HELPERS
// ═══════════════════════════════════════════════════════════════════════════
void oledClear() { oled.clearDisplay(); oled.setTextColor(SSD1306_WHITE); }

void oledMsg(const char* l1, const char* l2 = nullptr, const char* l3 = nullptr) {
  oledClear();
  oled.setTextSize(1); oled.setCursor(0, 0); oled.println(l1);
  if (l2) { oled.setCursor(0, 16); oled.println(l2); }
  if (l3) { oled.setCursor(0, 32); oled.println(l3); }
  oled.display();
}

void oledPairScreen(const char* apSSID) {
  oledClear();
  oled.setTextSize(1);
  oled.setCursor(0, 0);  oled.println("  [DIKLY SETUP]");
  oled.drawLine(0, 10, OLED_W, 10, SSD1306_WHITE);
  oled.setCursor(0, 14); oled.println("Connect to:");
  oled.setTextSize(1);
  oled.setCursor(0, 25); oled.println(apSSID);
  oled.setCursor(0, 38); oled.println("Then open:");
  oled.setCursor(0, 50); oled.println("http://192.168.4.1");
  oled.display();
}

void oledConnecting(const char* ssid) {
  oledClear();
  oled.setTextSize(1);
  oled.setCursor(0, 0);  oled.println("DIKLY Attendance");
  oled.drawLine(0, 10, OLED_W, 10, SSD1306_WHITE);
  oled.setCursor(0, 16); oled.println("Connecting...");
  oled.setCursor(0, 28); oled.println(ssid);
  oled.display();
}

void oledReady(const char* ip) {
  oledClear();
  oled.setTextSize(1);
  oled.setCursor(0, 0);  oled.println("DIKLY Attendance");
  oled.drawLine(0, 10, OLED_W, 10, SSD1306_WHITE);
  oled.setCursor(0, 16); oled.print("IP: "); oled.println(ip);
  oled.setCursor(0, 28); oled.println("Waiting for");
  oled.setCursor(0, 40); oled.println("session...");
  oled.display();
}

void oledShowCode(const String& code, uint32_t secsLeft, const String& title) {
  oledClear();

  // Header
  oled.setTextSize(1); oled.setCursor(0, 0);
  String t = title.length() > 20 ? title.substring(0, 20) : title;
  oled.println(t.length() ? t : "Attendance");
  oled.drawLine(0, 10, OLED_W, 10, SSD1306_WHITE);

  // Large centred code
  oled.setTextSize(3);
  int16_t x1, y1; uint16_t w, h;
  oled.getTextBounds(code.c_str(), 0, 0, &x1, &y1, &w, &h);
  oled.setCursor((OLED_W - w) / 2, 15);
  oled.print(code);

  // Countdown progress bar at bottom
  int barFilled = map(secsLeft, 0, WINDOW_SECONDS, 0, OLED_W - 4);
  barFilled = constrain(barFilled, 0, OLED_W - 4);
  oled.drawRect(2, OLED_H - 9, OLED_W - 4, 7, SSD1306_WHITE);
  if (barFilled > 0) oled.fillRect(2, OLED_H - 9, barFilled, 7, SSD1306_WHITE);

  // Seconds remaining (small, bottom-right)
  oled.setTextSize(1);
  char secs[8]; snprintf(secs, sizeof(secs), "%lus", (unsigned long)secsLeft);
  oled.setCursor(OLED_W - 6 * strlen(secs) - 2, OLED_H - 9);
  oled.print(secs);

  oled.display();
}

// ═══════════════════════════════════════════════════════════════════════════
//  NVS — load / save
// ═══════════════════════════════════════════════════════════════════════════
static String macSuffix() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[7]; snprintf(buf, sizeof(buf), "%06X", (uint32_t)(mac & 0xFFFFFF));
  return String(buf);
}

void loadConfig() {
  prefs.begin(NVS_NAMESPACE, true);
  cfgSsid     = prefs.getString("ssid", "");
  cfgPass     = prefs.getString("pass", "");
  cfgJwt      = prefs.getString("jwt",  "");
  cfgApi      = prefs.getString("api",  DEFAULT_API_BASE);
  cfgInst     = prefs.getString("inst", "");
  cfgDeviceId = prefs.getString("did",  "");
  prefs.end();
  if (cfgDeviceId.isEmpty()) cfgDeviceId = "esp32-" + macSuffix();
}

void saveConfig() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString("ssid", cfgSsid);
  prefs.putString("pass", cfgPass);
  prefs.putString("jwt",  cfgJwt);
  prefs.putString("api",  cfgApi);
  prefs.putString("inst", cfgInst);
  prefs.putString("did",  cfgDeviceId);
  prefs.end();
}

void factoryReset() {
  Serial.println("[DIKLY] Factory reset — clearing NVS");
  prefs.begin(NVS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
  ESP.restart();
}

// ═══════════════════════════════════════════════════════════════════════════
//  HMAC-SHA256 rotating code
//  Mirrors src/services/attendanceCodeService.js exactly.
// ═══════════════════════════════════════════════════════════════════════════
String deriveCode(const String& seed, uint32_t unixSec) {
  uint32_t slot = unixSec / WINDOW_SECONDS;
  String   slotStr = String((unsigned long)slot);

  uint8_t digest[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1 /* HMAC */);
  mbedtls_md_hmac_starts(&ctx,
    reinterpret_cast<const uint8_t*>(seed.c_str()), seed.length());
  mbedtls_md_hmac_update(&ctx,
    reinterpret_cast<const uint8_t*>(slotStr.c_str()), slotStr.length());
  mbedtls_md_hmac_finish(&ctx, digest);
  mbedtls_md_free(&ctx);

  uint32_t n = ((uint32_t)digest[0] << 24) | ((uint32_t)digest[1] << 16)
             | ((uint32_t)digest[2] <<  8) |  (uint32_t)digest[3];
  n %= 1000000UL;

  char buf[7]; snprintf(buf, sizeof(buf), "%06lu", (unsigned long)n);
  return String(buf);
}

// ═══════════════════════════════════════════════════════════════════════════
//  HTTP helper — authenticated POST JSON to DIKLY server
// ═══════════════════════════════════════════════════════════════════════════
int postJson(const String& path, const String& body,
             String& respOut, bool authed = true) {
  WiFiClientSecure client;
  client.setInsecure();  // Skip cert pinning; school WiFi + private deployment
  HTTPClient http;
  if (!http.begin(client, cfgApi + path)) return -1;
  http.addHeader("Content-Type", "application/json");
  if (authed && cfgJwt.length())
    http.addHeader("Authorization", "Bearer " + cfgJwt);
  http.setTimeout(15000);
  int code = http.POST(body);
  respOut  = http.getString();
  http.end();
  return code;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PAIRING — ESP32 → /api/devices/pair
// ═══════════════════════════════════════════════════════════════════════════
bool tryPair(const String& pairingCode, const String& inst) {
  StaticJsonDocument<256> req;
  req["pairingCode"]     = pairingCode;
  req["deviceId"]        = cfgDeviceId;
  req["deviceName"]      = "DIKLY-TE066-" + macSuffix();
  req["institutionCode"] = inst;
  String body; serializeJson(req, body);

  String resp;
  int code = postJson("/api/devices/pair", body, resp, false);
  Serial.printf("[Pair] POST %d\n", code);
  if (code != 200 && code != 201) {
    Serial.println("[Pair] Failed: " + resp);
    return false;
  }

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, resp)) return false;
  if (!doc["token"].is<const char*>()) return false;

  cfgJwt  = doc["token"].as<String>();
  cfgInst = inst;
  saveConfig();
  Serial.println("[Pair] Paired — JWT saved");
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HEARTBEAT — POST /api/devices/heartbeat every 5 s
// ═══════════════════════════════════════════════════════════════════════════
void sendHeartbeat() {
  StaticJsonDocument<256> req;
  req["currentNetwork"]  = cfgSsid;
  req["mode"]            = "station";
  req["localIp"]         = WiFi.localIP().toString();
  req["rtcValid"]        = timeSynced;
  req["sdOK"]            = sdOk;
  req["firmwareVersion"] = FIRMWARE_VER;
  String body; serializeJson(req, body);

  String resp;
  int code = postJson("/api/devices/heartbeat", body, resp);

  if (code == 401) {
    Serial.println("[HB] 401 — JWT revoked, factory reset");
    ledRed(); beepError();
    delay(1000);
    factoryReset();
    return;
  }
  if (code != 200) {
    Serial.printf("[HB] Fail %d\n", code);
    if (++hbFailCount >= 6) {
      hbFailCount = 0;
      Serial.println("[HB] Too many failures — rebooting");
      ESP.restart();
    }
    return;
  }
  hbFailCount = 0;

  StaticJsonDocument<768> doc;
  if (deserializeJson(doc, resp)) { Serial.println("[HB] Parse fail"); return; }

  // Use server time as fallback if NTP failed
  if (!timeSynced && doc["serverTime"].is<const char*>()) {
    struct tm tm = {};
    const char* iso = doc["serverTime"];
    if (strptime(iso, "%Y-%m-%dT%H:%M:%S", &tm)) {
      time_t t = mktime(&tm);
      struct timeval tv = { t, 0 };
      settimeofday(&tv, nullptr);
      timeSynced = true;
      Serial.println("[HB] Clock set from serverTime");
    }
  }

  JsonVariantConst sess = doc["activeSession"];
  if (sess.isNull()) {
    if (sessId.length()) {
      Serial.println("[HB] Session ended");
      sessId = ""; sessSeed = ""; sessTitle = "";
      sessStartedAt = 0;
      ledBlue();
    }
  } else {
    bool newSession = (sessId != sess["sessionId"].as<String>());
    sessId       = sess["sessionId"].as<String>();
    sessTitle    = sess["title"]    | "Attendance";
    sessSeed     = sess["esp32Seed"].as<String>();
    sessDuration = sess["durationSeconds"] | 300;

    if (sess["startedAt"].is<const char*>()) {
      struct tm tm = {};
      if (strptime(sess["startedAt"].as<const char*>(), "%Y-%m-%dT%H:%M:%S", &tm))
        sessStartedAt = (uint32_t)mktime(&tm);
    }
    if (newSession) {
      Serial.println("[HB] Session started: " + sessId);
      ledGreen();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCREEN RENDER — called ~4×/s
// ═══════════════════════════════════════════════════════════════════════════
void renderScreen() {
  if (WiFi.status() != WL_CONNECTED) {
    oledMsg("DIKLY", "WiFi lost...", cfgSsid.c_str());
    ledYellow();
    return;
  }
  if (!timeSynced) {
    oledMsg("DIKLY", "Syncing time...");
    return;
  }
  if (sessId.isEmpty() || sessSeed.isEmpty()) {
    oledReady(WiFi.localIP().toString().c_str());
    ledBlue();
    return;
  }

  time_t now = time(nullptr);

  // Auto-clear when the session window has closed
  if (sessStartedAt && (uint32_t)now > sessStartedAt + sessDuration + 60) {
    oledMsg("Session closed", "Waiting for", "next session...");
    ledBlue();
    return;
  }

  uint32_t secsLeft = WINDOW_SECONDS - ((uint32_t)now % WINDOW_SECONDS);
  String code = deriveCode(sessSeed, (uint32_t)now);
  oledShowCode(code, secsLeft, sessTitle);

  // Flash yellow in last 10 s before rotation so students know to hurry
  ledSet(secsLeft <= 10 ? CRGB(200, 100, 0) : CRGB(0, 160, 0));
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAPTIVE PORTAL — AP mode pairing UI
// ═══════════════════════════════════════════════════════════════════════════
static const char PAIR_HTML[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DIKLY Device Setup</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;
       margin:0;padding:20px;max-width:420px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px;color:#818cf8}
  .sub{font-size:12px;color:#94a3b8;margin:0 0 20px}
  label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;
        letter-spacing:.5px;color:#94a3b8;margin:12px 0 4px}
  input{width:100%;padding:10px 12px;border-radius:8px;
        border:1.5px solid #334155;background:#1e293b;color:#f1f5f9;font-size:14px}
  input:focus{outline:none;border-color:#6366f1}
  .row{display:flex;gap:8px}
  .row input{flex:1}
  .scan-btn{flex-shrink:0;padding:10px 14px;border-radius:8px;
            border:1.5px solid #6366f1;background:transparent;
            color:#818cf8;font-size:13px;font-weight:700;cursor:pointer}
  .scan-btn:disabled{opacity:.4;cursor:default}
  .nets{margin:6px 0;border:1px solid #1e293b;border-radius:8px;
        overflow:hidden;max-height:180px;overflow-y:auto;display:none}
  .net{padding:10px 14px;cursor:pointer;font-size:13px;
       display:flex;justify-content:space-between;border-bottom:1px solid #1e293b}
  .net:last-child{border-bottom:0}
  .net:hover,.net.sel{background:#1e3a5f}
  .meta{font-size:11px;color:#64748b}
  button[type=submit]{width:100%;padding:12px;border-radius:8px;border:0;
                       background:#6366f1;color:#fff;font-weight:700;
                       font-size:14px;margin-top:20px;cursor:pointer}
  button[type=submit]:disabled{opacity:.5;cursor:default}
  .ok{color:#4ade80;font-size:13px;margin-top:10px;padding:10px;
      background:#022c22;border-radius:8px}
  .err{color:#f87171;font-size:13px;margin-top:10px;padding:10px;
       background:#450a0a;border-radius:8px}
</style></head><body>
<h1>DIKLY Device Setup</h1>
<p class="sub">Connect this device to your school WiFi and pair it with the lecturer portal.</p>
<form id="f">
  <label>Institution Code</label>
  <input id="ic" name="institutionCode" required placeholder="e.g. UNIV01"
         autocomplete="off" style="text-transform:uppercase">

  <label>Pairing Code
    <span style="color:#64748b;font-weight:400">(Lecturer Portal → Attendance Device → Generate Code)</span>
  </label>
  <input id="pc" name="pairingCode" required maxlength="6" placeholder="6 characters"
         autocomplete="off" style="text-transform:uppercase;letter-spacing:4px;
         font-size:20px;text-align:center">

  <label>WiFi Network</label>
  <div class="row">
    <input id="ssid" name="ssid" required placeholder="Select or type SSID" autocomplete="off">
    <button type="button" class="scan-btn" id="sb" onclick="doScan()">Scan</button>
  </div>
  <div id="nets" class="nets"></div>

  <label>WiFi Password</label>
  <input name="password" type="password" autocomplete="new-password"
         placeholder="Leave blank for open networks">

  <label>Server URL <span style="color:#64748b;font-weight:400">(advanced)</span></label>
  <input name="apiBase" value="https://dikly.sbs">

  <button type="submit" id="btn">Pair & Connect</button>
</form>
<div id="msg"></div>
<script>
async function doScan(){
  const sb=document.getElementById('sb'),nl=document.getElementById('nets');
  sb.disabled=true;sb.textContent='...';
  nl.style.display='block';
  nl.innerHTML='<div style="padding:10px 14px;font-size:12px;color:#64748b">Scanning…</div>';
  try{
    const nets=await(await fetch('/wifi/scan')).json();
    if(!nets.length){nl.innerHTML='<div style="padding:10px 14px;font-size:12px;color:#64748b">No networks found.</div>';return;}
    nets.sort((a,b)=>(b.rssi||0)-(a.rssi||0));
    nl.innerHTML=nets.map(n=>{
      const bars=n.rssi>-60?'▂▄▆':n.rssi>-75?'▂▄':'▂';
      const lock=n.open===false?'🔒 ':'';
      return `<div class="net" onclick="pick(this,'${(n.ssid||'').replace(/'/g,"\\'")}')">
        <span>${n.ssid||'(Hidden)'}</span><span class="meta">${lock}${bars} ${n.rssi}dBm</span></div>`;
    }).join('');
  }catch(e){nl.innerHTML=`<div style="padding:10px 14px;font-size:12px;color:#ef4444">Scan error: ${e.message}</div>`;}
  finally{sb.disabled=false;sb.textContent='Scan';}
}
function pick(el,ssid){
  document.getElementById('ssid').value=ssid;
  document.querySelectorAll('.net').forEach(n=>n.classList.remove('sel'));
  el.classList.add('sel');
}
document.getElementById('f').onsubmit=async(e)=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.target));
  d.institutionCode=d.institutionCode.toUpperCase().trim();
  d.pairingCode=d.pairingCode.toUpperCase().trim();
  const m=document.getElementById('msg'),b=document.getElementById('btn');
  b.disabled=true;m.className='';m.innerHTML='<p style="color:#94a3b8;font-size:13px">Pairing — this can take up to 30 s…</p>';
  try{
    const r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||'Pairing failed');
    m.innerHTML=`<div class="ok">✓ Paired! Device will restart and connect to <strong>${d.ssid}</strong>. You can close this page.</div>`;
  }catch(err){
    m.innerHTML=`<div class="err">✗ ${err.message}</div>`;
    b.disabled=false;
  }
};
</script></body></html>)HTML";

// ═══════════════════════════════════════════════════════════════════════════
//  AP PORTAL — blocks until paired (then ESP.restart() from /pair handler)
// ═══════════════════════════════════════════════════════════════════════════
void startApPortal() {
  String apSSID = "DIKLY-" + macSuffix();
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSSID.c_str());
  delay(200);
  IPAddress apIP = WiFi.softAPIP();
  Serial.println("[AP] SSID: " + apSSID + "  IP: " + apIP.toString());

  ledPurple();
  oledPairScreen(apSSID.c_str());

  dns.start(53, "*", apIP);  // Captive portal redirect

  // Serve the setup page for all routes
  auto sendPage = []() { httpServer.send_P(200, "text/html", PAIR_HTML); };
  httpServer.on("/",                       HTTP_GET,  sendPage);
  httpServer.on("/generate_204",           HTTP_GET,  sendPage);
  httpServer.on("/hotspot-detect.html",    HTTP_GET,  sendPage);
  httpServer.on("/ncsi.txt",               HTTP_GET,  sendPage);
  httpServer.onNotFound(sendPage);

  // WiFi scan (called by setup page before pairing)
  httpServer.on("/wifi/scan", HTTP_GET, []() {
    int n = WiFi.scanNetworks();
    StaticJsonDocument<2048> doc;
    JsonArray arr = doc.to<JsonArray>();
    for (int i = 0; i < n && i < 24; i++) {
      JsonObject o = arr.createNestedObject();
      o["ssid"] = WiFi.SSID(i);
      o["rssi"] = WiFi.RSSI(i);
      o["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
    }
    String s; serializeJson(doc, s);
    httpServer.send(200, "application/json", s);
  });

  // Pairing handler — runs in AP+STA so we can reach DIKLY over the school WiFi
  httpServer.on("/pair", HTTP_POST, []() {
    StaticJsonDocument<384> req;
    if (deserializeJson(req, httpServer.arg("plain"))) {
      httpServer.send(400, "application/json", "{\"error\":\"Bad JSON\"}");
      return;
    }
    String inst  = req["institutionCode"] | "";
    String pcode = req["pairingCode"]     | "";
    String ssid  = req["ssid"]            | "";
    String pass  = req["password"]        | "";
    String api   = req["apiBase"]         | DEFAULT_API_BASE;
    inst.toUpperCase(); pcode.toUpperCase();

    if (inst.length() < 3 || pcode.length() < 4 || ssid.isEmpty()) {
      httpServer.send(400, "application/json",
        "{\"error\":\"institutionCode, pairingCode, and ssid are required.\"}");
      return;
    }

    // Switch to AP+STA so the captive portal stays alive while we connect
    cfgApi  = api;
    cfgSsid = ssid;
    cfgPass = pass;
    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());

    oledMsg("Connecting...", ssid.c_str());
    ledYellow();

    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT) {
      httpServer.handleClient();
      delay(100);
    }
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.mode(WIFI_AP);
      oledPairScreen(("DIKLY-" + macSuffix()).c_str());
      ledPurple(); beepError();
      httpServer.send(502, "application/json",
        "{\"error\":\"Could not connect to WiFi — check SSID and password.\"}");
      return;
    }

    // NTP sync needed for TLS certificate validation
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    uint32_t t1 = millis();
    while (time(nullptr) < 1000000000UL && millis() - t1 < NTP_TIMEOUT)
      { httpServer.handleClient(); delay(100); }

    oledMsg("Pairing...", pcode.c_str());
    if (!tryPair(pcode, inst)) {
      WiFi.disconnect(); WiFi.mode(WIFI_AP);
      oledPairScreen(("DIKLY-" + macSuffix()).c_str());
      ledPurple(); beepError();
      httpServer.send(401, "application/json",
        "{\"error\":\"Pairing rejected — code may have expired. Generate a new one.\"}");
      return;
    }

    // Paired — send OK and restart
    httpServer.send(200, "application/json", "{\"ok\":true}");
    beepOk(); ledGreen();
    delay(1500);
    ESP.restart();
  });

  httpServer.begin();

  // Block here — loop() won't run the main code while in AP mode
  while (cfgJwt.isEmpty()) {
    dns.processNextRequest();
    httpServer.handleClient();
    delay(5);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOCAL HTTP SERVER — used by the DIKLY web portal WiFi proxy endpoints
//  GET  /status          → device info JSON
//  GET  /wifi/scan       → nearby networks JSON
//  POST /wifi/configure  → save new WiFi creds + reboot
// ═══════════════════════════════════════════════════════════════════════════
void registerLocalApi() {
  httpServer.on("/status", HTTP_GET, []() {
    StaticJsonDocument<256> doc;
    doc["deviceId"]        = cfgDeviceId;
    doc["firmware"]        = FIRMWARE_VER;
    doc["ssid"]            = cfgSsid;
    doc["ip"]              = WiFi.localIP().toString();
    doc["sessionActive"]   = !sessId.isEmpty();
    doc["sdOk"]            = sdOk;
    doc["timeSynced"]      = timeSynced;
    String s; serializeJson(doc, s);
    httpServer.send(200, "application/json", s);
  });

  httpServer.on("/wifi/scan", HTTP_GET, []() {
    int n = WiFi.scanNetworks();
    StaticJsonDocument<2048> doc;
    JsonArray nets = doc.createNestedArray("networks");
    for (int i = 0; i < n && i < 24; i++) {
      JsonObject o = nets.createNestedObject();
      o["ssid"] = WiFi.SSID(i);
      o["rssi"] = WiFi.RSSI(i);
      o["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
    }
    String s; serializeJson(doc, s);
    httpServer.send(200, "application/json", s);
  });

  httpServer.on("/wifi/configure", HTTP_POST, []() {
    StaticJsonDocument<256> req;
    if (deserializeJson(req, httpServer.arg("plain"))) {
      httpServer.send(400, "application/json",
        "{\"status\":\"failed\",\"message\":\"Bad JSON\"}");
      return;
    }
    String ssid = req["ssid"]     | "";
    String pass = req["password"] | "";
    if (ssid.isEmpty()) {
      httpServer.send(400, "application/json",
        "{\"status\":\"failed\",\"message\":\"ssid required\"}");
      return;
    }
    cfgSsid = ssid; cfgPass = pass;
    saveConfig();
    httpServer.send(200, "application/json",
      "{\"status\":\"saved\",\"message\":\"Reconnecting…\"}");
    delay(400);
    ESP.restart();
  });

  // /proof?studentId=<id> — generates a one-time signed attendance proof.
  // Unique random nonce per call; 15-second expiry; replay prevented by server.
  httpServer.on("/proof", HTTP_GET, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    if (sessId.isEmpty() || sessSeed.isEmpty()) {
      httpServer.send(503, "application/json", "{\"error\":\"No active session\"}"); return;
    }
    if (!timeSynced) {
      httpServer.send(503, "application/json", "{\"error\":\"Clock not synced\"}"); return;
    }
    String userId = httpServer.arg("studentId");
    if (userId.isEmpty()) {
      httpServer.send(400, "application/json", "{\"error\":\"studentId required\"}"); return;
    }
    uint8_t nb[8];
    for (int i = 0; i < 8; i++) nb[i] = (uint8_t)(esp_random() & 0xFF);
    char nonce[17];
    for (int i = 0; i < 8; i++) snprintf(nonce + i * 2, 3, "%02x", nb[i]);
    nonce[16] = '\0';
    uint32_t ts = (uint32_t)time(nullptr);
    String msg = "proof:" + sessId + ":" + userId + ":" + String(ts) + ":" + String(nonce);
    uint8_t digest[32];
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_context_t ctx; mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, info, 1);
    mbedtls_md_hmac_starts(&ctx, reinterpret_cast<const uint8_t*>(sessSeed.c_str()), sessSeed.length());
    mbedtls_md_hmac_update(&ctx, reinterpret_cast<const uint8_t*>(msg.c_str()), msg.length());
    mbedtls_md_hmac_finish(&ctx, digest);
    mbedtls_md_free(&ctx);
    char sig[33];
    for (int i = 0; i < 16; i++) snprintf(sig + i * 2, 3, "%02x", digest[i]);
    sig[32] = '\0';
    StaticJsonDocument<512> resp;
    resp["sessionId"] = sessId;
    resp["studentId"] = userId;
    resp["timestamp"] = (long long)ts;
    resp["nonce"]     = nonce;
    resp["sig"]       = sig;
    String s; serializeJson(resp, s);
    httpServer.send(200, "application/json", s);
  });

  // /session?studentId=<id> — returns HMAC connectionToken proving classroom WiFi
  httpServer.on("/session", HTTP_GET, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    if (sessId.isEmpty() || sessSeed.isEmpty()) {
      httpServer.send(503, "application/json", "{\"error\":\"No active session\"}"); return;
    }
    if (!timeSynced) {
      httpServer.send(503, "application/json", "{\"error\":\"Clock not synced\"}"); return;
    }
    String userId = httpServer.arg("studentId");
    if (userId.isEmpty()) {
      httpServer.send(400, "application/json", "{\"error\":\"studentId required\"}"); return;
    }
    uint32_t issuedAt = (uint32_t)time(nullptr);
    String msg = "conn:" + sessId + ":" + userId + ":" + String(issuedAt);
    uint8_t digest[32];
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_context_t ctx; mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, info, 1);
    mbedtls_md_hmac_starts(&ctx, reinterpret_cast<const uint8_t*>(sessSeed.c_str()), sessSeed.length());
    mbedtls_md_hmac_update(&ctx, reinterpret_cast<const uint8_t*>(msg.c_str()), msg.length());
    mbedtls_md_hmac_finish(&ctx, digest);
    mbedtls_md_free(&ctx);
    char sig[33];
    for (int i = 0; i < 16; i++) snprintf(sig + i * 2, 3, "%02x", digest[i]);
    sig[32] = '\0';
    StaticJsonDocument<512> resp;
    resp["sessionId"] = sessId;
    resp["studentId"] = userId;
    resp["issuedAt"]  = (long long)issuedAt;
    resp["sig"]       = sig;
    String s; serializeJson(resp, s);
    httpServer.send(200, "application/json", s);
  });

  // /mark?studentId=<id> — browser redirect flow: generates connectionToken and
  // redirects to https://dikly.sbs/?esp32session=...#mark-attendance
  httpServer.on("/mark", HTTP_GET, []() {
    if (sessId.isEmpty() || sessSeed.isEmpty()) {
      httpServer.send(503, "text/html",
        "<!doctype html><html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;padding:24px'>"
        "<h2>No active session</h2><p>Ask your lecturer to start a session, then try again.</p></body></html>");
      return;
    }
    String userId = httpServer.arg("studentId");
    if (userId.isEmpty()) {
      httpServer.send(400, "text/html",
        "<!doctype html><html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;padding:24px'>"
        "<h2>Open DIKLY first</h2><p>Go to Mark Attendance, then tap 'Verify WiFi Connection'.</p></body></html>");
      return;
    }
    if (!timeSynced) {
      httpServer.send(503, "text/html",
        "<!doctype html><html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;padding:24px'>"
        "<h2>Clock not synced</h2><p>Please wait a moment and try again.</p></body></html>");
      return;
    }
    uint32_t issuedAt = (uint32_t)time(nullptr);
    String msg = "conn:" + sessId + ":" + userId + ":" + String(issuedAt);
    uint8_t digest[32];
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_context_t ctx; mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, info, 1);
    mbedtls_md_hmac_starts(&ctx, reinterpret_cast<const uint8_t*>(sessSeed.c_str()), sessSeed.length());
    mbedtls_md_hmac_update(&ctx, reinterpret_cast<const uint8_t*>(msg.c_str()), msg.length());
    mbedtls_md_hmac_finish(&ctx, digest);
    mbedtls_md_free(&ctx);
    char sig[33];
    for (int i = 0; i < 16; i++) snprintf(sig + i * 2, 3, "%02x", digest[i]);
    sig[32] = '\0';
    String url = "https://dikly.sbs/?esp32session=" + sessId +
                 "&esp32student=" + userId +
                 "&esp32issued=" + String(issuedAt) +
                 "&esp32sig=" + String(sig) +
                 "#mark-attendance";
    String html = String("<!doctype html><html><head><meta charset='utf-8'>") +
      "<meta http-equiv='refresh' content='0;url=" + url + "'>" +
      "<script>window.location.replace('" + url + "')</script>" +
      "</head><body style='font-family:sans-serif;padding:24px'><p>Verifying classroom connection... redirecting to DIKLY.</p></body></html>";
    httpServer.send(200, "text/html", html);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  Serial.printf("\n\n[DIKLY] TE066 Firmware %s\n", FIRMWARE_VER);

  // FastLED — WS2812B on PIN_LED
  FastLED.addLeds<WS2812B, PIN_LED, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(60);
  ledYellow();

  // Speaker
  pinMode(PIN_SPEAKER, OUTPUT);

  // I2C on TE066 pins
  Wire.begin(PIN_SDA, PIN_SCL);

  // OLED
  if (oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(20, 20); oled.println("DIKLY TE066");
    oled.setCursor(20, 34); oled.println(FIRMWARE_VER);
    oled.display();
  } else {
    Serial.println("[DIKLY] OLED not found — continuing headless");
  }

  // SD card
  if (SD.begin(PIN_SD_CS)) {
    sdOk = true;
    Serial.println("[SD] OK");
  } else {
    Serial.println("[SD] Not found or failed");
  }

  // Load NVS config
  loadConfig();
  Serial.println("[NVS] deviceId: " + cfgDeviceId);

  // Boot chime
  beepBoot();
  delay(300);

  // No JWT or no WiFi creds → run setup portal
  if (cfgJwt.isEmpty() || cfgSsid.isEmpty()) {
    Serial.println("[Setup] Unpaired — starting AP portal");
    startApPortal();
    return;
  }

  // ── Normal boot ─────────────────────────────────────────────────────────
  oledConnecting(cfgSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());

  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT) {
    leds[0] = (millis() / 300 % 2) ? CRGB::Black : CRGB(0, 0, 80);
    FastLED.show();
    delay(100);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Failed — starting AP for reconfiguration");
    beepError();
    oledMsg("WiFi failed!", cfgSsid.c_str(), "Starting setup...");
    delay(2000);
    startApPortal();
    return;
  }

  ledGreen();
  beepOk();
  Serial.println("[WiFi] Connected: " + WiFi.localIP().toString());

  // NTP
  oledMsg("Syncing time...");
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  uint32_t t1 = millis();
  while (time(nullptr) < 1000000000UL && millis() - t1 < NTP_TIMEOUT) delay(200);
  timeSynced = (time(nullptr) > 1000000000UL);
  Serial.printf("[NTP] synced=%d  time=%lu\n", (int)timeSynced, (unsigned long)time(nullptr));

  // Register local API then first heartbeat
  registerLocalApi();
  httpServer.begin();
  oledMsg("DIKLY Ready", WiFi.localIP().toString().c_str());
  sendHeartbeat();
  lastHbMs = millis();
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════════════════
void loop() {
  dns.processNextRequest();
  httpServer.handleClient();

  // If still in AP-only pairing mode, just service the portal
  if (cfgJwt.isEmpty()) { delay(10); return; }

  // WiFi watchdog
  if (WiFi.status() != WL_CONNECTED) {
    static uint32_t lastReconnMs = 0;
    if (millis() - lastReconnMs > 10000) {
      lastReconnMs = millis();
      Serial.println("[WiFi] Lost — reconnecting");
      ledYellow();
      oledMsg("WiFi lost...", "Reconnecting", cfgSsid.c_str());
      WiFi.disconnect(false);
      delay(300);
      WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
    }
    delay(200);
    return;
  }

  // Heartbeat every HEARTBEAT_INTERVAL ms
  if (millis() - lastHbMs >= HEARTBEAT_INTERVAL) {
    lastHbMs = millis();
    sendHeartbeat();
  }

  // Redraw ~4×/s
  static uint32_t lastDraw = 0;
  if (millis() - lastDraw >= 250) {
    lastDraw = millis();
    renderScreen();
  }

  delay(10);
}
