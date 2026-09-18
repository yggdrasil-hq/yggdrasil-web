import { runCounts, runTone, type RunTone } from "./test-runs";
import type { TestingResults, TestingRun } from "./types";

/**
 * Whether the feature's Testing stage has anything that reads as a failure.
 *
 * Issue #40: this used to be `run.report?.failed ?? 0 > 0`, which is the same
 * defect the header had — a run that failed without reporting has no `failed`
 * count and so was not a failure by this definition. It delegates to
 * `tallyRuns` now so the two cannot disagree about what "a failure" is.
 */
export function hasTestingFailures(results: TestingResults): boolean {
  return tallyRuns(results.runs).failingRuns > 0;
}

/**
 * A coarse duration for a usage block ("1.2s", "3m"). Distinct from
 * `test-runs.ts`'s `formatDuration`, which is for a run's *duration* and has a
 * different contract (`null` for unknown, "—" for unrenderable); both predate
 * issue #40 and are left as they are rather than merged in a fix for something
 * else.
 */
export function formatDuration(durationMs: number): string {
  if (durationMs >= 60_000) {
    return `${Math.round(durationMs / 60_000)}m`;
  }
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  return `${durationMs}ms`;
}

/**
 * ADR 015 items 9-11, issue #40: the pure half of the feature Testing tab.
 *
 * Same split as `test-runs.ts` and for the same reason — vitest runs in a `node`
 * environment with no React testing library, so anything with a branch worth
 * verifying lives in a module like this one rather than in JSX.
 *
 * **What this exists to fix.** The tab's header summed `report.failed` across
 * the reports it could see. A run that failed without ever producing a report
 * (a container that never started) contributed *nothing*, so a page whose every
 * row was a failure read "0 passed · 0 failed · 0 skipped" — a green-looking
 * header on a red page, which is worse than no header at all. The tally now
 * counts runs, not just reports, and names the runs it cannot count separately
 * rather than folding them into a zero.
 */

/** A run that finished without ever reporting: unknown, not passing. */
export function couldNotRun(run: TestingRun): boolean {
  if (run.report) return false;
  return run.status !== "pending" && run.status !== "running";
}

/**
 * Whether this run is one the tab should show under "Failed only" and tint red.
 *
 * Wider than `runTone`'s `fail`, which is about how a *job* ended: a run that
 * completed successfully and submitted no report is not a failed job but is a
 * failed outcome for the stage — nothing about the code was verified — and the
 * filter must not hide it, which is exactly what happened before (the run that
 * broke the pipeline was invisible in "failed only").
 */
export function isFailingRun(run: TestingRun): boolean {
  return runTone(run) === "fail" || couldNotRun(run);
}

export interface TestingTally {
  /** Assertion counts summed across runs that reported. */
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  /** Runs that produced a report. */
  reported: number;
  /** Runs that ended without one — counted nowhere above, and not a pass. */
  notReported: number;
  /** Runs that ended in `failed`/`cancelled`, or whose report recorded failures. */
  failingRuns: number;
  /** Runs still going. */
  inFlight: number;
  runs: number;
}

export function tallyRuns(runs: TestingRun[]): TestingTally {
  const tally: TestingTally = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    reported: 0,
    notReported: 0,
    failingRuns: 0,
    inFlight: 0,
    runs: runs.length,
  };

  for (const run of runs) {
    if (run.status === "pending" || run.status === "running") tally.inFlight += 1;

    const counts = runCounts(run);
    if (counts) {
      tally.reported += 1;
      tally.passed += counts.passed;
      tally.failed += counts.failed;
      tally.skipped += counts.skipped;
      tally.total += counts.total;
    } else if (couldNotRun(run)) {
      tally.notReported += 1;
    }

    if (isFailingRun(run)) tally.failingRuns += 1;
  }

  return tally;
}

/**
 * The header's one-line tally.
 *
 * `0 failed` is only ever printed next to nothing else when there genuinely is
 * nothing else — a run that could not report is named, so the line can never
 * read as reassurance about a group nothing was learned from.
 */
export function tallyLine(tally: TestingTally): string {
  const parts = [
    `${tally.passed} passed`,
    `${tally.failed} failed`,
    `${tally.skipped} skipped`,
  ];
  // Named rather than added to `failed`: an assertion that did not hold and a
  // group that never ran are different facts, and only one of them is about the
  // code. Both are counted, neither is hidden.
  if (tally.notReported > 0) {
    parts.push(`${tally.notReported} could not run`);
  }
  return parts.join(" · ");
}

export type TestingHeadlineTone = "active" | "fail" | "pass" | "empty";

export interface TestingHeadline {
  tone: TestingHeadlineTone;
  message: string;
}

/**
 * The banner above the results.
 *
 * The three terminal shapes are the three the API's Testing gate distinguishes
 * (see `api/src/features/testing-gate.ts`), and the copy says which one happened
 * because the consequence differs: a returned feature is waiting on a human to
 * resume implementation, an errored one needs its environment fixed first, and
 * conflating them sends an operator looking for a code problem that is not
 * there.
 */
export function testingHeadline(
  runs: TestingRun[],
  tally: TestingTally = tallyRuns(runs),
): TestingHeadline {
  if (runs.length === 0) {
    return { tone: "empty", message: "" };
  }
  if (tally.inFlight > 0) {
    return {
      tone: "active",
      message: "Testing is still running — progress will appear as each step reports.",
    };
  }
  if (tally.failed > 0) {
    const groups = tally.failingRuns === 1 ? "1 group" : `${tally.failingRuns} groups`;
    const extra =
      tally.notReported > 0
        ? ` A further ${tally.notReported === 1 ? "group" : `${tally.notReported} groups`} could not run at all.`
        : "";
    return {
      tone: "fail",
      message: `${tally.failed} assertion${tally.failed === 1 ? "" : "s"} failed in ${groups} — the feature was sent back to Implementation.${extra}`,
    };
  }
  if (tally.notReported > 0) {
    const groups =
      tally.notReported === 1 ? "A test group" : `${tally.notReported} test groups`;
    return {
      tone: "fail",
      message: `${groups} could not run, so nothing was verified. The feature is marked failed rather than sent back — this is an environment problem, not a code one. Open the run below for the reason.`,
    };
  }
  return {
    tone: "pass",
    message: `All ${tally.total} assertions passed — proceeding to review.`,
  };
}

/**
 * Why a run ended the way it did, or null when it passed.
 *
 * Covers the case the tab could not answer at all before: a run with no report
 * had *nothing* to show, so a failed row read "failed" and nothing else. The
 * job's own error is the only thing that says why, and it is the seed the next
 * implementation run needs.
 */
export function runFailureReason(run: TestingRun): string | null {
  if (run.status === "pending" || run.status === "running") return null;

  if (run.report && run.report.failed > 0) {
    const summary = run.report.summary.trim();
    if (summary) return summary;
    return `${run.report.failed} failing assertion${run.report.failed === 1 ? "" : "s"}`;
  }

  if (run.report) return null;

  const detail = run.lastError?.trim();
  if (detail) return detail;
  if (run.status === "cancelled") return "This run was cancelled before it reported.";
  if (run.status === "completed") return "This run finished without submitting a report.";
  return "This run ended before it could report a result.";
}

export { runTone, runToneClass, runStatusLabel } from "./test-runs";
export type { RunTone };
