import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_ZONE,
  TEST_SCHEDULE_PRESETS,
  cronToPresetId,
  describeCustomCron,
  isResolvableTimeZone,
  presetLabel,
  scheduleZoneName,
  scheduleZoneWarning,
} from "@/lib/tests/schedules";

/**
 * Issue #31: making the schedule's clock visible, and naming the *right* clock.
 *
 * Two stages, and the second is what these tests are mostly about now. The first
 * made the free-text path state its zone at all — it was the one place a user
 * configured a schedule with no statement of which clock applied. The second is
 * that the stated zone was hardcoded UTC, which is honest only while no project
 * can set one; `PublicProject.timeZone` exists now (API part 1), so every label
 * takes the project's zone and UTC is the *fallback*.
 *
 * The fallback has a second job the API's design demands: `timeZone` is returned
 * **as stored**, so an unusable name reaches the client, and it must degrade to
 * UTC rather than throwing or being rendered verbatim — because UTC is also what
 * the scheduler falls back to. A label has to say what will actually happen.
 */

describe("presetLabel", () => {
  it("names the project's zone in the clock-time preset labels", () => {
    // The property this whole module is about: a preset that implies a time of day
    // must say which time of day — and the project's, not a hardcoded one.
    expect(presetLabel(TEST_SCHEDULE_PRESETS.daily9am.cron, "America/New_York")).toBe(
      "Daily at 09:00 America/New_York",
    );
    expect(presetLabel(TEST_SCHEDULE_PRESETS.weeklyMonday9am.cron, "Europe/Berlin")).toBe(
      "Weekly on Monday at 09:00 Europe/Berlin",
    );
  });

  it("falls back to UTC when the project has no zone", () => {
    expect(presetLabel(TEST_SCHEDULE_PRESETS.daily9am.cron, null)).toContain("UTC");
    // And with no argument at all, which is what a caller that has not been
    // updated would pass — the property the old hardcoded labels had.
    expect(presetLabel(TEST_SCHEDULE_PRESETS.daily9am.cron)).toContain("UTC");
  });

  /*
   * The interval presets deliberately carry no zone, and this is the assertion
   * that keeps that deliberate rather than accidental: "every 6 hours" is the same
   * interval in every zone. A zone shifts such a schedule's phase, but not the
   * interval the user chose, and the Schedule card states the zone for the
   * schedule as a whole.
   */
  it("does not suffix an interval preset with a zone", () => {
    expect(presetLabel(TEST_SCHEDULE_PRESETS.hourly.cron, "Asia/Tokyo")).toBe("Every hour");
    expect(presetLabel(TEST_SCHEDULE_PRESETS.every6Hours.cron, "Asia/Tokyo")).toBe(
      "Every 6 hours",
    );
  });

  it("passes a custom expression through unchanged", () => {
    expect(presetLabel("0 2 * * *", "Asia/Tokyo")).toBe("0 2 * * *");
    expect(cronToPresetId("0 2 * * *")).toBe("custom");
  });
});

/*
 * The zone fallback. `PublicProject.timeZone` is returned as stored — the API
 * validates on write and deliberately does not rewrite a bad value to null,
 * because that would hide it from the operator who has to fix it — so an
 * unusable name genuinely reaches the client, and every consumer has to cope.
 */
describe("scheduleZoneName", () => {
  it("returns a resolvable project zone unchanged", () => {
    expect(scheduleZoneName("America/New_York")).toBe("America/New_York");
    expect(scheduleZoneName("Europe/Berlin")).toBe("Europe/Berlin");
  });

  it("falls back to UTC for a missing, empty or blank zone", () => {
    expect(scheduleZoneName(null)).toBe(DEFAULT_SCHEDULE_ZONE);
    expect(scheduleZoneName(undefined)).toBe(DEFAULT_SCHEDULE_ZONE);
    expect(scheduleZoneName("")).toBe(DEFAULT_SCHEDULE_ZONE);
    expect(scheduleZoneName("   ")).toBe(DEFAULT_SCHEDULE_ZONE);
  });

  it("falls back to UTC for a zone this runtime cannot resolve", () => {
    // The important case: a non-null value is not a guarantee. Rendering it
    // verbatim would print a zone the scheduler is not using, which is worse than
    // the hardcoded "UTC" this replaced.
    expect(scheduleZoneName("Not/AZone")).toBe(DEFAULT_SCHEDULE_ZONE);
    expect(scheduleZoneName("UTC+3")).toBe(DEFAULT_SCHEDULE_ZONE);
  });

  it("never returns an empty string, for any input", () => {
    // It is interpolated into sentences, so an empty result would read
    // "evaluated in ." — a caller should be able to skip a conditional.
    for (const input of [null, undefined, "", "   ", "Not/AZone", "UTC"]) {
      expect(scheduleZoneName(input).length).toBeGreaterThan(0);
    }
  });
});

