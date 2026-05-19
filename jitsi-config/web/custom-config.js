// DIKLY custom Jitsi server-side config — loaded automatically by jitsi/web container.
// Applies to ALL joins regardless of what the External API client sends.

// ── Authentication bypass ─────────────────────────────────────────────────────
config.prejoinPageEnabled = false;
config.prejoinConfig = { enabled: false };
config.enableWelcomePage = false;
config.enableClosePage = false;
config.tokenAuthUrl = false;

// ── Explicit XMPP connection endpoints ───────────────────────────────────────
config.websocket = 'wss://meet.dikly.live/xmpp-websocket';
config.bosh = 'https://meet.dikly.live/http-bind';
config.websocketKeepAlive = 20000;
config.websocketKeepAliveUrl = 'https://meet.dikly.live/http-bind?keepalive=true';

// ── Colibri WebSocket (JVB media bridge) ─────────────────────────────────────
config.useNewBandwidthAllocationStrategy = true;

// ── Mobile gate bypass ───────────────────────────────────────────────────────
// Prevents Jitsi's "Video chat isn't available on mobile" blocking page.
config.disableDeepLinking = true;
config.deeplinking = { disabled: true };

// ── ICE / STUN / TURN ────────────────────────────────────────────────────────
// P2P disabled — all media flows through JVB for proctoring visibility.
config.p2p = { enabled: false };

// TURN credentials — HMAC-SHA1, expire 2036.
// Regen: source /root/KODEX/.env && EXPIRY=$(($(date +%s)+315360000)) &&
//   UN="${EXPIRY}:dikly" && printf "%s" "$UN" | openssl dgst -sha1 -hmac "$TURN_SECRET" -binary | base64 -w0
config.iceServers = [
  {
    urls: [
      'turns:meet.dikly.live:5349',             // TURN over TLS — works through strict carrier NAT
      'turn:meet.dikly.live:3478?transport=tcp', // TURN over TCP fallback
      'turn:meet.dikly.live:3478',               // TURN over UDP
    ],
    username:   '2094545587:dikly',
    credential: 'TBvg/uVn1JrbVHMnjaDaq4Na8sM=',
  },
];

// On mobile (LTE/carrier NAT) force relay-only ICE so the browser goes straight
// to TURN rather than wasting time on host/srflx candidates that always fail.
if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))) {
  config.iceTransportPolicy = 'relay';
} else {
  config.iceTransportPolicy = 'all';
}

config.enableIceRestart = true;
config.useIPv6 = false;

// ── Mobile / Safari media ─────────────────────────────────────────────────────
config.forceJVB121Ratio = -1;
config.enableLayerSuspension = true;
config.requireDisplayName = false;
config.pcStatsInterval = 10000;
// Safari needs explicit codec order — VP8 is universally supported.
config.videoQuality = {
  codecPreferenceOrder: ['VP8', 'H264'],
  maxBitratesVideo: { low: 200000, standard: 500000, high: 1500000 },
};

// ── 200+ participant optimisations ───────────────────────────────────────────
config.channelLastN = -1;
config.adaptiveLastN = true;
config.disableSimulcast = false;
config.enableTcc = true;
config.enableRemb = true;
config.constraints = { video: { height: { ideal: 360, max: 720 } } };

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
