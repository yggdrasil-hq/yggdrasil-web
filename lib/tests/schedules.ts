export const TEST_SCHEDULE_PRESETS = {
  hourly: { cron: "0 * * * *", label: "Every hour" },
  every6Hours: { cron: "0 */6 * * *", label: "Every 6 hours" },
  // ADR 026: schedules are evaluated in UTC (there is no per-project timezone
  // concept), so the clock-time presets name UTC explicitly. Leaving them as
  // a bare "9:00 AM" would read as the viewer's local time and quietly promise
  // a run three or four hours away from when it actually happens.
  daily9am: { cron: "0 9 * * *", label: "Daily at 09:00 UTC" },
  weeklyMonday9am: { cron: "0 9 * * 1", label: "Weekly on Monday at 09:00 UTC" },
} as const;

export type TestSchedulePresetId = keyof typeof TEST_SCHEDULE_PRESETS | "custom";

export function cronToPresetId(cron: string): TestSchedulePresetId {
  for (const [id, preset] of Object.entries(TEST_SCHEDULE_PRESETS)) {
    if (preset.cron === cron) {
      return id as keyof typeof TEST_SCHEDULE_PRESETS;
    }
  }
  return "custom";
}

export function presetLabel(cron: string): string {
  const presetId = cronToPresetId(cron);
  if (presetId === "custom") {
    return cron;
  }
  return TEST_SCHEDULE_PRESETS[presetId].label;
}

/**
 * What a custom cron expression means, spelled out in UTC.
 *
 * **Why this exists (issue #31).** The presets name their zone ("Daily at 09:00
 * UTC"), but the custom-expression path showed a bare text box — so a user
 * typing `0 2 * * *` for "every night at 2am" had to know that the scheduler
 * reads it as UTC, and had to do the arithmetic themselves. The per-project
 * timezone setting that would let them pick a zone does not exist yet; making the
 * *current* behaviour legible does not need it, and a user who cannot tell what
 * they configured cannot tell whether a fix is coming.
 *
 * Deliberately covers only the shapes worth naming and says so plainly otherwise.
 * A full cron-to-English renderer is a dependency and a maintenance burden for a
 * text box that already accepts anything the API does; the honest fallback ("runs
 * on <expression>, evaluated in UTC") is accurate for every accepted expression,
 * which is the property that matters. It never claims to have understood more
 * than it did.
 *
 * The field count is checked here only to decide whether to *describe* the
 * expression. It is not validation and does not gate the form: the API validates
 * (ADR 026's `isValidCronExpression` plus the minimum-interval rule), and a
 * second, weaker validator in the client would reject nothing the API accepts
 * while appearing to be authoritative about what it does.
 */
export function describeCustomCronUtc(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some((field) => field === "")) {
    return "Enter a five-field cron expression (minute, hour, day, month, weekday). It is evaluated in UTC.";
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
    return `Runs every day at ${pad(hour)}:${pad(minute)} UTC.`;
  }

  // Weekdays only, the other shape a person types on purpose.
  if (
    isNumber(minute) &&
    isNumber(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "1-5"
  ) {
    return `Runs Monday to Friday at ${pad(hour)}:${pad(minute)} UTC.`;
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
      ? "Runs every hour, on the hour (UTC)."
      : `Runs every hour at ${pad(minute)} minutes past (UTC).`;
  }

  return `Runs on \`${cron.trim()}\`, evaluated in UTC.`;
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
