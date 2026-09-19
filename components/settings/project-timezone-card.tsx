"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ErrorMessage } from "@/components/ui/error-message";
import { setProjectTimeZone } from "@/lib/api";
import { scheduleZoneWarning } from "@/lib/tests/schedules";
import {
  UTC_ZONE,
  browserTimeZone,
  effectiveZone,
  isSubmittableZone,
  zoneOptions,
  zonePreview,
} from "@/lib/tests/timezone-options";

interface ProjectTimeZoneCardProps {
  projectId: string;
  /** `PublicProject.timeZone` — the stored IANA name, or null when unset. */
  timeZone: string | null;
  /** Called with the value the server confirmed, so the parent's copy stays true. */
  onChange: (timeZone: string | null) => void;
}

/**
 * Issue #31 part 1's write half, on the project settings page.
 *
 * **Where the setting lives, and why.** Project settings, scoped to the project,
 * because that is what the API stores (`projects.settings.timezone`) and because a
 * project's tests are one suite with one schedule — a suite cannot fire at two
 * different times, so the answer has to belong to the suite's owner. The issue
 * noted the related question of *per-project vs. per-user*; per-user would be a
 * display preference (several people read the same schedule from different
 * zones), which is a different feature and would need its own storage. The labels
 * already handle that case honestly by naming the zone they are read in.
 *
 * **Why this is a select rather than a text box.** The API takes any resolvable
 * IANA name, and a typo there is a saved setting that the schedule card then has
 * to warn about. Offering the runtime's own list makes the common path a choice
 * instead of a spelling test. The list comes from `Intl`, the same source the API
 * validates against, so anything offered here is accepted there.
 *
 * **Why the offset is shown.** A zone name is easy to mis-pick and the offset is
 * what confirms it — and it is the one thing that makes the *reason* for the
 * setting visible, since the offset is what moves with DST where a fixed offset
 * could not.
 */
export function ProjectTimeZoneCard({
  projectId,
  timeZone,
  onChange,
}: ProjectTimeZoneCardProps) {
  /**
   * The picker's own value, seeded from the server's.
   *
   * A draft rather than a direct binding, because the point of the card is that
   * saving changes when jobs run — applying on change would make a mis-click an
   * audit event. `null` means "not yet touched", so the select shows the stored
   * value without this state having to be kept in sync with the prop.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const stored = timeZone?.trim() ?? "";
  const selected = draft ?? (stored === "" ? UTC_ZONE : stored);
  const dirty = draft !== null && draft !== stored;
  const current = effectiveZone(timeZone);

  const options = zoneOptions({ stored: timeZone });
  const preview = zonePreview(selected === UTC_ZONE ? UTC_ZONE : selected);
  const browserZone = browserTimeZone();

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      const result = await setProjectTimeZone(projectId, next);
      // From the response, not from what we sent: the server is the one that
      // decided what to store, and a card showing its own request would hide a
      // normalization.
      onChange(result.timeZone);
      setDraft(null);
      setSavedAt(Date.now());
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save the timezone.",
      );
    } finally {
      setSaving(false);
    }
  }

  const warning = scheduleZoneWarning(timeZone);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule timezone</CardTitle>
        <CardDescription>
          Every test schedule in this project is read in this timezone. It changes when a
          schedule fires, not how often — &ldquo;every 6 hours&rdquo; stays every 6 hours.
        </CardDescription>
      </CardHeader>
      <div className="space-y-3 px-4 pb-4">
        {warning ? <ErrorMessage className="text-sm text-amber-300">{warning}</ErrorMessage> : null}

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="text-sm text-mist">Timezone</span>
            <Select
              value={selected}
              disabled={saving}
              aria-label="Schedule timezone"
              onChange={(event) => setDraft(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <Button
            disabled={saving || !dirty || !isSubmittableZone(selected)}
            onClick={() => void save(selected === UTC_ZONE ? null : selected)}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {/* Clearing is its own action rather than a sentinel option in the
              list: "use the default" and "use UTC" are the same behaviour but
              different intents, and the stored value differs (null vs "UTC") in
              a way an operator reading the API should be able to tell apart. */}
          {stored !== "" ? (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => void save(null)}
            >
              {saving ? "Saving…" : "Use UTC"}
            </Button>
          ) : null}
        </div>

        {preview ? (
          <p className="text-sm text-mist">
            {selected} is <span className="font-mono">{preview.offset}</span> right now
            {preview.localTime ? (
              <>
                {" "}
                — currently <span className="font-mono">{preview.localTime}</span>
              </>
            ) : null}
            . A daily schedule at 09:00 runs at 09:00 there.
          </p>
        ) : null}

        {browserZone && browserZone !== selected ? (
          <p className="text-xs text-shadow">
            {/*
             * The quickest correct answer for most people, and the one thing that
             * saves scrolling a 419-entry list. Offered as a hint rather than the
             * default: the schedule belongs to the project, and its readers are
             * not necessarily in the setter's zone.
             */}
            This browser is on{" "}
            <button
              type="button"
              className="text-mist underline hover:text-frost"
              disabled={saving}
              onClick={() => setDraft(browserZone)}
            >
              {browserZone}
            </button>
            .
          </p>
        ) : null}

        {error ? <ErrorMessage className="text-sm text-destructive">{error}</ErrorMessage> : null}

        {/* `savedAt` rather than a boolean so a second save is a visible change;
            a static "Saved." would look like nothing happened on the third one. */}
        {savedAt !== null && !dirty && !saving ? (
          <p className="text-xs text-shadow">
            Saved. This project&rsquo;s schedules are now read in {current}.
          </p>
        ) : null}

        {!dirty && savedAt === null ? (
          <p className="text-xs text-shadow">
            Schedules are currently read in {current}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
