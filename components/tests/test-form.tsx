"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  TEST_SCHEDULE_PRESETS,
  type TestSchedulePresetId,
  cronToPresetId,
  describeCustomCron,
  presetLabel,
  scheduleZoneName,
  scheduleZoneWarning,
} from "@/lib/tests/schedules";

interface TestFormProps {
  /**
   * Issue #31 part 1: the project's schedule zone, so the labels describe the
   * clock the scheduler will actually read. Required — not defaulted — because a
   * missing value would silently render UTC for a project that is not on UTC,
   * which is the false statement this parameter exists to remove. Pass
   * `project.timeZone`, `null` and all.
   */
  timeZone: string | null;
  initialName: string;
  initialSpecMarkdown: string;
  initialScheduleCron: string;
  initialEnabled: boolean;
  submitLabel: string;
  submitting?: boolean;
  disableSubmitUnlessDirty?: boolean;
  error?: string | null;
  onSubmit: (input: {
    name: string;
    specMarkdown: string;
    scheduleCron: string;
    enabled: boolean;
  }) => void | Promise<void>;
}

export function TestForm({
  timeZone,
  initialName,
  initialSpecMarkdown,
  initialScheduleCron,
  initialEnabled,
  submitLabel,
  submitting = false,
  disableSubmitUnlessDirty = false,
  error,
  onSubmit,
}: TestFormProps) {
  const [name, setName] = useState(initialName);
  const [specMarkdown, setSpecMarkdown] = useState(initialSpecMarkdown);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [presetId, setPresetId] = useState<TestSchedulePresetId>(
    cronToPresetId(initialScheduleCron),
  );
  const [customCron, setCustomCron] = useState(
    cronToPresetId(initialScheduleCron) === "custom" ? initialScheduleCron : "",
  );

  const scheduleCron =
    presetId === "custom" ? customCron.trim() : TEST_SCHEDULE_PRESETS[presetId].cron;

  const isDirty =
    name.trim() !== initialName.trim() ||
    specMarkdown !== initialSpecMarkdown ||
    enabled !== initialEnabled ||
    scheduleCron !== initialScheduleCron;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onSubmit({
      name: name.trim(),
      specMarkdown,
      scheduleCron,
      enabled,
    });
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test details</CardTitle>
        </CardHeader>
        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <label htmlFor="test-name" className="text-sm font-medium text-frost">
              Name
            </label>
            <Input
              id="test-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Auth flow"
              required
            />
          </div>

          <label className="flex items-center gap-3 text-sm text-mist">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4 rounded border-rime bg-surface-02"
            />
            Enabled — run on schedule when checked
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
          {/*
           * Issue #31 part 1: says which clock applies, now the project's rather
           * than a hardcoded UTC. Kept here as well as in the option labels
           * because a user reading only this line should learn it, and because it
           * is the one place that covers the *interval* presets too — those carry
           * no zone suffix of their own (their interval is zone-independent),
           * yet their phase is not.
           */}
          <CardDescription>Evaluated in {scheduleZoneName(timeZone)}. Minimum interval is 1 hour.</CardDescription>
        </CardHeader>
        <div className="space-y-4 px-4 pb-4">
          {/*
           * The one state the labels cannot explain: the project *has* a zone
           * stored, the labels say UTC anyway, and nothing says why. Shown only
           * when there is something wrong with the stored value — see
           * `scheduleZoneWarning`.
           */}
          {scheduleZoneWarning(timeZone) ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-mist">
              {scheduleZoneWarning(timeZone)}
            </p>
          ) : null}
          <select
            value={presetId}
            onChange={(event) => setPresetId(event.target.value as TestSchedulePresetId)}
            /* No placeholder and no visible label: this control was completely
               unnamed, so it announced only as "combo box". */
            aria-label="Test schedule"
            className="w-full rounded-md border border-rime bg-surface-02 px-3 py-2 text-sm text-frost"
          >
            {Object.entries(TEST_SCHEDULE_PRESETS).map(([id, preset]) => (
              <option key={id} value={id}>
                {presetLabel(preset.cron, timeZone)}
              </option>
            ))}
            <option value="custom">Custom cron expression</option>
          </select>

          {presetId === "custom" ? (
            <div className="space-y-1">
              <Input
                value={customCron}
                onChange={(event) => setCustomCron(event.target.value)}
                placeholder="0 9 * * *"
                aria-label="Custom cron expression"
                required
              />
              {/*
               * Issue #31: the presets name a zone, but the free-text path did
               * not — so this field was the one place a user configured a
               * schedule with no statement of which clock it is read against.
               * Leaving it unsaid is what makes "every night at 2am" silently
               * wrong by three or four hours for anyone not on the project's
               * zone.
               *
               * `aria-live` is inherited by nothing here, so this is plain text
               * beside the field rather than a status region: it changes as the
               * user types, and announcing every keystroke's interpretation
               * would be noise. It is reachable as a description by proximity.
               */}
              <p className="text-xs text-shadow">{describeCustomCron(customCron, timeZone)}</p>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Markdown spec</CardTitle>
          <CardDescription>
            Use <code className="text-frost">##</code> headings for ordered subtasks.
          </CardDescription>
        </CardHeader>
        <div className="px-4 pb-4">
          <textarea
            value={specMarkdown}
            onChange={(event) => setSpecMarkdown(event.target.value)}
            className="min-h-80 w-full rounded-md border border-rime bg-surface-02 p-4 font-mono text-sm text-frost"
            aria-label="Test spec markdown"
            required
          />
        </div>
      </Card>

      {error ? <ErrorMessage className="text-sm text-red-400">{error}</ErrorMessage> : null}

      <Button
        type="submit"
        disabled={submitting || (disableSubmitUnlessDirty && !isDirty)}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
