"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { TestForm } from "@/components/tests/test-form";
import { TestRunHistory } from "@/components/tests/test-run-history";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchProject, fetchTest, triggerTestRun, updateTest } from "@/lib/api";
import type { Project, Test } from "@/lib/features/types";
import { appRoute } from "@/lib/config";
import { cronToPresetId, describeCustomCron, presetLabel } from "@/lib/tests/schedules";
import { describeTriggerRunFailure } from "@/lib/features/test-runs";
import { LoadFailure } from "@/components/ui/load-failure";

interface TestDetailClientProps {
  projectId: string;
  testId: string;
}

export function TestDetailClient({ projectId, testId }: TestDetailClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /**
   * Issue #31: the manual-run trigger.
   *
   * `runFeedback` is one slot for both outcomes rather than two booleans, because
   * only one of them can be true and the UI shows one line — a refusal and a
   * success cannot coexist, and modelling them as independent state invites the
   * state where neither is cleared.
   */
  const [runningNow, setRunningNow] = useState(false);
  const [runFeedback, setRunFeedback] = useState<
    { kind: "ok" | "error"; message: string } | null
  >(null);
  /**
   * Bumped after a successful dispatch so `TestRunHistory` refetches.
   *
   * Its own key rather than reusing `test.updatedAt`: a manual run does not touch
   * the test row at all (the API only creates a job), so `test.updatedAt` would
   * not change and the new run would not appear until something else did.
   */
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, testData] = await Promise.all([
          fetchProject(projectId),
          fetchTest(projectId, testId),
        ]);
        if (active) {
          setProject(projectData);
          setTest(testData);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load test",
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [projectId, testId]);

  async function handleSave(input: {
    name: string;
    specMarkdown: string;
    scheduleCron: string;
    enabled: boolean;
  }) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateTest(projectId, testId, input);
      setTest(updated);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save test");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setRunningNow(true);
    setRunFeedback(null);
    try {
      const { jobId } = await triggerTestRun(projectId, testId);
      setRunFeedback({
        kind: "ok",
        // No "job " prefix: API job ids already read `job_…`, so prefixing one
        // produced "job job_manu". The short form is shown because a full UUID is
        // noise in a one-line status, and the history below is where the run is
        // actually identified.
        message: `Run queued (${jobId.slice(0, 12)}) — it will appear in the history below as it starts.`,
      });
      setHistoryKey((key) => key + 1);
    } catch (runError) {
      // The API's own sentence is the useful part for both 409s — "already has a
      // run in progress" and "initialization must complete" each say what to do,
      // so it is surfaced rather than replaced with a generic failure line.
      setRunFeedback({
        kind: "error",
        message: describeTriggerRunFailure(
          runError instanceof Error ? runError.message : "Failed to start the run",
        ),
      });
    } finally {
      setRunningNow(false);
    }
  }

  if (error && !test) {
    return (
      <LoadFailure message={error} subject="test" />
    );
  }

  if (!project || !test) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading test…
      </div>
    );
  }

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <Button variant="ghost" className="mb-3 w-fit px-0 text-mist hover:text-frost" asChild>
          <Link href={appRoute(`/projects/${projectId}/tests`)}>← Back to tests</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">
            {test.name}
          </h1>
          <span
            className={
              test.enabled
                ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300"
                : "rounded-full bg-surface-03 px-2 py-0.5 text-xs font-medium text-shadow"
            }
          >
            {test.enabled ? "Enabled" : "Paused"}
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Run status</CardTitle>
                  <CardDescription>
                    Schedule: {presetLabel(test.scheduleCron, project.timeZone)}
                  </CardDescription>
                  {/*
                   * Issue #31: the custom-expression path had no zone shown at
                   * all, so a user typing `0 2 * * *` could not tell which clock
                   * the scheduler reads it against. The presets name their zone;
                   * this makes the free-text path say the same thing, in words,
                   * against the project's own zone now that one can be set.
                   */}
                  {cronToPresetId(test.scheduleCron) === "custom" ? (
                    <CardDescription>
                      {describeCustomCron(test.scheduleCron, project.timeZone)}
                    </CardDescription>
                  ) : null}
                  <CardDescription>
                    {/*
                     * Deliberately unchanged by a manual run: `last_run_at` is the
                     * scheduler's own bookkeeping (ADR 026 §7), and a manual run
                     * must not shift the next scheduled window. Saying "schedule
                     * last fired" rather than "last run" is what keeps that
                     * honest, so this line stays as it is while the history below
                     * gains a row.
                     */}
                    {test.lastRunAt
                      ? `Schedule last fired ${formatDistanceToNow(new Date(test.lastRunAt), { addSuffix: true })}`
                      : "No scheduled run yet — the next scheduled window will dispatch one."}
                  </CardDescription>
                </div>
                {/*
                 * Offered even while the test is paused: `enabled` governs the
                 * *schedule* ("run on schedule when checked"), and a paused suite
                 * is exactly the one a user wants to try once before re-enabling
                 * it. The API applies no `enabled` check here either, so gating the
                 * button would make the UI stricter than the endpoint for no
                 * stated reason.
                 */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runningNow}
                  onClick={() => void handleRunNow()}
                >
                  {runningNow ? "Starting…" : "Run now"}
                </Button>
              </div>
            </CardHeader>
            {runFeedback ? (
              <div className="px-4 pb-4">
                <p
                  className={
                    runFeedback.kind === "ok"
                      ? "text-sm text-emerald-300"
                      : "text-sm text-red-400"
                  }
                  /*
                   * `role="status"` so the outcome is announced rather than only
                   * appearing: pressing Run now does not move focus, and for a
                   * screen-reader user an unannounced line of text is a silent
                   * no-op. Polite rather than assertive — a queued run is not an
                   * emergency, and interrupting mid-sentence would be the wrong
                   * register for a success message.
                   */
                  role="status"
                >
                  {runFeedback.message}
                </p>
              </div>
            ) : null}
          </Card>

          <TestForm
            key={test.updatedAt}
            timeZone={project.timeZone}
            initialName={test.name}
            initialSpecMarkdown={test.specMarkdown}
            initialScheduleCron={test.scheduleCron}
            initialEnabled={test.enabled}
            submitLabel={saving ? "Saving…" : "Save changes"}
            submitting={saving}
            disableSubmitUnlessDirty
            error={error}
            onSubmit={handleSave}
          />

          {saved ? <p className="text-sm text-emerald-300">Changes saved.</p> : null}

          {/* ADR 026 (issue #16): the standalone Testing product's run history —
              what this test has actually done over time, as distinct from ADR
              015's per-feature Testing tab, which is about one feature branch. */}
          <TestRunHistory
            projectId={projectId}
            testId={testId}
            testEnabled={test.enabled}
            refreshKey={`${test.updatedAt}:${historyKey}`}
          />
        </div>
      </main>
    </AppShell>
  );
}
