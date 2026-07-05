"use strict";

/**
 * googleMapsProvider.js
 *
 * Traffic-aware travel time via Google Maps Platform's Distance Matrix API.
 * Conforms to the provider interface consumed by ../trafficService.js:
 *   { isConfigured(), getTravelTime({ origin, destination, departureTime }) }
 * Expected resolved shape once implemented:
 *   { durationMinutes, durationInTrafficMinutes, distanceMeters, trafficLevel }
 * where trafficLevel is one of "light" | "moderate" | "heavy", derived from
 * comparing durationInTraffic against the no-traffic duration.
 *
 * NOT YET IMPLEMENTED — this is Phase 2 of ArrivalIQ (the prediction
 * engine). Scaffolded now, ahead of that work, so trafficService.js's
 * provider-selection logic doesn't change when the real HTTP call lands,
 * and so a different provider (e.g. Mapbox) could be swapped in later
 * against the exact same interface without touching any call site.
 */

function isConfigured() {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

async function getTravelTime({ origin, destination, departureTime } = {}) {
  throw new Error("googleMapsProvider.getTravelTime is not implemented yet (ArrivalIQ Phase 2)");
}

module.exports = { name: "google-maps", isConfigured, getTravelTime };
