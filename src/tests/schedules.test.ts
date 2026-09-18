import { describe, expect, it } from "vitest";
import {
  TEST_SCHEDULE_PRESETS,
  cronToPresetId,
  describeCustomCronUtc,
  presetLabel,
} from "@/lib/tests/schedules";

/**
 * Issue #31: making the schedule's clock visible on the path that does not state
 * it. The presets name UTC in their labels; the free-text field did not, which is
 * the one place a user could configure a schedule without being told which clock
 * it is read against.
 */

describe("presetLabel", () => {
  it("names UTC in the clock-time preset labels", () => {
    // The property this whole module is about: a preset that implies a time of day
    // must say which time of day.
    expect(presetLabel(TEST_SCHEDULE_PRESETS.daily9am.cron)).toContain("UTC");
    expect(presetLabel(TEST_SCHEDULE_PRESETS.weeklyMonday9am.cron)).toContain("UTC");
  });

  it("passes a custom expression through unchanged", () => {
    expect(presetLabel("0 2 * * *")).toBe("0 2 * * *");
    expect(cronToPresetId("0 2 * * *")).toBe("custom");
  });
});

describe("describeCustomCronUtc", () => {
  it("spells out the daily-time case, which is what the DST caveat is about", () => {
    // The literal example from the issue: someone typing this for "every night at
    // 2am" is configuring 02:00 UTC, and could not previously tell.
    expect(describeCustomCronUtc("0 2 * * *")).toBe("Runs every day at 02:00 UTC.");
  });

  it("zero-pads so the reading is unambiguous", () => {
    expect(describeCustomCronUtc("5 7 * * *")).toBe("Runs every day at 07:05 UTC.");
  });

  it("recognises a weekday range", () => {
    expect(describeCustomCronUtc("30 14 * * 1-5")).toBe(
      "Runs Monday to Friday at 14:30 UTC.",
    );
  });

  it("recognises an hourly expression", () => {
    expect(describeCustomCronUtc("0 * * * *")).toBe("Runs every hour, on the hour (UTC).");
    expect(describeCustomCronUtc("15 * * * *")).toBe(
      "Runs every hour at 15 minutes past (UTC).",
    );
  });

  /*
   * The fallback is the important half of this function's contract. It has to be
   * accurate for every expression the API accepts, because it is what everything
   * outside the handful of named shapes reads — and claiming to have understood
   * more than it did is the failure mode to avoid.
   */
  it("states the expression and the zone for a shape it does not name", () => {
    const described = describeCustomCronUtc("0 0 1,15 * *");
    expect(described).toContain("0 0 1,15 * *");
    expect(described).toContain("UTC");
  });

  it("says what to enter when the field is not five fields yet", () => {
    // Mid-typing is the common case for an empty or partial field, so this is a
    // hint rather than an error — and emphatically not a rejection: the API is the
    // validator, and this must not imply the form will refuse a value.
    for (const partial of ["", "0", "0 2", "0 2 * *", "0 2 * * * *"]) {
      const described = describeCustomCronUtc(partial);
      expect(described).toContain("five-field");
      expect(described).toContain("UTC");
    }
  });

  it("never returns an empty string, for any input", () => {
    // It renders unconditionally under the field, so an empty result would leave a
    // blank line where the explanation should be.
    for (const input of ["", "   ", "* * * * *", "not a cron at all", "0 2 * * MON"]) {
      expect(describeCustomCronUtc(input).length).toBeGreaterThan(0);
    }
  });

  it("does not claim to understand a named field it cannot translate", () => {
    // `MON` is outside the subset this function names, so it must fall through to
    // the honest form rather than being pattern-matched into a wrong sentence.
    const described = describeCustomCronUtc("0 2 * * MON");
    expect(described).toContain("evaluated in UTC");
    expect(described).not.toContain("every day");
  });
});
