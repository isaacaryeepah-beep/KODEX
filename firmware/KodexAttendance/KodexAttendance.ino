/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KODEX Attendance — ESP32 Classroom Device firmware
 *  Target board: ESP32 DevKitC (or any ESP32 with WiFi + I2C)
 *  Companion: Adafruit SSD1306 128x64 OLED on I2C (SDA=21, SCL=22, addr 0x3C)
 *
 *  WHAT THIS DEVICE DOES
 *  ─────────────────────
 *   • On first boot, runs a captive-portal AP "KODEX-XXXXXX". The lecturer
 *     connects, enters their institution code, the 6-char pairing code from
 *     the web portal, and the school WiFi SSID/password.
 *   • Calls POST /api/devices/pair → receives a long-lived device JWT.
 *     Saves token + WiFi creds in NVS.
 *   • From then on: connects to school WiFi and sends heartbeats every 5 s
 *     to POST /api/devices/heartbeat with `Authorization: Bearer <token>`.
 *   • Heartbeat response carries the active AttendanceSession (if any).
 *     The ESP32 derives the rotating 6-digit code locally from the session
 *     seed using the SAME HMAC formula as the backend, and shows it on the
 *     OLED. No round-trip per code rotation; the device and server stay in
 *     sync because both run from the same UNIX time slot.
 *   • Hosts a small HTTP server at port 80 with /status, /wifi/scan and
 *     /wifi/configure so the web "Attendance Device" page can proxy WiFi
 *     reconfiguration when needed.
 *
 *  CODE ROTATION FORMULA (must match src/services/attendanceCodeService.js)
 *  ───────────────────────────────────────────────────────────────────────
 *     slot = floor(unixSeconds / 20)
 *     digest = HMAC-SHA256(seed, ascii(slot))
 *     n = uint32(digest[0..3]) % 1_000_000
 *     code = zero-pad-left(n, 6)
 *
 *  REQUIRED LIBRARIES (Arduino IDE → Library Manager)
 *   • Adafruit GFX Library            — graphics primitives
 *   • Adafruit SSD1306                — OLED driver
 *   • ArduinoJson  (≥7.0)             — JSON parse / build
 *  Built-in to the ESP32 board package: WiFi, WebServer, HTTPClient, mbedtls.
 *
 *  WIRING
 *   • OLED VCC  → 3V3      OLED GND  → GND
 *   • OLED SDA  → GPIO 21  OLED SCL  → GPIO 22
 *   • Status LED → GPIO 2 (most DevKits have this on-board)
 *
 *  BUILD
 *   • Board: "ESP32 Dev Module"   PSRAM: Disabled    Flash: 4MB (32Mb)
 *   • Partition Scheme: "Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)"
 *   • Upload Speed: 921600
 *
 *  NOTES
 *   • API_BASE defaults to https://kodex.it.com but can be overridden at
 *     pairing time by sending the institutionApiBase parameter from the
 *     captive portal (advanced users only).
 *   • All sensitive material (device JWT, WiFi password) lives in NVS under
 *     namespace "kodex". `factoryReset()` wipes it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ─── Configuration ───────────────────────────────────────────────────────────
static const char* FIRMWARE_VERSION = "kodex-1.0.0";
static const char* DEFAULT_API_BASE = "https://kodex.it.com";
static const uint32_t HEARTBEAT_INTERVAL_MS = 5000;
static const uint32_t WIFI_RETRY_TIMEOUT_MS = 30000;
static const uint8_t  STATUS_LED_PIN = 2;
static const uint8_t  OLED_ADDR = 0x3C;
static const uint8_t  OLED_W = 128;
static const uint8_t  OLED_H = 64;
static const uint8_t  OLED_RESET_PIN = -1;

// Code rotation formula constants (must mirror backend).
static const uint32_t WINDOW_SECONDS = 20;

// ─── Globals ─────────────────────────────────────────────────────────────────
Adafruit_SSD1306 oled(OLED_W, OLED_H, &Wire, OLED_RESET_PIN);
Preferences      prefs;
WebServer        localHttp(80);
DNSServer        dns;

String wifiSSID;
String wifiPass;
String deviceId;
String deviceJWT;
String apiBase;
String institutionCode;
String pairingCodeBuffer;       // captured during AP pairing flow

