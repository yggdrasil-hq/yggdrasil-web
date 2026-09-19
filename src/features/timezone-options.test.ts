import { describe, expect, it } from "vitest";
import {
  UTC_ZONE,
  browserTimeZone,
  effectiveZone,
  isSubmittableZone,
  supportedTimeZones,
  zoneOptions,
  zonePreview,
} from "@/lib/tests/timezone-options";

/**
 * Issue #31 part 1's write half.
 *
 * The decisions here are about *not losing a value* and *not lying about what a
 * zone means*, so the cases are grouped that way. Everything is deterministic:
 * the preview cases pass an explicit instant rather than `new Date()`, because a
 * test whose answer depends on the day it runs is the kind that passes for months
 * and then fails on a DST boundary.
 */

describe("supportedTimeZones", () => {
  it("includes UTC, which Intl's own list omits", () => {
    // `Intl.supportedValuesOf("timeZone")` returns 418 IANA names and no `"UTC"`
    // — verified against the runtime, not assumed — so a picker built on it alone
    // would omit the default, the fallback, and the only zone most projects need.
    expect(supportedTimeZones()).toContain(UTC_ZONE);
  });

  it("does not list a zone twice", () => {
    const zones = supportedTimeZones();

    expect(new Set(zones).size).toBe(zones.length);
  });

  it("is sorted, so the list does not jump between renders", () => {
    const zones = supportedTimeZones();
    const sorted = [...zones].sort((a, b) => a.localeCompare(b));

    expect(zones).toEqual(sorted);
  });
});

describe("zoneOptions", () => {
  const supported = ["Africa/Johannesburg", "America/New_York", "Asia/Tokyo", "UTC"];

  /*
   * The first case is the one that matters most, and it guards a silent data loss
   * rather than a cosmetic glitch: a `<select>` whose value matches no option
   * renders as *nothing selected*, so saving from that state would replace the
   * project's zone with whatever the browser shows first. The API deliberately
   * returns an unresolvable stored zone as-is instead of hiding it, so the picker
   * has to be able to hold a value it cannot offer.
   */
  it("includes the stored zone even when the runtime does not list it", () => {
    const options = zoneOptions({ stored: "Mars/Olympus", supported });

    expect(options.map((option) => option.value)).toContain("Mars/Olympus");
    // Labelled, not bare: an unrecognised name is a state the operator needs to
    // recognise rather than a normal-looking entry.
    expect(options[0].label).toContain("not recognised here");
  });

  it("puts that unlisted zone first, where it is visible without scrolling", () => {
    const options = zoneOptions({ stored: "Mars/Olympus", supported });

    expect(options[0].value).toBe("Mars/Olympus");
    expect(options).toHaveLength(supported.length + 1);
  });

  it("does not duplicate a stored zone the runtime does list", () => {
    const options = zoneOptions({ stored: "Asia/Tokyo", supported });

    expect(options).toHaveLength(supported.length);
    expect(options.filter((option) => option.value === "Asia/Tokyo")).toHaveLength(1);
  });

  it("adds nothing for a missing or blank stored zone", () => {
    for (const stored of [null, undefined, "", "   "]) {
      expect(zoneOptions({ stored, supported })).toHaveLength(supported.length);
    }
  });

  it("keeps the alphabetical order otherwise, so type-ahead still works", () => {
    // Prepending the unlisted zone must not reshuffle the rest: typing "tok"
    // should still find Tokyo.
    const options = zoneOptions({ stored: "Mars/Olympus", supported });

    expect(options.slice(1).map((option) => option.value)).toEqual(supported);
  });
});

describe("effectiveZone", () => {
  it("reads an unset zone as UTC", () => {
    for (const stored of [null, undefined, "", "  "]) {
      expect(effectiveZone(stored)).toBe(UTC_ZONE);
    }
  });

  it("reads an unresolvable zone as UTC, matching the labels and the scheduler", () => {
    expect(effectiveZone("Mars/Olympus")).toBe(UTC_ZONE);
  });

  it("returns a resolvable zone as itself", () => {
    expect(effectiveZone("America/New_York")).toBe("America/New_York");
  });
});

describe("zonePreview", () => {
  /*
   * The reason the setting is an IANA name rather than an offset, demonstrated
   * rather than asserted in prose: the same zone reports different offsets in
   * January and July. A stored offset would freeze whichever one was picked and
   * reproduce the annual drift this issue exists to remove.
   */
  it("follows daylight saving for the same zone", () => {
    const winter = zonePreview("America/New_York", new Date("2026-01-15T12:00:00Z"));
    const summer = zonePreview("America/New_York", new Date("2026-07-15T12:00:00Z"));

    expect(winter?.offset).toBe("UTC-05:00");
    expect(summer?.offset).toBe("UTC-04:00");
    // And the wall clock moves with it: the same instant is an hour apart.
    expect(winter?.localTime).toBe("07:00");
    expect(summer?.localTime).toBe("08:00");
  });

  it("normalises Intl's GMT prefix to UTC", () => {
    // `longOffset` yields "GMT+02:00"; the card says "UTC+02:00", consistent with
    // the zone name the user picked and with the UTC fallback's own spelling.
    expect(zonePreview(UTC_ZONE)?.offset).toBe("UTC+00:00");
    expect(zonePreview("Europe/Berlin", new Date("2026-01-15T12:00:00Z"))?.offset).toBe(
      "UTC+01:00",
    );
  });

  it("handles half-hour and 45-minute offsets", () => {
    // These are where a naive hours-only implementation breaks, so they are
    // asserted rather than assumed.
    expect(zonePreview("Asia/Kolkata", new Date("2026-01-15T12:00:00Z"))?.offset).toBe(
      "UTC+05:30",
    );
    expect(zonePreview("Pacific/Chatham", new Date("2026-01-15T12:00:00Z"))?.offset).toBe(
      "UTC+13:45",
    );
  });

  it("is null for a zone it cannot resolve, rather than a placeholder", () => {
    // The card already has `scheduleZoneWarning` for that state; a second,
    // differently-worded explanation of one problem is one too many.
    expect(zonePreview("Mars/Olympus")).toBeNull();
    expect(zonePreview("")).toBeNull();
  });
});

describe("isSubmittableZone", () => {
  it("accepts the zones the picker offers", () => {
    for (const zone of ["UTC", "America/New_York", "Asia/Kolkata"]) {
      expect(isSubmittableZone(zone), zone).toBe(true);
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(isSubmittableZone("  Europe/Paris  ")).toBe(true);
  });

  it("refuses what the API would refuse, so Save is not offered for a 400", () => {
    // Same rule as the API's `isValidTimeZone` (also an `Intl` check), so this is
    // not a second definition — it just avoids the round trip. The API stays
    // authoritative and its own "Unknown time zone: X" message is what a failed
    // write surfaces.
    expect(isSubmittableZone("Mars/Olympus")).toBe(false);
    expect(isSubmittableZone("")).toBe(false);
    expect(isSubmittableZone("   ")).toBe(false);
    expect(isSubmittableZone("GMT+2")).toBe(false);
  });
});

describe("browserTimeZone", () => {
  it("names a zone this runtime can resolve, or null", () => {
    const zone = browserTimeZone();

    // Either the runtime names one and it resolves, or it does not — never a
    // value the picker would then have to label as unrecognised.
    if (zone !== null) {
      expect(isSubmittableZone(zone)).toBe(true);
    }
    expect(zone === null || typeof zone === "string").toBe(true);
  });
});
