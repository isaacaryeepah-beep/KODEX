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
config.websocketKeepAlive = 10000;
config.websocketKeepAliveUrl = 'https://meet.dikly.live/http-bind?keepalive=true';

// ── Colibri WebSocket (JVB media bridge) ─────────────────────────────────────
config.useNewBandwidthAllocationStrategy = true;

// ── ICE / STUN / NAT traversal ───────────────────────────────────────────────
// P2P disabled — all media must flow through JVB so proctoring sees all streams
config.p2p = { enabled: false };
// Google public STUN only — no Coturn is running on this server
config.stunServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ── Mobile / Safari compatibility ────────────────────────────────────────────
// Force TCP fallback for networks that block UDP (common on mobile/corporate)
config.forceJVB121Ratio = -1;
config.enableLayerSuspension = true;
// Do not require display name — students join with names from their DIKLY profile
config.requireDisplayName = false;
// Disable IPv6 to avoid ICE candidate ordering issues on mobile networks
config.useIPv6 = false;
// Prefer TCP ICE candidates on mobile / Safari where UDP is often blocked
config.useTurnUdp = false;
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

// ── Privacy / analytics ───────────────────────────────────────────────────────
config.disableThirdPartyRequests = true;
config.analytics = {};
config.callStatsID = false;
config.callStatsSecret = false;
config.googleApiApplicationClientID = false;
config.microsoftApiApplicationClientID = false;
config.hiddenDomain = '';
