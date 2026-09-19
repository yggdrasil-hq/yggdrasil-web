"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import { RunRecording } from "@/components/tests/run-recording";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchTestRuns } from "@/lib/api";
import type { TestRunHistoryEntry } from "@/lib/features/types";
import { useLiveRelay } from "@/components/features/use-live-relay";
import { pollIntervalMsForRelay } from "@/lib/features/live-relay";
import {
  RUN_HISTORY_POLL_INTERVAL_MS,
  emptyHistoryMessage,
  formatDuration,
  hasRunDetail,
  historySummaryLine,
  runCounts,
  runDurationMs,
  runStatusLabel,
  runTone,
  runToneClass,
  runTriggerLabel,
  summarizeHistory,
} from "@/lib/features/test-runs";
import { cn } from "@/lib/utils";

interface TestRunHistoryProps {
  projectId: string;
  testId: string;
  /** Drives which empty state applies — a paused test will never run. */
  testEnabled: boolean;
  /** Bumped by the parent after a save, so the list refreshes. */
  refreshKey?: string;
}

const MAX_VISIBLE_RUNS = 25;

/**
 * ADR 026 (issue #16): a Test entity's run history, on the test detail page.
 *
 * Every decision this renders is made in `lib/features/test-runs.ts`, which is
 * where the unit tests live — this repo's vitest is node-only with no React
 * testing library, so the component is deliberately left with markup and data
 * fetching only.
 *
 * The rows are disclosure-style rather than linking to a per-run route: the
 * canonical run detail endpoint exists (`GET .../runs/:jobId`) and is what a
 * deep link would use, but the surrounding IA (ADR 017's
 * `design/projects/detail/tests/detail`) has exactly one route per test, and
 * adding a nested one would drift from the wireframe for no navigational gain.
 *
 * **Issue #100 added the live relay, and this surface was in the same state the
 * Testing tab was in before issue #25 converted it: it fetched once on mount and
 * nothing ever refreshed it.** A run that a schedule dispatched, or that a user
 * started from the button above, appeared only on a manual reload — so the page
 * that exists to answer "what has this test been doing?" could not show a run
 * starting, and its progress, and its result, without being reloaded. It now
 * subscribes to the `test` scope and re-reads on signal (a burst coalesces into one
 * request), with `RUN_HISTORY_POLL_INTERVAL_MS` as the fallback while the relay is
 * not live.
 *
 * **Why the `test` scope rather than the feature's.** A feature-driven `test_run`
 * reaches both topics (the API fans out per scope), but this page knows only the
 * test: it was reached by `/tests/:testId`, it has no feature id, and subscribing to
 * a feature would be a subscription to a resource this page never read. The scope it
 * holds is the one whose REST read it mirrors — `GET .../tests/:testId/runs` — which
 * is also what the socket's authoriser checks (ADR 019 item 7).
 *
 * ADR 019 item 7 shapes the conversion: a frame carries a *signal*, never state, so
 * `fetchTestRuns` remains the only thing that puts a value on screen and a frame
 * cannot disagree with the API. An unread run is therefore never invented — the list
 * re-reads and shows whatever the API says.
 */
