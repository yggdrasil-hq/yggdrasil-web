/**
 * The zone a schedule is read in when a project has not set one (ADR 026).
 *
 * UTC is also the API's own fallback for a stored zone it cannot resolve, which
 * is why this is the value used when a zone is missing *or* unusable: the point
 * of a label is to say what will actually happen, and the scheduler falls back
 * to UTC in both cases.
 */
export const DEFAULT_SCHEDULE_ZONE = "UTC";

/**
 * Whether the runtime can resolve an IANA zone name.
 *
 * **Why this exists at all (issue #31).** `PublicProject.timeZone` is returned
 * **as stored**, deliberately: validation is a write concern, and silently
 * rewriting a bad value to `null` would hide it from the operator who has to fix
 * it. The API's own mapper says so. So a non-null zone is *not* guaranteed to be
 * renderable, and the client must not assume it is — hence a check rather than
 * string interpolation.
 *
 * `Intl` rather than a hardcoded list: the runtime's own ICU data is exactly what
 * decides whether a name means anything here, and a second list would drift from
 * it. (The API resolves zones with its own `Intl`; the two agree for every IANA
 * name in practice, and `scheduleZoneWarning` covers the case where they might
 * not.)
 */
export function isResolvableTimeZone(timeZone: string): boolean {
  try {
    // Constructing the formatter is the check — an unknown name throws a
    // RangeError, and an empty string an InvalidTimeZoneError.
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone name to show beside a wall-clock schedule time.
 *
 * Returns the project's zone when it has one the runtime can resolve, and
 * `DEFAULT_SCHEDULE_ZONE` otherwise. Never returns an empty string, so a caller
 * can interpolate it into a sentence without a conditional.
 */
export function scheduleZoneName(timeZone: string | null | undefined): string {
  const trimmed = timeZone?.trim();
  if (!trimmed) return DEFAULT_SCHEDULE_ZONE;
  return isResolvableTimeZone(trimmed) ? trimmed : DEFAULT_SCHEDULE_ZONE;
}

/**
 * A sentence for the case where the project has a stored zone the runtime cannot
 * use, or `null` when there is nothing wrong.
 *
 * Silence in the normal case, because the labels already name the effective zone
 * and repeating "and your zone is fine" beside every schedule is noise. This is
 * for the one state that is otherwise invisible: the operator set a zone, the
 * label says UTC, and nothing explains why. Without it that reads as the setting
 * having been ignored.
 */
export function scheduleZoneWarning(
  timeZone: string | null | undefined,
): string | null {
  const trimmed = timeZone?.trim();
  if (!trimmed || isResolvableTimeZone(trimmed)) return null;
  return `This project's stored timezone “${trimmed}” is not one this browser can resolve, so schedules are shown and read in ${DEFAULT_SCHEDULE_ZONE}.`;
}

export const TEST_SCHEDULE_PRESETS = {
  hourly: { cron: "0 * * * *", label: "Every hour" },
  every6Hours: { cron: "0 */6 * * *", label: "Every 6 hours" },
  // ADR 026: the clock-time presets name no zone of their own — the zone is the
  // project's, and `presetLabel` appends the effective one. Hardcoding "UTC"
  // here, which is what this used to do, was honest only while no project could
  // set a zone (issue #31 part 1; `PublicProject.timeZone` now exists).
  //
  // The interval presets deliberately carry no zone suffix: "every 6 hours" is
  // the same interval in every zone. A zone shifts such a schedule's *phase*
  // (its 06:00/12:00/18:00/00:00 boundaries land elsewhere), but the interval a
  // user is choosing is unchanged, and the Schedule card states the zone for the
  // schedule as a whole — so suffixing these would add a word per option without
  // changing any decision.
  daily9am: { cron: "0 9 * * *", label: "Daily at 09:00" },
  weeklyMonday9am: { cron: "0 9 * * 1", label: "Weekly on Monday at 09:00" },
} as const;

/**
 * Presets whose meaning depends on which clock they are read against.
 *
 * A fixed hour-of-day is a wall-clock time and moves with the zone; a fixed
 * *interval* does not. Derived from the preset rather than restated as a flag on
 * each entry, so the two cannot disagree.
 *
 * The test is "is the hour a plain number", not "is the hour not a wildcard".
 * The every-6-hours preset's hour field is a *step*, which is an interval, not an
 * hour of the day — every 6 hours is the same interval in every zone — and a bare
 * wildcard is likewise outside it. Only a literal hour names a time a user would
 * expect to move with their zone.
 *
 * (Spelled out rather than written as the expression: a cron step contains the
 * characters that end a block comment, which is how this doc comment silently
 * terminated itself the first time it was written.)
 */
function namesAClockTime(cron: string): boolean {
  const [, hour] = cron.trim().split(/\s+/);
  return hour !== undefined && /^\d{1,2}$/.test(hour);
}

export type TestSchedulePresetId = keyof typeof TEST_SCHEDULE_PRESETS | "custom";

export function cronToPresetId(cron: string): TestSchedulePresetId {
  for (const [id, preset] of Object.entries(TEST_SCHEDULE_PRESETS)) {
    if (preset.cron === cron) {
      return id as keyof typeof TEST_SCHEDULE_PRESETS;
    }
  }
  return "custom";
}

/**
 * How a schedule reads, with the zone the scheduler will use.
 *
 * The zone is a parameter with a UTC default rather than being read from a store,
 * so every caller has to say which project's zone it is describing — the failure
 * mode this replaced was a label that named UTC unconditionally, which is a
 * false statement the moment a project sets a zone.
 */
export function presetLabel(cron: string, timeZone?: string | null): string {
  const presetId = cronToPresetId(cron);
  if (presetId === "custom") {
    return cron;
  }
  const preset = TEST_SCHEDULE_PRESETS[presetId];
  return namesAClockTime(preset.cron)
    ? `${preset.label} ${scheduleZoneName(timeZone)}`
    : preset.label;
}

/**
 * What a custom cron expression means, spelled out against the zone the
 * scheduler will actually read it in.
 *
 * **Why this exists (issue #31).** The presets named their zone ("Daily at 09:00
 * UTC"), but the custom-expression path showed a bare text box — so a user typing
 * `0 2 * * *` for "every night at 2am" had to know which clock the scheduler used,
 * and had to do the arithmetic themselves. Leaving it unsaid is what makes
 * "every night at 2am" silently wrong, and it is wrong by three or four hours for
 * anyone not on UTC.
 *
 * **Renamed from `describeCustomCronUtc` (issue #31 part 1).** The old name said
 * the zone in the identifier because UTC was hardcoded in the sentences; now the
 * zone is a parameter, so a name asserting UTC would be a second, contradictory
 * statement about the same behaviour. The zone is required rather than defaulted
 * so a caller cannot silently get the wrong clock — see `presetLabel` for the
 * same reasoning.
 *
 * Deliberately covers only the shapes worth naming and says so plainly otherwise.
 * A full cron-to-English renderer is a dependency and a maintenance burden for a
 * text box that already accepts anything the API does; the honest fallback ("runs
 * on <expression>, evaluated in <zone>") is accurate for every accepted
 * expression, which is the property that matters. It never claims to have
 * understood more than it did.
 *
 * The field count is checked here only to decide whether to *describe* the
 * expression. It is not validation and does not gate the form: the API validates
 * (ADR 026's `isValidCronExpression` plus the minimum-interval rule), and a
 * second, weaker validator in the client would reject nothing the API accepts
 * while appearing to be authoritative about what it does.
 */
export function describeCustomCron(
  cron: string,
  timeZone: string | null | undefined,
): string {
  const zone = scheduleZoneName(timeZone);
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some((field) => field === "")) {
    return `Enter a five-field cron expression (minute, hour, day, month, weekday). It is evaluated in ${zone}.`;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  // `mm hh * * *` — the common "at a time every day" case, which is also the one
  // ADR 026's DST note is about.
  if (
    isNumber(minute) &&
    isNumber(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `Runs every day at ${pad(hour)}:${pad(minute)} ${zone}.`;
  }

  // Weekdays only, the other shape a person types on purpose.
  if (
    isNumber(minute) &&
    isNumber(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "1-5"
  ) {
    return `Runs Monday to Friday at ${pad(hour)}:${pad(minute)} ${zone}.`;
  }

  // Hourly at a fixed minute: `0 * * * *`.
  if (
    isNumber(minute) &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return minute === "0"
      ? `Runs every hour, on the hour (${zone}).`
      : `Runs every hour at ${pad(minute)} minutes past (${zone}).`;
  }

  return `Runs on \`${cron.trim()}\`, evaluated in ${zone}.`;
}

function isNumber(field: string): boolean {
  return /^\d{1,2}$/.test(field);
}

/** Zero-padded, so a bare `2` reads as `02` in `02:00` rather than `2:0`. */
function pad(field: string): string {
  return field.padStart(2, "0");
}

export const DEFAULT_TEST_SPEC = `# Test name

Describe what this test verifies against the main-branch preview.

## Step 1: First action
Explain what the agent should do and what success looks like.

## Step 2: Second action
Add more \`##\` sections for each subtask the agent should run in order.
`;
