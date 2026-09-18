"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
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
import {
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

  useEffect(() => {
    let active = true;
    setError(null);
    fetchTestRuns(projectId, testId)
      .then((data) => {
        if (active) setRuns(data.runs);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load run history.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [projectId, testId, refreshKey]);

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