describe("isResolvableTimeZone", () => {
  it("agrees with Intl rather than with a hardcoded list", () => {
    expect(isResolvableTimeZone("America/New_York")).toBe(true);
    expect(isResolvableTimeZone("UTC")).toBe(true);
    expect(isResolvableTimeZone("Not/AZone")).toBe(false);
    expect(isResolvableTimeZone("")).toBe(false);
  });
});

describe("scheduleZoneWarning", () => {
  it("says nothing when the zone is fine or absent", () => {
    // Silence in the normal case: the labels already name the effective zone, so
    // repeating "and your zone is fine" beside every schedule is noise.
    expect(scheduleZoneWarning(null)).toBeNull();
    expect(scheduleZoneWarning("America/New_York")).toBeNull();
  });

  it("explains the one state the labels cannot", () => {
    // A stored zone the labels render as UTC would otherwise read as the setting
    // having been ignored. This is the sentence that distinguishes "you set
    // nothing" from "what you set cannot be used here".
    const warning = scheduleZoneWarning("Not/AZone");
    expect(warning).toContain("Not/AZone");
    expect(warning).toContain("UTC");
  });

  it("quotes the stored value rather than rewriting it", () => {
    // It is the operator's value and the thing they have to go and fix, so it has
    // to appear as stored.
    expect(scheduleZoneWarning("  Mars/Olympus  ")).toContain("Mars/Olympus");
  });
});

/*
 * The zone-aware describer. The default-zone assertions live above (they are the
 * behaviour the first stage shipped); these are the ones that make the stated zone
 * the project's.
 */
describe("describeCustomCron against a project zone", () => {
  it("spells a wall-clock time in the project's zone", () => {
    expect(describeCustomCron("0 2 * * *", "America/New_York")).toBe(
      "Runs every day at 02:00 America/New_York.",
    );
  });

  it("uses the project's zone in the fallback sentence too", () => {
    // The fallback is the half that has to be right for every accepted
    // expression, so the zone must appear there as well as in the named shapes.
    expect(describeCustomCron("0 0 1,15 * *", "Asia/Tokyo")).toContain("Asia/Tokyo");
    expect(describeCustomCron("", "Asia/Tokyo")).toContain("Asia/Tokyo");
  });

  it("does not silently describe an unusable zone as though it were in use", () => {
    // Falls back to UTC in the sentence, matching both the label and what the
    // scheduler does — never printing a zone it is not actually using.
    const described = describeCustomCron("0 2 * * *", "Not/AZone");
    expect(described).toContain("UTC");
    expect(described).not.toContain("Not/AZone");
  });
});

describe("describeCustomCron", () => {
  it("spells out the daily-time case, which is what the DST caveat is about", () => {
    // The literal example from the issue: someone typing this for "every night at
    // 2am" is configuring 02:00 UTC, and could not previously tell.
    expect(describeCustomCron("0 2 * * *", null)).toBe("Runs every day at 02:00 UTC.");
  });

  it("zero-pads so the reading is unambiguous", () => {
    expect(describeCustomCron("5 7 * * *", null)).toBe("Runs every day at 07:05 UTC.");
  });

  it("recognises a weekday range", () => {
    expect(describeCustomCron("30 14 * * 1-5", null)).toBe(
      "Runs Monday to Friday at 14:30 UTC.",
    );
  });

  it("recognises an hourly expression", () => {
    expect(describeCustomCron("0 * * * *", null)).toBe("Runs every hour, on the hour (UTC).");
    expect(describeCustomCron("15 * * * *", null)).toBe(
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
    const described = describeCustomCron("0 0 1,15 * *", null);
    expect(described).toContain("0 0 1,15 * *");
    expect(described).toContain("UTC");
  });

  it("says what to enter when the field is not five fields yet", () => {
    // Mid-typing is the common case for an empty or partial field, so this is a
    // hint rather than an error — and emphatically not a rejection: the API is the
    // validator, and this must not imply the form will refuse a value.
    for (const partial of ["", "0", "0 2", "0 2 * *", "0 2 * * * *"]) {
      const described = describeCustomCron(partial, null);
      expect(described).toContain("five-field");
      expect(described).toContain("UTC");
    }
  });

  it("never returns an empty string, for any input", () => {
    // It renders unconditionally under the field, so an empty result would leave a
    // blank line where the explanation should be.
    for (const input of ["", "   ", "* * * * *", "not a cron at all", "0 2 * * MON"]) {
      expect(describeCustomCron(input, null).length).toBeGreaterThan(0);
    }
  });

  it("does not claim to understand a named field it cannot translate", () => {
    // `MON` is outside the subset this function names, so it must fall through to
    // the honest form rather than being pattern-matched into a wrong sentence.
    const described = describeCustomCron("0 2 * * MON", null);
    expect(described).toContain("evaluated in UTC");
    expect(described).not.toContain("every day");
  });
});
