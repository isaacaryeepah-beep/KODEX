"use strict";

/**
 * trafficService.js
 *
 * Public facade for travel-time estimation, independent of which mapping
 * provider is behind it. ArrivalIQ's prediction engine calls
 * getTravelTime() here rather than any provider module directly, so
 * swapping providers (or adding a fallback chain) is a one-file change —
 * the same pattern used for push delivery in src/services/push/pushService.js.
 *
 * TRAFFIC_PROVIDER=google-maps|mapbox|tomtom picks explicitly. Left unset,
 * it auto-selects whichever provider actually has credentials configured
 * (first match wins, in the order listed in PROVIDERS below) — set
 * explicitly once you've chosen one so a stray credential for another
 * doesn't silently take over.
 */

const googleMapsProvider = require("./providers/googleMapsProvider");
const mapboxProvider = require("./providers/mapboxProvider");
const tomtomProvider = require("./providers/tomtomProvider");

const PROVIDERS = {
  "google-maps": googleMapsProvider,
  "mapbox": mapboxProvider,
  "tomtom": tomtomProvider,
};

function activeProvider() {
  const forced = process.env.TRAFFIC_PROVIDER && PROVIDERS[process.env.TRAFFIC_PROVIDER];
  if (forced) return forced;
  return Object.values(PROVIDERS).find((p) => p.isConfigured()) || googleMapsProvider;
}

function isConfigured() {
  return activeProvider().isConfigured();
}

/**
 * @param {Object} opts
 * @param {{lat:number,lng:number}} opts.origin
 * @param {{lat:number,lng:number}} opts.destination
 * @param {Date} [opts.departureTime] — for traffic-aware estimates
 * @returns {Promise<{durationMinutes:number, durationInTrafficMinutes:number, distanceMeters:number, trafficLevel:string}>}
 */
async function getTravelTime(opts) {
  const provider = activeProvider();
  if (!provider.isConfigured()) {
    throw new Error("No traffic provider is configured (set GOOGLE_MAPS_API_KEY, MAPBOX_ACCESS_TOKEN, or TOMTOM_API_KEY)");
  }
  return provider.getTravelTime(opts);
}

module.exports = { isConfigured, getTravelTime };
