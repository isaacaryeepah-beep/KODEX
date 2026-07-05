"use strict";

/**
 * trafficService.js
 *
 * Public facade for travel-time estimation, independent of which mapping
 * provider is behind it. ArrivalIQ's prediction engine (Phase 2) calls
 * getTravelTime() here rather than any provider module directly, so
 * swapping Google Maps for another provider (or adding a fallback chain)
 * later is a one-file change — the same pattern used for push delivery in
 * src/services/push/pushService.js.
 */

const googleMapsProvider = require("./providers/googleMapsProvider");

// Only one provider today; a TRAFFIC_PROVIDER env var could select between
// registered providers here once a second one exists.
const ACTIVE_PROVIDER = googleMapsProvider;

function isConfigured() {
  return ACTIVE_PROVIDER.isConfigured();
}

/**
 * @param {Object} opts
 * @param {{lat:number,lng:number}} opts.origin
 * @param {{lat:number,lng:number}} opts.destination
 * @param {Date} [opts.departureTime] — for traffic-aware estimates
 * @returns {Promise<{durationMinutes:number, durationInTrafficMinutes:number, distanceMeters:number, trafficLevel:string}>}
 */
async function getTravelTime(opts) {
  if (!isConfigured()) {
    throw new Error("No traffic provider is configured (set GOOGLE_MAPS_API_KEY)");
  }
  return ACTIVE_PROVIDER.getTravelTime(opts);
}

module.exports = { isConfigured, getTravelTime };
