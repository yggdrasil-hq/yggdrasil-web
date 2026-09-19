import { DEFAULT_SCHEDULE_ZONE, isResolvableTimeZone } from "./schedules";

/**
 * Issue #31 part 1's write half: choosing the zone a project's schedules are read
 * in.
 *
 * The read half landed first (`schedules.ts`) and this is deliberately built on
 * top of it rather than beside it, because the two must agree about what a zone
 * even means. In particular `isResolvableTimeZone` is reused here rather than
 * reimplemented: a picker that accepted a name the labels could not render would
 * produce a saved setting whose own schedule card said it was broken.
 *
 * **Why the zone is a project setting and not a user preference.** The API stores
 * it per project (`projects.settings.timezone`, surfaced as
 * `PublicProject.timeZone`), and that is not an accident of implementation: a
 * project's tests are one suite with one schedule, and a suite cannot fire at two
 * different times. Several people read the same schedule from different zones —
 * which is why the *label* names the zone — but there is exactly one answer to
 * "when does this run", and it belongs to the thing that runs.
 */

/** The zone used when a project has set none, and the API's own fallback. */
export const UTC_ZONE = DEFAULT_SCHEDULE_ZONE;

/**
 * Every zone this runtime can resolve, plus `UTC`.
 *
 * **`UTC` has to be added explicitly.** `Intl.supportedValuesOf("timeZone")`
 * returns 418 IANA names and does **not** include `"UTC"` — verified, not assumed
 * — so a picker built on it alone would omit the one zone that is the default,
 * the fallback, and the only one most projects need. `"Etc/UTC"` is absent from
 * the list too, so there is no alias to fall back on.
 *
 * Cached because it is a 418-element array built per call otherwise, and the card
 * renders on every settings visit.
 */
let cachedSupportedZones: string[] | null = null;

export function supportedTimeZones(): string[] {
  if (cachedSupportedZones) return cachedSupportedZones;

  /*
   * `Intl.supportedValuesOf` is not in every runtime (it is ES2022, and Safari
   * only gained it in 15.4). Its absence must not break the picker, so it falls
   * back to a short list of the zones most likely to be wanted plus `UTC` — the
   * card also accepts a typed name, so a missing list narrows the shortcuts
   * rather than removing the capability.
   */
  const fromRuntime =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];

  const zones = fromRuntime.length > 0 ? fromRuntime : FALLBACK_ZONES;
  const withUtc = zones.includes(UTC_ZONE) ? zones : [UTC_ZONE, ...zones];

  cachedSupportedZones = [...withUtc].sort((a, b) => a.localeCompare(b));
  return cachedSupportedZones;
}

/**
 * Used only when `Intl.supportedValuesOf` is unavailable. Deliberately short and
 * sorted by nothing in particular — it is a convenience list, not a claim about
 * which zones exist.
 */
const FALLBACK_ZONES = [
  "Africa/Johannesburg",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Pacific/Auckland",
];

export interface ZoneOption {
  value: string;
  label: string;
}

/**
 * The picker's options.
 *
 * Two guarantees, both of which are bugs waiting to happen without them:
 *
 * 1. **The stored zone is always present**, even when the runtime does not list
 *    it. A `<select>` whose value matches no option renders as *nothing selected*,
 *    so saving from that state would silently replace the project's zone with
 *    whatever the browser shows first. The API deliberately returns an
 *    unresolvable stored zone as-is rather than hiding it (`schedules.ts` says
 *    why), so the picker has to be able to hold a value it cannot offer.
 * 2. **No duplicates**, so a stored zone that *is* in the list is not added twice
 *    and the option list has one entry per zone.
 *
 * `stored` is marked rather than sorted to the top: the list is alphabetical so
 * a user can find a zone by typing, and moving one entry breaks that.
 */
export function zoneOptions(input: {
  stored: string | null | undefined;
  supported?: string[];
}): ZoneOption[] {
  const zones = input.supported ?? supportedTimeZones();
  const options = zones.map((zone) => ({ value: zone, label: zone }));

  const stored = input.stored?.trim();
  if (stored && !zones.includes(stored)) {
    /*
     * Prepended rather than appended so it is visible without scrolling to the
     * end of 418 entries, and labelled so it is clear why it looks unusual. This
     * is the state an operator sees when a zone was set elsewhere and this
     * runtime cannot resolve it.
     */
    options.unshift({ value: stored, label: `${stored} (not recognised here)` });
  }

  return options;
}

/**
 * The zone a project's schedules are effectively read in, which is what the card
 * should report as current.
 *
 * `null` and an unresolvable name both answer `UTC`, matching the labels
 * (`scheduleZoneName`) and the scheduler's own fallback — one rule, three
 * readers. Clearing the setting and setting it to `"UTC"` therefore read
 * identically, which is correct: they mean the same thing to the scheduler.
 */
export function effectiveZone(stored: string | null | undefined): string {
  const trimmed = stored?.trim();
  if (!trimmed) return UTC_ZONE;
  return isResolvableTimeZone(trimmed) ? trimmed : UTC_ZONE;
}

export interface ZonePreview {
  /** e.g. `UTC-04:00`, normalised from `Intl`'s `GMT-04:00`. */
  offset: string;
  /** The zone's current wall-clock time, `HH:MM`. */
  localTime: string;
}

/**
 * What the selected zone means right now, so the user can confirm it is the zone
 * they meant before saving.
 *
 * **The offset is the point.** A zone name is easy to mis-pick —
 * `America/New_York` and `America/Toronto` are different strings for the same
 * offset today and will differ under a future DST rule change — and the offset is
 * what tells a user "yes, that is four hours behind me". It also shows *why* the
 * setting exists at all: the number moves with DST, which a fixed offset could not.
 *
 * Returns null for a zone this runtime cannot resolve, rather than a placeholder:
 * the caller already has `scheduleZoneWarning` for that case and two different
 * explanations of one problem is one too many.
 */
export function zonePreview(zone: string, at: Date = new Date()): ZonePreview | null {
  if (!isResolvableTimeZone(zone)) return null;

  try {
    // `longOffset` yields "GMT-04:00"; normalising GMT to UTC keeps the label
    // consistent with the zone name the user picked and with `UTC_ZONE`. Half-
    // hour and 45-minute zones (Asia/Kolkata, Pacific/Chatham) come through the
    // same path — verified against both.
    const offset =
      new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")
        ?.value.replace(/^GMT/, "UTC") ?? "";

    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);

    return { offset, localTime };
  } catch {
    // Defence in depth: `isResolvableTimeZone` has already checked, but this card
    // must not be the thing that white-screens a settings page.
    return null;
  }
}

/**
 * The browser's own zone, as the quickest correct answer for most users.
 *
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` is the runtime's zone, which
 * is what a user means by "my timezone" — and offering it saves them finding
 * their city in a list of 419. Returns null when the runtime does not name one.
 */
export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isResolvableTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/**
 * Whether a zone can be submitted.
 *
 * This is the *same* rule the API enforces (`isValidTimeZone` also asks `Intl`),
 * so it is not a second definition — it exists so a typed or pasted name is
 * refused before a round trip, and so the card can keep Save disabled rather than
 * offering a button that will 400. The API remains authoritative and its own
 * message ("Unknown time zone: X") is surfaced as-is when a write does fail.
 */
export function isSubmittableZone(zone: string): boolean {
  return isResolvableTimeZone(zone.trim());
}
