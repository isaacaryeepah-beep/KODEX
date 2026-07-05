"use strict";

/**
 * mapboxProvider.js
 *
 * Traffic-aware travel time via Mapbox's Directions API. Alternative to
 * googleMapsProvider.js behind the same interface —
 * { isConfigured(), getTravelTime({ origin, destination, departureTime }) }
 * — for when Google Cloud billing setup isn't an option (Mapbox issues a
 * usable access token immediately on signup, no billing-account gate,
 * with a generous free tier).
 *
 * Mapbox's `driving-traffic` profile bakes live traffic straight into its
 * `duration`, with no separate no-traffic figure in the same response, so
 * a second call to the plain `driving` profile gets the no-traffic
 * baseline — needed to classify trafficLevel the same way
 * googleMapsProvider does (ratio of traffic duration to free-flow duration).
 */

const axios = require("axios");

const DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox";

function isConfigured() {
  return !!process.env.MAPBOX_ACCESS_TOKEN;
}

function classifyTraffic(durationSeconds, durationInTrafficSeconds) {
  if (!durationSeconds) return "light";
  const ratio = durationInTrafficSeconds / durationSeconds;
  if (ratio < 1.15) return "light";
  if (ratio < 1.4) return "moderate";
  return "heavy";
}

async function fetchRoute(profile, origin, destination) {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const resp = await axios.get(`${DIRECTIONS_BASE}/${profile}/${coords}`, {
    params: {
      access_token: process.env.MAPBOX_ACCESS_TOKEN,
      overview: "false",
      alternatives: false,
    },
    timeout: 8000,
  });
  const route = resp.data?.routes?.[0];
  if (!route) throw new Error(`Mapbox Directions error: ${resp.data?.message || "no route found"}`);
  return route;
}

async function getTravelTime({ origin, destination } = {}) {
  if (!isConfigured()) {
    throw new Error("MAPBOX_ACCESS_TOKEN is not set");
  }
  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
    throw new Error("origin and destination ({lat, lng}) are required");
  }

  const [trafficRoute, freeFlowRoute] = await Promise.all([
    fetchRoute("driving-traffic", origin, destination),
    fetchRoute("driving", origin, destination),
  ]);

  const durationSeconds = freeFlowRoute.duration;
  const durationInTrafficSeconds = trafficRoute.duration;

  return {
    durationMinutes: Math.round(durationSeconds / 60),
    durationInTrafficMinutes: Math.round(durationInTrafficSeconds / 60),
    distanceMeters: Math.round(trafficRoute.distance),
    trafficLevel: classifyTraffic(durationSeconds, durationInTrafficSeconds),
  };
}

module.exports = { name: "mapbox", isConfigured, getTravelTime };
