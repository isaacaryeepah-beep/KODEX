// DIKLY custom Jitsi server-side config — loaded automatically by jitsi/web container.
// Applies to ALL joins regardless of what the External API client sends.

// ── Authentication bypass ─────────────────────────────────────────────────────
config.prejoinPageEnabled = false;
config.prejoinConfig = { enabled: false };
config.enableWelcomePage = false;
config.enableClosePage = false;
// Kills popup-based XMPP auth fallback — JWT in URL is the only auth method
config.tokenAuthUrl = false;

// ── Explicit XMPP connection endpoints ───────────────────────────────────────
// These must point to the nginx-proxied paths on this server.
// WebSocket is preferred; BOSH is the fallback for restricted networks.
config.websocket = 'wss://meet.dikly.live/xmpp-websocket';
config.bosh = 'https://meet.dikly.live/http-bind';
// 20s keepalive: fast enough to detect a dead connection on a network handoff
// (WiFi→LTE or LTE→WiFi) without false-positives on slow mobile connections.
config.websocketKeepAlive = 20000;
config.websocketKeepAliveUrl = 'https://meet.dikly.live/http-bind?keepalive=true';

// ── Colibri WebSocket (JVB media bridge) ─────────────────────────────────────
config.useNewBandwidthAllocationStrategy = true;

// ── ICE / STUN / NAT traversal ───────────────────────────────────────────────
// P2P disabled — all media must flow through JVB so proctoring sees all streams
config.p2p = { enabled: false };
// STUN servers — used for JVB srflx (server-reflexive) ICE candidates.
// TURN credentials for relay are delivered automatically by Prosody's
// turncredentials module over XMPP — no explicit config.turnServers needed here.
config.stunServers = [
  { urls: 'stun:meet.dikly.live:3478' },  // self-hosted coturn (also serves as STUN)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ── Mobile / Safari connectivity ─────────────────────────────────────────────
config.forceJVB121Ratio = -1;
config.enableLayerSuspension = true;
// Do not require display name — students join with names from their DIKLY profile
config.requireDisplayName = false;
// Disable IPv6 to avoid ICE candidate ordering issues on mobile networks
config.useIPv6 = false;
// Prefer TURN over TCP when UDP is unavailable (common on mobile LTE).
// coturn listens on 3478/TCP so this reliably reaches clients behind carrier NAT.
config.useTurnUdp = false;
// Gather all ICE candidate types: host, srflx (via STUN), relay (via TURN).
// 'relay' candidates require coturn — now available.
config.iceTransportPolicy = 'all';
// ICE restart: when a mobile device switches networks (WiFi↔LTE), the existing
// ICE connection is broken. With enableIceRestart=true Jitsi re-negotiates ICE
// automatically instead of showing "disconnected" forever.
config.enableIceRestart = true;
// Increase ICE candidate gathering timeout so slow mobile networks have time
// to discover the TCP/TURN fallback before ICE fails.
config.pcStatsInterval = 10000;
// Safari needs explicit codec order — VP8 is universally supported
config.videoQuality = {
  codecPreferenceOrder: ['VP8', 'H264'],
  maxBitratesVideo: {
    low:    200000,
    standard: 500000,
    high:  1500000,
  },
};

// ── 200+ participant optimisations ───────────────────────────────────────────
// Limit active video tiles rendered simultaneously (saves CPU/memory for all clients)
config.channelLastN = -1;
config.adaptiveLastN = true;
// Simulcast: upstream 3 qualities, JVB picks the right one per receiver
config.disableSimulcast = false;
// Enable bandwidth estimation for adaptive quality
config.enableTcc = true;
config.enableRemb = true;
// Reduce default resolution cap for large meetings (overridden per-role in buildJitsiConfig)
config.constraints = {
  video: { height: { ideal: 360, max: 720 } },
};

// ── White-label ───────────────────────────────────────────────────────────────
config.applicationName = 'DIKLY';
config.defaultRemoteDisplayName = 'Participant';
config.defaultLocalDisplayName = 'Me';
config.disableDeepLinking = true;
// Jitsi 9584+: toolbar buttons moved from interface_config to config.
// Default to empty — the DIKLY External API embed sets the correct per-role list.
config.toolbarButtons = [];
// Hide all Jitsi branding — belt-and-suspenders alongside interfaceConfigOverwrite
config.disableWatermark = true;

// ── Privacy / analytics ───────────────────────────────────────────────────────
config.disableThirdPartyRequests = true;
config.analytics = {};
config.callStatsID = false;
config.callStatsSecret = false;
config.googleApiApplicationClientID = false;
config.microsoftApiApplicationClientID = false;
config.hiddenDomain = '';