// Active session state (received in heartbeat response)
String  sessionId;
String  sessionTitle;
String  sessionSeed;
uint32_t sessionStartedAt = 0;     // unix seconds
uint32_t sessionDuration  = 300;   // seconds

uint32_t lastHeartbeatMs = 0;
bool     timeSynced = false;
uint8_t  hbFailCount = 0;
bool     wifiReconnectNeeded = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────
static void log(const String& s) { Serial.print("[KODEX] "); Serial.println(s); }

static String getMacSuffix() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[7];
  snprintf(buf, sizeof(buf), "%06X", (uint32_t)(mac & 0xFFFFFF));
  return String(buf);
}

// HMAC-SHA256 using mbedtls. Produces 32 bytes.
static void hmacSha256(const uint8_t* key, size_t keyLen,
                       const uint8_t* msg, size_t msgLen,
                       uint8_t out[32]) {
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1 /* HMAC */);
  mbedtls_md_hmac_starts(&ctx, key, keyLen);
  mbedtls_md_hmac_update(&ctx, msg, msgLen);
  mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);
}

// Derive the rotating 6-digit code for the given seed at the given unix time.
// Mirrors src/services/attendanceCodeService.js exactly.
static String deriveCode(const String& seed, uint32_t unixSec) {
  uint32_t slot = unixSec / WINDOW_SECONDS;
  String slotStr = String((unsigned long)slot);
  uint8_t digest[32];
  hmacSha256(reinterpret_cast<const uint8_t*>(seed.c_str()), seed.length(),
             reinterpret_cast<const uint8_t*>(slotStr.c_str()), slotStr.length(),
             digest);
  uint32_t n = ((uint32_t)digest[0] << 24) |
               ((uint32_t)digest[1] << 16) |
               ((uint32_t)digest[2] <<  8) |
               ((uint32_t)digest[3]);
  uint32_t code = n % 1000000UL;
  char buf[8];
  snprintf(buf, sizeof(buf), "%06lu", (unsigned long)code);
  return String(buf);
}

// ─── OLED rendering ──────────────────────────────────────────────────────────
static void oledShow(const String& l1, const String& l2 = "", const String& l3 = "") {
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.setTextSize(1);
  oled.println(l1);
  if (l2.length()) { oled.setCursor(0, 18); oled.setTextSize(1); oled.println(l2); }
  if (l3.length()) { oled.setCursor(0, 30); oled.setTextSize(1); oled.println(l3); }
  oled.display();
}

static void oledShowCode(const String& code, uint32_t secsLeft, const String& title) {
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  // Title
  oled.setCursor(0, 0);
  oled.setTextSize(1);
  oled.println(title.length() ? title : "Attendance");
  // Big code centered
  oled.setTextSize(3);
  int16_t x1, y1; uint16_t w, h;
  oled.getTextBounds(code.c_str(), 0, 0, &x1, &y1, &w, &h);
  int16_t cx = (OLED_W - w) / 2;
  oled.setCursor(cx, 22);
  oled.println(code);
  // Countdown bar
  int barW = (OLED_W - 4) * secsLeft / WINDOW_SECONDS;
  oled.drawRect(2, OLED_H - 8, OLED_W - 4, 6, SSD1306_WHITE);
  oled.fillRect(2, OLED_H - 8, barW, 6, SSD1306_WHITE);
  oled.display();
}

// ─── NVS load/save ───────────────────────────────────────────────────────────
static void loadConfig() {
  prefs.begin("kodex", true);
  wifiSSID         = prefs.getString("ssid", "");
  wifiPass         = prefs.getString("pass", "");
  deviceId         = prefs.getString("did",  "");
  deviceJWT        = prefs.getString("jwt",  "");
  apiBase          = prefs.getString("api",  DEFAULT_API_BASE);
  institutionCode  = prefs.getString("inst", "");
  prefs.end();
  if (deviceId.length() == 0) deviceId = "esp32-" + getMacSuffix();
}

static void saveConfig() {
  prefs.begin("kodex", false);
  prefs.putString("ssid", wifiSSID);
  prefs.putString("pass", wifiPass);
  prefs.putString("did",  deviceId);
  prefs.putString("jwt",  deviceJWT);
  prefs.putString("api",  apiBase);
  prefs.putString("inst", institutionCode);
  prefs.end();
}

