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
  describeCustomCronUtc,
} from "@/lib/tests/schedules";

interface TestFormProps {
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
           * Says the zone up front as well as under the field: the presets name
           * UTC in their own labels, and a user reading only this card's
           * description should still learn which clock applies.
           */}
          <CardDescription>Evaluated in UTC. Minimum interval is 1 hour.</CardDescription>
        </CardHeader>
        <div className="space-y-4 px-4 pb-4">
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
                {preset.label}
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
               * Issue #31: the presets name UTC (see `TEST_SCHEDULE_PRESETS`),
               * but the free-text path did not — so this field was the one place
               * a user configured a schedule with no statement of which clock it
               * is read against. The per-project timezone setting that would let
               * them choose a zone does not exist yet; saying plainly what the
               * current behaviour is does not depend on it, and leaving it
               * unsaid is what makes "every night at 2am" silently wrong.
               *
               * `aria-live` is inherited by nothing here, so this is plain text
               * beside the field rather than a status region: it changes as the
               * user types, and announcing every keystroke's interpretation
               * would be noise. It is reachable as a description by proximity.
               */}
              <p className="text-xs text-shadow">{describeCustomCronUtc(customCron)}</p>
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
