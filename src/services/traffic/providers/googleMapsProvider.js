"use strict";

/**
 * googleMapsProvider.js
 *
 * Traffic-aware travel time via Google Maps Platform's Distance Matrix API.
 * Conforms to the provider interface consumed by ../trafficService.js:
 *   { isConfigured(), getTravelTime({ origin, destination, departureTime }) }
 * Resolves: { durationMinutes, durationInTrafficMinutes, distanceMeters, trafficLevel }
 * where trafficLevel ("light" | "moderate" | "heavy") is derived from how
 * much durationInTraffic exceeds the no-traffic duration.
 */

const axios = require("axios");

const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

function isConfigured() {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

function classifyTraffic(durationSeconds, durationInTrafficSeconds) {
  if (!durationSeconds) return "light";
  const ratio = durationInTrafficSeconds / durationSeconds;
  if (ratio < 1.15) return "light";
  if (ratio < 1.4) return "moderate";
  return "heavy";
}

async function getTravelTime({ origin, destination, departureTime } = {}) {
  if (!isConfigured()) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set");
  }
  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
    throw new Error("origin and destination ({lat, lng}) are required");
  }

  const departureSeconds = departureTime instanceof Date
    ? Math.max(Math.floor(departureTime.getTime() / 1000), Math.floor(Date.now() / 1000))
    : "now";

  const resp = await axios.get(DISTANCE_MATRIX_URL, {
    params: {
      origins: `${origin.lat},${origin.lng}`,
      destinations: `${destination.lat},${destination.lng}`,
      mode: "driving",
      departure_time: departureSeconds,
      traffic_model: "best_guess",
      key: process.env.GOOGLE_MAPS_API_KEY,
    },
    timeout: 8000,
  });

  const data = resp.data;
  if (data.status !== "OK") {
    throw new Error(`Distance Matrix error: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`);
  }
  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    throw new Error(`Distance Matrix element error: ${element?.status || "NO_RESULT"}`);
  }

  const durationSeconds = element.duration.value;
  const durationInTrafficSeconds = element.duration_in_traffic?.value ?? durationSeconds;

  return {
    durationMinutes: Math.round(durationSeconds / 60),
    durationInTrafficMinutes: Math.round(durationInTrafficSeconds / 60),
    distanceMeters: element.distance.value,
    trafficLevel: classifyTraffic(durationSeconds, durationInTrafficSeconds),
  };
}

module.exports = { name: "google-maps", isConfigured, getTravelTime };