static void factoryReset() {
  prefs.begin("kodex", false);
  prefs.clear();
  prefs.end();
  ESP.restart();
}

// ─── HTTP helpers (uses cert-skipping for simplicity; KODEX is HTTPS) ────────
// In production this should pin the server cert. For a private-deployment
// classroom device behind school WiFi the convenience cost is acceptable.
static int postJson(const String& path, const String& body, String& outResponse,
                    bool authed = true) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = apiBase + path;
  if (!http.begin(client, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  if (authed && deviceJWT.length()) {
    http.addHeader("Authorization", "Bearer " + deviceJWT);
  }
  http.setTimeout(20000);
  int code = http.POST(body);
  outResponse = http.getString();
  http.end();
  return code;
}

// ─── Pairing flow (no JWT yet) ───────────────────────────────────────────────
static bool tryPair(const String& pairingCode, const String& inst) {
  StaticJsonDocument<256> req;
  req["pairingCode"]      = pairingCode;
  req["deviceId"]         = deviceId;
  req["deviceName"]       = "KODEX-" + getMacSuffix();
  req["institutionCode"]  = inst;
  String body; serializeJson(req, body);

  String resp;
  int code = postJson("/api/devices/pair", body, resp, /*authed*/false);
  log("Pair POST → " + String(code));
  if (code != 200 && code != 201) { log("Pair failed: " + resp); return false; }

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, resp)) { log("Pair response parse fail"); return false; }
  if (!doc["token"].is<const char*>()) { log("Pair: no token in response"); return false; }
  deviceJWT       = doc["token"].as<String>();
  if (doc["deviceId"].is<const char*>()) deviceId = doc["deviceId"].as<String>();
  institutionCode = inst;
  saveConfig();
  log("Paired ✓ — JWT saved");
  return true;
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────
static void sendHeartbeat() {
  StaticJsonDocument<256> req;
  req["currentNetwork"]    = wifiSSID;
  req["mode"]              = "station";
  req["localIp"]           = WiFi.localIP().toString();
  req["rtcValid"]          = timeSynced;
  req["sdOK"]              = false;          // no SD card in this build
  req["firmwareVersion"]   = FIRMWARE_VERSION;
  String body; serializeJson(req, body);

  String resp;
  int code = postJson("/api/devices/heartbeat", body, resp);
  if (code == 401) { log("HB 401 — token revoked. Wiping config."); factoryReset(); return; }
  if (code != 200) {
    log("HB fail " + String(code));
    if (++hbFailCount >= 5) {
      log("HB fail x5 — forcing WiFi reconnect");
      hbFailCount = 0;
      wifiReconnectNeeded = true;
    }
    return;
  }
  hbFailCount = 0;

  StaticJsonDocument<768> doc;
  if (deserializeJson(doc, resp)) { log("HB parse fail"); return; }

  // serverTime is ISO8601; parse → unix seconds for time sync fallback.
  if (doc["serverTime"].is<const char*>()) {
    struct tm tm = {};
    const char* iso = doc["serverTime"];
    if (strptime(iso, "%Y-%m-%dT%H:%M:%S", &tm)) {
      time_t t = mktime(&tm);
      struct timeval tv = { t, 0 };
      settimeofday(&tv, nullptr);
      timeSynced = true;
    }
  }

  JsonVariantConst sess = doc["activeSession"];
  if (sess.isNull()) {
    if (sessionId.length()) {
      log("Session ended");
      sessionId = ""; sessionSeed = ""; sessionTitle = "";
    }
  } else {
    sessionId        = sess["sessionId"].as<String>();
    sessionTitle     = sess["title"]    | "Attendance";
    sessionSeed      = sess["esp32Seed"].as<String>();
    sessionDuration  = sess["durationSeconds"] | 300;

    // startedAt → unix seconds
    if (sess["startedAt"].is<const char*>()) {
      struct tm tm = {};
      strptime(sess["startedAt"], "%Y-%m-%dT%H:%M:%S", &tm);
      sessionStartedAt = (uint32_t)mktime(&tm);
    }
  }
}

