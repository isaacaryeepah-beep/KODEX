// DIKLY custom Jitsi server-side config — loaded automatically by jitsi/web container.
// Applies to ALL joins regardless of what the External API client sends.

// ── Authentication bypass ─────────────────────────────────────────────────────
config.prejoinPageEnabled = false;
config.prejoinConfig = { enabled: false };
config.enableWelcomePage = false;
config.enableClosePage = false;
config.tokenAuthUrl = false;

// ── Explicit XMPP connection endpoints ───────────────────────────────────────
// Mobile (LTE/carrier NAT): use BOSH (HTTP polling) — no persistent TCP connection
// to drop. Desktop: use WebSocket for lower latency.
if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))) {
  config.websocket = '';
  config.bosh = 'https://meet.dikly.live/http-bind';
} else {
  config.websocket = 'wss://meet.dikly.live/xmpp-websocket';
  config.bosh = 'https://meet.dikly.live/http-bind';
  config.websocketKeepAlive = 20000;
  config.websocketKeepAliveUrl = 'https://meet.dikly.live/http-bind?keepalive=true';
}

// ── Colibri WebSocket (JVB media bridge) ─────────────────────────────────────
config.useNewBandwidthAllocationStrategy = true;

// ── Mobile gate bypass ───────────────────────────────────────────────────────
config.disableDeepLinking = true;
config.deeplinking = { disabled: true };

// ── ICE / STUN / TURN ────────────────────────────────────────────────────────
// P2P disabled — all media flows through JVB for proctoring visibility.
config.p2p = { enabled: false };

// Static TURN credentials — HMAC-SHA1, expire ~2036.
// Regen: source /root/KODEX/.env && EXPIRY=$(($(date +%s)+315360000)) &&
//   UN="${EXPIRY}:dikly" && printf "%s" "$UN" | openssl dgst -sha1 -hmac "$TURN_SECRET" -binary | base64 -w0
config.iceServers = [
  {
    urls: [
      'turns:meet.dikly.live:5349',
      'turn:meet.dikly.live:3478?transport=tcp',
      'turn:meet.dikly.live:3478',
    ],
    username:   '2094567176:dikly',
    credential: 'a3T5VHdqy/4Tw/ylSQSrt5J9cPg=',
  },
];

// Mobile: relay-only — skip direct UDP (LTE carrier kills it after ~60s).
// Desktop: try all paths, fall back to TURN automatically.
if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))) {
  config.iceTransportPolicy = 'relay';
  // Don't waste ICE gathering time on STUN — relay mode discards those candidates anyway.
  config.stunServers = [];
} else {
  config.iceTransportPolicy = 'all';
}

config.enableIceRestart = true;
config.useIPv6 = false;
// Shorten ICE disconnection detection so reconnect kicks in faster on LTE drops.
config.iceUnmuteDelay            = 1500;
config.iceFailed                 = false;  // let JVB drive ICE restart, not the client

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
