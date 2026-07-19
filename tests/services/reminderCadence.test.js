"use strict";

/**
 * Cadence/window tiling invariants for the reminder crons.
 *
 * The original bug: both timetableReminder and quizReminder ran every 30
 * minutes but only looked at a ~5-minute slice 28–32 minutes ahead — so a
 * class starting at 9:15 (or a quiz closing at 10:45) NEVER got a
 * reminder; only :28–:32 / :58–:02 edges did. These tests pin the
 * invariant that the look-ahead window exactly tiles the cron cadence:
 * every possible start minute is covered by exactly one cron run.
 *
 * Pure unit tests — no DB. The DB behavior of the sweeps is covered by
 * timetableReminder.test.js / quizReminder.test.js.
 */

const {
  buildSlotFilter,
  CRON_EXPR: TT_CRON,
} = require("../../src/services/timetableReminder");
const {
  windowNow,
  CRON_EXPR: QUIZ_CRON,
} = require("../../src/services/quizReminder");

const CADENCE_MIN = 5;

// Minimal evaluator for the two filter shapes buildSlotFilter produces.
function filterMatchesSlot(filter, slot) {
  if (filter.$or) {
    return filter.$or.some((clause) => filterMatchesSlot(clause, slot));
  }
  if (filter.dayOfWeek !== undefined && filter.dayOfWeek !== slot.dayOfWeek) return false;
  const range = filter.startTime;
  if (!range) return false;
  const gte = range.$gte !== undefined ? slot.startTime >= range.$gte : true;
  const lte = range.$lte !== undefined ? slot.startTime <= range.$lte : true;
  return gte && lte;
}

const pad = (n) => String(n).padStart(2, "0");

describe("reminder cron cadence", () => {
  test("both reminder crons fire every 5 minutes", () => {
    expect(TT_CRON).toBe("*/5 * * * *");
    expect(QUIZ_CRON).toBe("*/5 * * * *");
  });

  test("timetable window tiles the day: every class start minute is covered by exactly one run", () => {
    // Fires across two consecutive days (D-1 and D), classes on day D at
    // every minute — including 00:0x classes whose covering fire is late
    // on D-1 (the midnight-wrap case).
    const dayD = new Date(2026, 0, 7, 0, 0, 0); // a Wednesday, local time
    const fires = [];
    for (let dayOffset = -1; dayOffset <= 0; dayOffset++) {
      for (let m = 0; m < 24 * 60; m += CADENCE_MIN) {
        fires.push(new Date(2026, 0, 7 + dayOffset, Math.floor(m / 60), m % 60, 0));
      }
    }

    for (let m = 0; m < 24 * 60; m++) {
      const slot = {
        dayOfWeek: dayD.getDay(),
        startTime: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`,
      };
      const covering = fires.filter((f) => filterMatchesSlot(buildSlotFilter(f), slot));
      if (covering.length !== 1) {
        throw new Error(
          `class at ${slot.startTime} covered by ${covering.length} run(s): ` +
          covering.map((f) => f.toISOString()).join(", ")
        );
      }
    }
  });

  test("a run whose whole window falls after midnight targets tomorrow's dayOfWeek", () => {
    const fire = new Date(2026, 0, 7, 23, 35, 0); // Wednesday 23:35 → window 00:03–00:07 Thursday
    const filter = buildSlotFilter(fire);

    const thursday = (fire.getDay() + 1) % 7;
    expect(filterMatchesSlot(filter, { dayOfWeek: thursday, startTime: "00:05" })).toBe(true);
    // Same clock time on the WRONG day must not match
    expect(filterMatchesSlot(filter, { dayOfWeek: fire.getDay(), startTime: "00:05" })).toBe(false);
  });

  test("a run whose window straddles midnight matches both sides on the right days", () => {
    const fire = new Date(2026, 0, 7, 23, 30, 0); // Wednesday 23:30 → window 23:58 Wed – 00:02 Thu
    const filter = buildSlotFilter(fire);
    expect(filter.$or).toBeDefined();

    const wednesday = fire.getDay();
    const thursday = (wednesday + 1) % 7;
    expect(filterMatchesSlot(filter, { dayOfWeek: wednesday, startTime: "23:59" })).toBe(true);
    expect(filterMatchesSlot(filter, { dayOfWeek: thursday,  startTime: "00:01" })).toBe(true);
    expect(filterMatchesSlot(filter, { dayOfWeek: thursday,  startTime: "23:59" })).toBe(false);
    expect(filterMatchesSlot(filter, { dayOfWeek: wednesday, startTime: "00:01" })).toBe(false);
  });

  test("quiz window is half-open and spans exactly the cron cadence", () => {
    const { lo, hi } = windowNow();
    expect(hi.getTime() - lo.getTime()).toBe(CADENCE_MIN * 60 * 1000);
  });
});