export function TestRunHistory({
  projectId,
  testId,
  testEnabled,
  refreshKey,
}: TestRunHistoryProps) {
  const [runs, setRuns] = useState<TestRunHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  /*
   * A ref rather than an effect-local flag, because a re-read now arrives from three
   * places — the mount, the interval and a relay frame — and only a ref guards all
   * of them. The `active` flag this replaced was correct for the single mount read it
   * belonged to and is exactly what a second caller would have got wrong.
   */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await fetchTestRuns(projectId, testId);
      if (!mountedRef.current) return;
      setRuns(data.runs);
      setError(null);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load run history.",
      );
    }
    // `refreshKey` is a dependency even though the body does not read it, and that is
    // the mechanism rather than an oversight: the parent bumps it after a manual
    // dispatch, a new `poll` identity re-runs the effect below, and the new run
    // appears at once. Dropping it here would make the "Run now" button's own refresh
    // silently stop working.
  }, [projectId, testId, refreshKey]);

  /**
   * The run history's own socket, which the API routes to `test:<testId>`.
   *
   * `onEvent` re-reads rather than applying anything: the frame says "a run changed",
   * not what it changed to (ADR 019 item 7). `onDelta` is deliberately not passed — a
   * run's narration is not rendered here, and a handler that ignored it would be
   * noise pretending to be a feature.
   */
  const { isLive } = useLiveRelay({
    projectId,
    scope: { kind: "test", id: testId },
    onEvent: () => void poll(),
  });

  /*
   * Two effects, split by what each is *scoped to* rather than by what it calls — the
   * shape issue #98 settled for every relay surface, and `src/features/relay-surfaces.test.ts`
   * is what keeps it from drifting.
   *
   * The first is identity-scoped and clears the list and the error, so switching tests
   * shows the new test rather than the previous one's runs and stale failure. The
   * dependency list is the identity and nothing else, and that is deliberate — it must
   * not include `refreshKey`: `TestDetailClient` bumps that after every manual dispatch,
   * so clearing here would blank the history on the very click that asked for a refresh,
   * and an `isLive` change would blank it again every time the socket connected or
   * dropped. A visible regression caused purely by the relay's health is the coupling
   * ADR 019 item 7 exists to prevent.
   *
   * The second is keyed on `[poll, isLive]` and **reads immediately as well as on its
   * interval**, so a relay connect is a catch-up and not only a change of period. That
   * read is not a duplicate of the mount read: the server registers this subscription
   * only once the `subscribe` frame has been authorised, and the hub keeps no backlog
   * (`api/src/live/hub.ts` fans out to whoever is subscribed at that instant), so
   * events published between the mount read and that registration reach nobody.
   * Deferring the read to the interval would hold that window open for up to
   * `LIVE_SAFETY_POLL_INTERVAL_MS`.
   */
  useEffect(() => {
    setRuns(null);
    setError(null);
  }, [projectId, testId]);

  useEffect(() => {
    void poll();
    const interval = setInterval(
      () => void poll(),
      pollIntervalMsForRelay({ isLive, fallbackMs: RUN_HISTORY_POLL_INTERVAL_MS }),
    );
    return () => clearInterval(interval);
  }, [poll, isLive]);

  const summary = summarizeHistory(runs ?? []);
  const summaryLine = historySummaryLine(summary);
  const visible = (runs ?? []).slice(0, MAX_VISIBLE_RUNS);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Run history</CardTitle>
          {summary.runs > 0 ? (
            <span
              className={cn(
                "text-xs font-medium",
                summary.latestFailed ? "text-status-rejected" : "text-shadow",
              )}
            >
              {summary.latestFailed ? "Currently failing" : "Currently passing"}
            </span>
          ) : null}
        </div>
        <CardDescription>
          {summaryLine ??
            "Scheduled runs land here, with their report and steps."}
        </CardDescription>
      </CardHeader>

      {error ? <ErrorMessage className="mt-3 text-sm text-destructive">{error}</ErrorMessage> : null}

      {!error && runs === null ? (
        <p className="mt-3 text-sm text-mist">Loading run history…</p>
      ) : null}

      {!error && runs !== null && runs.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-rime px-4 py-5 text-sm text-shadow">
          {emptyHistoryMessage(testEnabled)}
        </div>
      ) : null}

      {visible.length > 0 ? (
        <>
          <ul className="mt-4 space-y-2">
            {visible.map((run) => {
              const counts = runCounts(run);
              const open = expanded === run.jobId;
              const expandable = hasRunDetail(run);
              return (
                <li
                  key={run.jobId}
                  className="rounded-md border border-rime-soft px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={cn("text-sm font-medium", runToneClass(runTone(run)))}
                      aria-hidden
                    >
                      {runTone(run) === "pass"
                        ? "\u2713"
                        : runTone(run) === "fail"
                          ? "\u2717"
                          : "\u2022"}
                    </span>
                    <span className="text-[13px] text-frost">
                      {runStatusLabel(run.status)}
                    </span>
                    <span className="text-xs text-shadow">{runTriggerLabel(run)}</span>
                    {run.ref ? (
                      <span className="font-mono text-xs text-shadow">{run.ref}</span>
                    ) : null}
                    <span className="text-xs text-shadow">
                      {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                    </span>
                    <span className="text-xs text-shadow">
                      {formatDuration(runDurationMs(run))}
                    </span>
                    <span className="flex-1" />
                    {counts ? (
                      <span className="text-xs text-mist">
                        {counts.passed} passed
                        {counts.failed > 0 ? (
                          <span className="text-status-rejected">
                            {" "}
                            · {counts.failed} failed
                          </span>
                        ) : null}
                        {counts.skipped > 0 ? ` · ${counts.skipped} skipped` : null}
                      </span>
                    ) : (
                      <span className="text-xs text-shadow">No report</span>
                    )}
                    {expandable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-2 py-1 text-xs text-mist hover:text-frost"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : run.jobId)}
                      >
                        {open ? "Hide" : "Details"}
                      </Button>
                    ) : null}
                  </div>

                  {open ? <RunDetail run={run} projectId={projectId} /> : null}
                </li>
              );
            })}
          </ul>

          {runs && runs.length > visible.length ? (
            <p className="mt-3 text-xs text-shadow">
              Showing the {MAX_VISIBLE_RUNS} most recent of {runs.length} runs.
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function RunDetail({
  run,
  projectId,
}: {
  run: TestRunHistoryEntry;
  projectId: string;
}) {
  return (
    <div className="mt-3 space-y-3 border-t border-rime-soft pt-3">
      {run.report ? (
        <div className="text-[13px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-frost">
            <span>{run.report.passed} passed</span>
            <span>{run.report.failed} failed</span>
            <span>{run.report.skipped} skipped</span>
            <span>{run.report.total} total</span>
            {run.report.coveragePercent != null ? (
              <span>{run.report.coveragePercent}% coverage</span>
            ) : null}
          </div>
          {run.report.summary ? (
            <p className="mt-1 text-xs text-shadow">{run.report.summary}</p>
          ) : null}
          {run.report.failingTests.length > 0 ? (
            <ul className="mt-2 list-disc pl-4 text-xs text-status-rejected">
              {run.report.failingTests.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-shadow">
          This run did not report a result
          {run.status === "running" || run.status === "pending"
            ? " yet — it is still in progress."
            : " — it ended before the agent could submit one."}
        </p>
      )}

      {run.steps.length > 0 ? (
        <div className="space-y-1.5">
          {run.steps.map((step) => (
            <div
              key={`${run.jobId}-${step.name}`}
              className="flex items-center gap-2.5 rounded-md border border-rime-soft px-3 py-2 text-[13px]"
            >
              <span
                className={cn(
                  "shrink-0 text-sm",
                  step.status === "pass"
                    ? "text-status-approved"
                    : "text-status-rejected",
                )}
                aria-hidden
              >
                {step.status === "pass" ? "\u2713" : "\u2717"}
              </span>
              <span className="min-w-0 flex-1 text-frost">{step.name}</span>
              {step.details ? (
                /*
                  Wraps instead of truncating. This lives inside an expanded
                  run's detail view, which the user opened precisely to read this
                  — and the step details are a test runner's own words about what
                  happened, with no other surface showing them. Truncating the
                  only copy of the answer, inside the disclosure that exists to
                  reveal it, left the user with an ellipsis and nowhere to look.
                */
                <span className="max-w-[50%] break-words text-xs text-shadow">
                  {step.details}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <RunRecording run={run} projectId={projectId} />
    </div>
  );
}
