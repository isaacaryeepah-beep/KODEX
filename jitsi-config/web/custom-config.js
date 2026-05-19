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
      'turns:meet.dikly.live:5349',
      'turn:meet.dikly.live:3478?transport=tcp',
      'turn:meet.dikly.live:3478',
    ],
    username:   '2094545587:dikly',
    credential: 'TBvg/uVn1JrbVHMnjaDaq4Na8sM=',
  },
];

// Use 'all' on all devices — try direct JVB connection (10000/UDP, 4443/TCP) first,
// fall back to TURN relay automatically. 'relay'-only was causing disconnections when
// coturn had any transient issue, with no fallback path.
config.iceTransportPolicy = 'all';

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
