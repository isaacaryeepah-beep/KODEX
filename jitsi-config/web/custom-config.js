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
// Use WebSocket first, fall back to BOSH if WebSocket fails
config.websocketKeepAlive = 10000;
config.websocketKeepAliveUrl = 'https://meet.dikly.live/http-bind?keepalive=true';

// ── Colibri WebSocket (JVB media bridge) ─────────────────────────────────────
config.useNewBandwidthAllocationStrategy = true;

// ── ICE / STUN / NAT traversal ───────────────────────────────────────────────
// P2P disabled — all media must flow through JVB so proctoring sees all streams
config.p2p = { enabled: false };
// Use Coturn STUN for ICE candidate gathering (Google STUN as backup)
config.stunServers = [
  { urls: 'stun:meet.dikly.live:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ── Mobile / Safari compatibility ────────────────────────────────────────────
// Force TCP fallback for networks that block UDP (common on mobile/corporate)
config.forceJVB121Ratio = -1;
config.enableLayerSuspension = true;
config.channelLastN = -1;

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