// ─── Display loop ────────────────────────────────────────────────────────────
static void renderScreen() {
  if (WiFi.status() != WL_CONNECTED) {
    oledShow("KODEX", "WiFi: connecting...", wifiSSID);
    return;
  }
  if (!timeSynced) { oledShow("KODEX", "Syncing time..."); return; }

  if (sessionId.length() == 0 || sessionSeed.length() == 0) {
    oledShow("KODEX", "Ready", "Waiting for session");
    return;
  }

  time_t now = time(nullptr);
  uint32_t secsInWindow = (uint32_t)now % WINDOW_SECONDS;
  uint32_t secsLeft     = WINDOW_SECONDS - secsInWindow;
  String code = deriveCode(sessionSeed, (uint32_t)now);
  oledShowCode(code, secsLeft, sessionTitle);

  // Auto-clear if attendance window has expired.
  if (sessionStartedAt && now > (time_t)(sessionStartedAt + sessionDuration)) {
    oledShow("KODEX", "Session window", "closed");
  }
}

// ─── Captive-portal pairing UI ───────────────────────────────────────────────
static const char PAIR_HTML[] PROGMEM = R"HTML(<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KODEX Setup</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;max-width:440px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}
  .sub{font-size:13px;color:#94a3b8;margin:0 0 20px}
  label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin:14px 0 4px}
  input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:14px}
  input:focus{outline:none;border-color:#6366f1}
  .row{display:flex;gap:8px;align-items:flex-end}
  .row input{flex:1}
  .scan-btn{flex-shrink:0;padding:10px 14px;border-radius:8px;border:1px solid #6366f1;background:transparent;color:#6366f1;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
  .scan-btn:disabled{opacity:.4}
  .net-list{margin:8px 0;border:1px solid #1e293b;border-radius:8px;overflow:hidden;max-height:200px;overflow-y:auto}
  .net-item{padding:10px 14px;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b}
  .net-item:last-child{border-bottom:0}
  .net-item:hover,.net-item.sel{background:#1e3a5f}
  .net-meta{font-size:11px;color:#64748b}
  button[type=submit]{width:100%;padding:12px;border-radius:8px;border:0;background:#6366f1;color:#fff;font-weight:700;font-size:14px;margin-top:20px;cursor:pointer}
  button[type=submit]:disabled{opacity:.5}
  .ok{color:#22c55e;font-size:12px;margin-top:8px}
  .err{color:#ef4444;font-size:12px;margin-top:8px}
</style></head>
<body>
  <h1>KODEX Device Setup</h1>
  <p class="sub">Enter your institution code and the 6-character pairing code from the lecturer portal, then select your WiFi network.</p>
  <form id="f">
    <label>Institution Code</label>
    <input id="ic" name="institutionCode" required autocomplete="off" placeholder="e.g. ABCD23" style="text-transform:uppercase">
    <label>Pairing Code <span style="color:#64748b;font-weight:400">(from Lecturer Portal → Attendance Device)</span></label>
    <input id="pc" name="pairingCode" required autocomplete="off" placeholder="6 characters" maxlength="6" style="text-transform:uppercase">
    <label>WiFi Network</label>
    <div class="row">
      <input id="ssid" name="ssid" required autocomplete="off" placeholder="Select or type SSID">
      <button type="button" class="scan-btn" id="sb" onclick="scanNets()">Scan</button>
    </div>
    <div id="nl" class="net-list" style="display:none"></div>
    <label>WiFi Password</label>
    <input name="password" type="password" autocomplete="new-password" placeholder="Leave blank if open network">
    <label>Server <span style="color:#64748b;font-weight:400">(advanced)</span></label>
    <input name="apiBase" value="https://kodex.it.com">
    <button type="submit" id="b">Pair Device</button>
  </form>
  <div id="msg"></div>
<script>
async function scanNets() {
  const sb = document.getElementById('sb'), nl = document.getElementById('nl');
  sb.disabled = true; sb.textContent = '…';
  nl.style.display = 'block'; nl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:#64748b">Scanning…</div>';
  try {
    const r = await fetch('/wifi/scan'); const nets = await r.json();
    if (!nets.length) { nl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:#64748b">No networks found. Try again.</div>'; return; }
    nets.sort((a,b)=>(b.rssi||0)-(a.rssi||0));
    nl.innerHTML = nets.map(n=>{
      const s=n.ssid||''; const bars=n.rssi>-60?'▂▄▆':n.rssi>-75?'▂▄':'▂'; const lock=n.open===false?'🔒 ':'';
      return `<div class="net-item" onclick="pickNet(this,'${s.replace(/'/g,"\\'")}')"><span>${s||'(Hidden)'}</span><span class="net-meta">${lock}${bars}</span></div>`;
    }).join('');
  } catch(e){ nl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:#ef4444">Scan failed: '+e.message+'</div>'; }
  finally { sb.disabled=false; sb.textContent='Scan'; }
}
function pickNet(el, ssid) {
  document.getElementById('ssid').value = ssid;
  document.querySelectorAll('.net-item').forEach(i=>i.classList.remove('sel'));
  el.classList.add('sel');
}
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  data.institutionCode = data.institutionCode.toUpperCase().trim();
  data.pairingCode = data.pairingCode.toUpperCase().trim();
  const m = document.getElementById('msg'), b = document.getElementById('b');
  b.disabled = true; m.className = ''; m.textContent = 'Pairing — this may take 30 s…';
  try {
    const r = await fetch('/pair', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Pairing failed');
    m.className = 'ok'; m.textContent = '✓ Paired! Device is rebooting and will connect to WiFi.';
  } catch(err) { m.className = 'err'; m.textContent = '✗ ' + err.message; b.disabled = false; }
};
</script></body></html>)HTML";

static void startApPortal() {
  WiFi.mode(WIFI_AP);
  String ap = "KODEX-" + getMacSuffix();
  WiFi.softAP(ap.c_str());
  delay(150);
  IPAddress ip = WiFi.softAPIP();
  log("AP up: " + ap + " @ " + ip.toString());
  oledShow("Setup mode", "Join WiFi:", ap);

  dns.start(53, "*", ip);

  localHttp.on("/", HTTP_GET, [](){ localHttp.send_P(200, "text/html", PAIR_HTML); });
  localHttp.on("/generate_204", HTTP_GET, [](){ localHttp.send_P(200, "text/html", PAIR_HTML); });
  localHttp.on("/hotspot-detect.html", HTTP_GET, [](){ localHttp.send_P(200, "text/html", PAIR_HTML); });
  localHttp.onNotFound([](){ localHttp.send_P(200, "text/html", PAIR_HTML); });

  localHttp.on("/pair", HTTP_POST, [](){
    StaticJsonDocument<384> req;
    if (deserializeJson(req, localHttp.arg("plain"))) {
      localHttp.send(400, "application/json", "{\"error\":\"Bad JSON\"}"); return;
    }
    String inst   = req["institutionCode"] | "";
    String pcode  = req["pairingCode"]     | "";
    String ssid   = req["ssid"]            | "";
    String pass   = req["password"]        | "";
    String api    = req["apiBase"]         | DEFAULT_API_BASE;
    inst.toUpperCase(); pcode.toUpperCase();
    if (inst.length() < 4 || pcode.length() < 4 || ssid.length() == 0) {
      localHttp.send(400, "application/json", "{\"error\":\"Missing fields\"}"); return;
    }

    // Keep the AP alive so the browser connection stays open.
    // Switch to AP+STA dual mode to connect to the school WiFi while
    // the captive-portal HTTP server keeps responding.
    apiBase  = api;
    wifiSSID = ssid;
    wifiPass = pass;

    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_RETRY_TIMEOUT_MS) {
      delay(250);
      localHttp.handleClient(); // keep AP responsive during connect wait
    }
    if (WiFi.status() != WL_CONNECTED) {
      // Roll back to pure AP mode so the user can fix their credentials.
      WiFi.mode(WIFI_AP);
      localHttp.send(502, "application/json", "{\"error\":\"WiFi connect failed — check SSID/password\"}");
      return;
    }

    // Sync time — TLS cert validation needs a valid clock.
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    uint32_t tlsWait = millis();
    while (time(nullptr) < 1000000000UL && millis() - tlsWait < 5000) delay(100);

    if (!tryPair(pcode, inst)) {
      localHttp.send(401, "application/json", "{\"error\":\"Pairing rejected — check the code (it expires after 5 minutes)\"}");
      // Restore pure AP so the user can try again with a fresh code.
      WiFi.disconnect();
      WiFi.mode(WIFI_AP);
      return;
    }

    // Success — send response while AP is still up, then reboot into STA mode.
    saveConfig();
    localHttp.send(200, "application/json", "{\"ok\":true}");
    delay(1200); // give the browser time to receive the response
    ESP.restart();
  });

  localHttp.begin();
}

// ─── Local HTTP API (used by the Attendance Device page WiFi proxy) ──────────
static void registerLocalHttp() {
  localHttp.on("/status", HTTP_GET, [](){
    StaticJsonDocument<256> doc;
    doc["deviceId"]        = deviceId;
    doc["firmwareVersion"] = FIRMWARE_VERSION;
    doc["wifiSSID"]        = wifiSSID;
    doc["localIp"]         = WiFi.localIP().toString();
    doc["sessionActive"]   = sessionId.length() > 0;
    String s; serializeJson(doc, s);
    // Echo the device token back as an HTTP header so the captive-portal
    // page on the same WiFi can pick it up as proof-of-proximity.
    localHttp.sendHeader("X-ESP32-Device-Token", deviceJWT.substring(0, 16));
    localHttp.send(200, "application/json", s);
  });

  localHttp.on("/wifi/scan", HTTP_GET, [](){
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
    localHttp.send(200, "application/json", s);
  });

  localHttp.on("/wifi/configure", HTTP_POST, [](){
    StaticJsonDocument<256> req;
    if (deserializeJson(req, localHttp.arg("plain"))) {
      localHttp.send(400, "application/json", "{\"status\":\"failed\",\"message\":\"Bad JSON\"}"); return;
    }
    String ssid = req["ssid"] | ""; String pass = req["password"] | "";
    if (!ssid.length()) { localHttp.send(400, "application/json", "{\"status\":\"failed\",\"message\":\"ssid required\"}"); return; }
    wifiSSID = ssid; wifiPass = pass; saveConfig();
    localHttp.send(200, "application/json", "{\"status\":\"saved\",\"message\":\"Reconnecting...\"}");
    delay(300);
    ESP.restart();
  });
}

// ─── Setup / Loop ────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(100);
  pinMode(STATUS_LED_PIN, OUTPUT);
  Wire.begin(21, 22);
  if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[KODEX] OLED init failed (continuing without display)");
  }
  oled.clearDisplay(); oled.display();

  loadConfig();
  log("Boot — deviceId " + deviceId + ", firmware " + FIRMWARE_VERSION);

  // No paired token yet → captive portal pairing.
  if (deviceJWT.length() == 0 || wifiSSID.length() == 0) {
    log("Unpaired or no WiFi — entering setup AP mode");
    oledShow("KODEX Setup", "Connect to AP", "KODEX-" + getMacSuffix());
    startApPortal();
    return;  // loop() handles the portal until reboot
  }

  // Paired path — connect to school WiFi.
  oledShow("KODEX", "WiFi:", wifiSSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // disable modem sleep — prevents multi-second TLS round-trip delays
  WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_RETRY_TIMEOUT_MS) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    delay(250);
  }
  if (WiFi.status() != WL_CONNECTED) {
    log("WiFi failed — falling back to AP mode for re-config");
    startApPortal();
    return;
  }
  digitalWrite(STATUS_LED_PIN, HIGH);
  log("WiFi connected: " + WiFi.localIP().toString());

  configTime(0, 0, "pool.ntp.org", "time.google.com");
  registerLocalHttp();
  localHttp.begin();
}

void loop() {
  dns.processNextRequest();
  localHttp.handleClient();

  // Pairing-portal path: nothing else to do.
  if (deviceJWT.length() == 0 || WiFi.getMode() == WIFI_AP) {
    delay(20);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    static uint32_t lastReconnectMs = 0;
    uint32_t nowMs = millis();
    if (nowMs - lastReconnectMs >= 10000) {
      lastReconnectMs = nowMs;
      log("WiFi lost — reconnecting");
      WiFi.disconnect(false);
      delay(200);
      WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    } else {
      delay(500);
    }
    return;
  }

  if (wifiReconnectNeeded) {
    wifiReconnectNeeded = false;
    log("Forcing WiFi reconnect after repeated HB failures");
    WiFi.disconnect(false);
    delay(200);
    WiFi.begin(wifiSSID.c_str(), wifiPass.c_str());
    return;
  }

  uint32_t now = millis();
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    sendHeartbeat();
  }

  // Renders 4×/sec so the rotating-code countdown stays smooth.
  static uint32_t lastDraw = 0;
  if (now - lastDraw > 250) { lastDraw = now; renderScreen(); }
  delay(10);
}
