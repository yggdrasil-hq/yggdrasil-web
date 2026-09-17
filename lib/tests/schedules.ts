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

export const DEFAULT_TEST_SPEC = `# Test name

Describe what this test verifies against the main-branch preview.

## Step 1: First action
Explain what the agent should do and what success looks like.

## Step 2: Second action
Add more \`##\` sections for each subtask the agent should run in order.
`;
