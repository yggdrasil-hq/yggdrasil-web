import type { JobStatus, TestRunHistoryEntry } from "./types";

/**
 * ADR 026 (issue #16): the pure half of a Test entity's run history.
 *
 * The Web app has no React testing library (deliberately — vitest runs in a
 * `node` environment), so every decision the run-history UI makes lives here
 * where it can be unit-tested: what counts as a failure, how a duration is
 * rendered, how a run is labelled, and what the header summary says. The
 * component that renders these is left with nothing but markup.
 */

export interface RunCounts {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

/**
 * The minimum a run has to expose for the tone/status/count helpers below.
 *
 * Deliberately structural rather than `TestRunHistoryEntry`: the feature
 * Testing tab's runs (`TestingRun`, ADR 015) and a Test entity's history rows
 * (ADR 026) are two different API shapes that answer the same three questions —
 * how did it end, what did it report, which steps failed — and duplicating these
 * helpers for the second shape is how the two surfaces drift into colouring the
 * same state differently (issue #40's "failures are not visually distinguished").
 */
export interface RunnableRun {
  status: JobStatus;
  report: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  } | null;
  steps: Array<{ status: "pass" | "fail" }>;
}

export type RunTone = "pass" | "fail" | "active" | "idle";

/**
 * The counts a run reported, or null when it never reported.
 *
 * Null is load-bearing rather than an empty zero-set: a run that is still
 * going, or that failed before it could report, has genuinely *unknown*
 * results. Rendering it as "0 passed, 0 failed" would read as a clean run and
 * hide exactly the runs an operator most needs to see.
 */
export function runCounts(run: RunnableRun): RunCounts | null {
  if (!run.report) return null;
  return {
    passed: run.report.passed,
    failed: run.report.failed,
    skipped: run.report.skipped,
    total: run.report.total,
  };
}

/**
 * Server-computed duration, passed through unchanged. Deliberately does *not*
 * fall back to `completedAt - createdAt`: that span includes queue time, which
 * for a scheduled run can be minutes, and quietly presenting it as run duration
 * would be a fabricated number rather than a missing one.
 */
export function runDurationMs(run: TestRunHistoryEntry): number | null {
  return run.durationMs;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return seconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m ${seconds}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Who started the run — the distinction the feature Testing tab cannot show. */
export function runTriggerLabel(run: TestRunHistoryEntry): string {
  if (run.trigger === "schedule") return "Scheduled";
  if (run.trigger === "feature") return "Feature branch";
  return "Run";
}

export function runStatusLabel(status: JobStatus): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/**
 * How a run should read at a glance.
 *
 * A completed run that reported failures is a failure for this purpose — that
 * is the only thing an operator scanning history is looking for — while a
 * completed run with no report stays "idle" rather than being tinted either way,
 * because there is nothing to judge.
 */
export function runTone(run: RunnableRun): RunTone {
  if (run.status === "failed" || run.status === "cancelled") return "fail";
  if (run.status === "pending" || run.status === "running") return "active";
  const counts = runCounts(run);
  if (!counts) return "idle";
  return counts.failed > 0 ? "fail" : "pass";
}

export function runToneClass(tone: RunTone): string {
  switch (tone) {
    case "pass":
      return "text-status-approved";
    case "fail":
      return "text-status-rejected";
    case "active":
      return "text-bifrost";
    default:
      return "text-shadow";
  }
}

/** Steps that did not pass, in report order — the detail view's shortlist. */
export function failingSteps(run: RunnableRun): RunnableRun["steps"] {
  return run.steps.filter((step) => step.status === "fail");
}

/**
 * Whether expanding a row would actually show anything. Used to keep rows that
 * carry no detail (a queued run, a run with no report and no steps) from
 * offering a disclosure that opens onto nothing.
 */
export function hasRunDetail(run: TestRunHistoryEntry): boolean {
  if (run.steps.length > 0) return true;
  if (!run.report) return false;
  return run.report.summary.length > 0 || run.report.failingTests.length > 0;
}

export interface HistorySummary {
  runs: number;
  /** Runs that produced a report — the denominator for the pass/fail totals. */
  reported: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Newest run, or null for a test that has never run. */
  latest: TestRunHistoryEntry | null;
  /** True when the newest reported run had failures. */
  latestFailed: boolean;
}

/**
 * Rolls a page of history into the counts the header shows.
 *
 * Sums only runs that reported, so a queue of pending runs cannot dilute the
 * picture, and `latestFailed` looks at the newest run specifically — "is this
 * currently red?" is the question a history header should answer, and an
 * average over history cannot answer it.
 */
export function summarizeHistory(
  runs: TestRunHistoryEntry[],
): HistorySummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let reported = 0;

  for (const run of runs) {
    const counts = runCounts(run);
    if (!counts) continue;
    reported += 1;
    passed += counts.passed;
    failed += counts.failed;
    skipped += counts.skipped;
  }

  const latest = runs[0] ?? null;
  const latestCounts = latest ? runCounts(latest) : null;

  return {
    runs: runs.length,
    reported,
    passed,
    failed,
    skipped,
    latest,
    latestFailed: Boolean(latestCounts && latestCounts.failed > 0),
  };
}

/** The one-line header, or null when there is nothing to summarise yet. */
export function historySummaryLine(summary: HistorySummary): string | null {
  if (summary.runs === 0) return null;
  if (summary.reported === 0) {
    return summary.runs === 1 ? "1 run, no report yet" : `${summary.runs} runs, no report yet`;
  }
  const runWord = summary.reported === 1 ? "run" : "runs";
  const skipped = summary.skipped > 0 ? ` · ${summary.skipped} skipped` : "";
  return `${summary.passed} passed · ${summary.failed} failed${skipped} across ${summary.reported} reported ${runWord}`;
}

/**
 * What an empty history says. A paused test and a fresh one are genuinely
 * different situations — conflating them is what makes an empty state useless,
 * since one resolves itself at the next window and the other never will.
 *
 * (A test that *has* history which is all failures is not an empty state at
 * all; that shows through `historySummaryLine` and `latestFailed` instead.)
 */
export function emptyHistoryMessage(enabled: boolean): string {
  if (!enabled) {
    return "This test is paused, so nothing is scheduled to run. Enable it to resume its schedule.";
  }
  return "No runs yet — the scheduler dispatches this test at its next scheduled window.";
}
