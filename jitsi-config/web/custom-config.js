// DIKLY custom Jitsi server-side config — loaded automatically by jitsi/web container.
// These settings apply to ALL joins regardless of what the External API client sends,
// ensuring no prejoin page or auth popup appears even on direct URL access.

config.prejoinPageEnabled = false;
config.prejoinConfig = { enabled: false };
config.enableWelcomePage = false;
config.enableClosePage = false;

// Disable Jitsi's popup-based XMPP auth fallback.
// With ENABLE_AUTH=1 + ENABLE_GUESTS=0, Jitsi would normally open a login popup
// when no JWT is present. Setting tokenAuthUrl to false kills that popup entirely.
// Authentication is handled exclusively via the JWT in the iframe URL.
config.tokenAuthUrl = false;

// White-label
config.applicationName = 'DIKLY';
config.defaultRemoteDisplayName = 'Participant';

// Disable deep linking / native app prompts
config.disableDeepLinking = true;

// Disable peer-to-peer so all traffic routes through JVB (required for proctoring)
config.p2p = { enabled: false };

// Disable third-party analytics / crash reporting
config.disableThirdPartyRequests = true;
config.analytics = {};
config.callStatsID = false;
config.callStatsSecret = false;
config.googleApiApplicationClientID = false;
config.microsoftApiApplicationClientID = false;

// Suppress browser extension promo
config.disableAudioLevels = false;
config.channelLastN = -1;
