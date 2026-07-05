"use strict";

/**
 * tomtomProvider.js
 *
 * Traffic-aware travel time via TomTom's Routing API. A third alternative
 * behind the same interface as googleMapsProvider.js/mapboxProvider.js —
 * { isConfigured(), getTravelTime({ origin, destination, departureTime }) }
 * — for when neither Google Cloud nor Mapbox billing signup goes through.
 * TomTom's free-tier API key needs only an email to sign up, no card.
 *
 * Unlike the other two, a single call with traffic=true returns both the
 * traffic-adjusted time (travelTimeInSeconds) and the traffic delay itself
 * (trafficDelayInSeconds), so the no-traffic baseline is a subtraction
 * rather than a second request.
 */

const axios = require("axios");

const ROUTING_BASE = "https://api.tomtom.com/routing/1/calculateRoute";

function isConfigured() {
  return !!process.env.TOMTOM_API_KEY;
}

function classifyTraffic(durationSeconds, durationInTrafficSeconds) {
  if (!durationSeconds) return "light";
  const ratio = durationInTrafficSeconds / durationSeconds;
  if (ratio < 1.15) return "light";
  if (ratio < 1.4) return "moderate";
  return "heavy";
}

async function getTravelTime({ origin, destination } = {}) {
  if (!isConfigured()) {
    throw new Error("TOMTOM_API_KEY is not set");
  }
  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
    throw new Error("origin and destination ({lat, lng}) are required");
  }

  const locations = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
  const resp = await axios.get(`${ROUTING_BASE}/${locations}/json`, {
    params: {
      key: process.env.TOMTOM_API_KEY,
      traffic: true,
      travelMode: "car",
    },
    timeout: 8000,
  });

  const summary = resp.data?.routes?.[0]?.summary;
  if (!summary) {
    throw new Error(`TomTom Routing error: ${resp.data?.error?.description || "no route found"}`);
  }

  const durationInTrafficSeconds = summary.travelTimeInSeconds;
  const trafficDelaySeconds = summary.trafficDelayInSeconds || 0;
  const durationSeconds = Math.max(durationInTrafficSeconds - trafficDelaySeconds, 1);

  return {
    durationMinutes: Math.round(durationSeconds / 60),
    durationInTrafficMinutes: Math.round(durationInTrafficSeconds / 60),
    distanceMeters: summary.lengthInMeters,
    trafficLevel: classifyTraffic(durationSeconds, durationInTrafficSeconds),
  };
}

module.exports = { name: "tomtom", isConfigured, getTravelTime };
