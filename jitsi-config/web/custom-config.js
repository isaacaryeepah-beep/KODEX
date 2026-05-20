// DIKLY custom Jitsi server-side config — loaded automatically by jitsi/web container.
// Applies to ALL joins regardless of what the External API client sends.
// v2026-05-20b — coturn hardened, STUN entry added, ICE ordering explicit

// ── Authentication bypass ─────────────────────────────────────────────────────
config.prejoinPageEnabled = false;
config.prejoinConfig = { enabled: false };
config.enableWelcomePage = false;
config.enableClosePage = false;
config.tokenAuthUrl = false;

// ── XMPP connection endpoints ─────────────────────────────────────────────────
// Mobile (LTE/carrier NAT): force BOSH (HTTP long-polling).
// WebSocket connections are killed by carrier NAT after ~60s idle.
// Setting serviceUrl to an https:// URL makes lib-jitsi-meet use BOSH
// regardless of what config.websocket says.
var _isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));

if (_isMobile) {
  config.serviceUrl       = 'https://meet.dikly.live/http-bind';
  config.bosh             = 'https://meet.dikly.live/http-bind';
  config.websocket        = '';   // empty string → falsy → WS path skipped
  config.websocketKeepAlive = -1; // disable keepalive (not needed for BOSH)

  // Colibri WebSocket (JVB media bridge) has idleTimeoutMs=0 in this JVB build —
  // no built-in ping frames. Carrier NAT kills any idle WebSocket after ~60s.
  // Fix: intercept WebSocket creation and send a Colibri PingRequest every 25s.
  // JVB responds with PingResponse, generating bidirectional traffic that resets
  // the carrier NAT timer before it can expire.
  (function () {
    var NativeWS = window.WebSocket;
    function PatchedWS(url, protocols) {
      var ws = protocols !== undefined ? new NativeWS(url, protocols) : new NativeWS(url);
      if (typeof url === 'string' && url.indexOf('/colibri-ws/') !== -1) {
        var timer;
        ws.addEventListener('open', function () {
          timer = setInterval(function () {
            if (ws.readyState === 1) {
              try { ws.send('{"colibriClass":"PingRequest"}'); } catch (e) {}
            }
          }, 25000);
        });
        ws.addEventListener('close', function () { clearInterval(timer); });
        ws.addEventListener('error', function () { clearInterval(timer); });
      }
      return ws;
    }
    PatchedWS.prototype = NativeWS.prototype;
    PatchedWS.CONNECTING = NativeWS.CONNECTING;
    PatchedWS.OPEN       = NativeWS.OPEN;
    PatchedWS.CLOSING    = NativeWS.CLOSING;
    PatchedWS.CLOSED     = NativeWS.CLOSED;
    window.WebSocket = PatchedWS;
  }());
} else {
  config.serviceUrl       = 'wss://meet.dikly.live/xmpp-websocket';
  config.websocket        = 'wss://meet.dikly.live/xmpp-websocket';
  config.bosh             = 'https://meet.dikly.live/http-bind';
  config.websocketKeepAlive = 20000;
  config.websocketKeepAliveUrl = 'https://meet.dikly.live/http-bind?keepalive=true';
}

// ── Mobile gate bypass ───────────────────────────────────────────────────────
config.disableDeepLinking = true;
config.deeplinking = { disabled: true };

// ── ICE / STUN / TURN ────────────────────────────────────────────────────────
// P2P disabled — all media flows through JVB for proctoring visibility.
config.p2p = { enabled: false };

// coturn serves STUN and TURN on the same host.
//
// Two iceServers entries:
//   1. STUN-only (no credentials) — pure STUN binding for public-IP discovery.
//      Used by ICE to find the client's reflexive address before trying TURN.
//      Lightweight; coturn responds to STUN binding without auth.
//   2. TURN relay (HMAC-SHA1 time-limited credentials, expire ~2036).
//      Required when carrier-grade NAT blocks direct UDP — relays all media
//      through coturn on 3478/5349.
//
// Prosody's turncredentials module also delivers fresh per-session TURN
// credentials over XMPP after connect; these static creds are the pre-connect
// fallback that lets ICE start before XMPP authentication completes.
//
// Regen static creds after TURN_SECRET rotation:
//   source /root/KODEX/.env
//   EXPIRY=$(($(date +%s)+315360000))   # 10 years from now
//   UN="${EXPIRY}:dikly"
//   printf "%s" "$UN" | openssl dgst -sha1 -hmac "$TURN_SECRET" -binary | base64 -w0
config.iceServers = [
  // STUN binding — discovers client public IP, no credentials required
  { urls: 'stun:meet.dikly.live:3478' },
  // TURN relay — media bypass for carrier-grade NAT (LTE, hotel WiFi, VPNs)
  {
    urls: [
      'turns:meet.dikly.live:5349',             // TURN over TLS — penetrates strict carrier NAT
      'turn:meet.dikly.live:3478?transport=tcp', // TURN over TCP — when UDP 3478 is blocked
      'turn:meet.dikly.live:3478',              // TURN over UDP — lowest latency, tried first
    ],
    username:   '2094567176:dikly',
    credential: 'a3T5VHdqy/4Tw/ylSQSrt5J9cPg=',
  },
];

// ICE transport policy: try direct (host/STUN) candidates first, fall back to
// TURN relay automatically. 'relay' would be marginally faster on LTE but
// breaks entirely if coturn is unreachable — 'all' is the safer choice.
config.iceTransportPolicy = 'all';

// No separate STUN-only servers — coturn already in iceServers handles STUN.
config.stunServers = [];

config.enableIceRestart = true;
config.useIPv6 = false;

// ── Mobile / Safari media ─────────────────────────────────────────────────────
config.forceJVB121Ratio = -1;
config.enableLayerSuspension = false;
config.requireDisplayName = false;
config.pcStatsInterval = 10000;
config.videoQuality = {
  codecPreferenceOrder: ['VP8', 'H264'],
  maxBitratesVideo: { low: 200000, standard: 500000, high: 1200000 },
};
config.resolution = 360;
config.constraints = { video: { height: { ideal: 360, max: 720 } } };

// ── Participant optimisations ─────────────────────────────────────────────────
config.channelLastN = -1;
config.adaptiveLastN = true;
config.disableSimulcast = true;
config.enableTcc = true;
config.enableRemb = true;

// ── White-label ───────────────────────────────────────────────────────────────
config.applicationName = 'DIKLY';
config.defaultRemoteDisplayName = 'Participant';
config.defaultLocalDisplayName = 'Me';
config.toolbarButtons = [];
config.disableWatermark = true;

// ── Privacy / analytics ───────────────────────────────────────────────────────
config.disableThirdPartyRequests = true;
config.analytics = {};
config.callStatsID = false;
config.callStatsSecret = false;
config.googleApiApplicationClientID = false;
config.microsoftApiApplicationClientID = false;
config.hiddenDomain = '';
