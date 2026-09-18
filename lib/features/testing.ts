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
 * A run that submitted a report which verified nothing.
 *
 * **Why this is its own state.** A `script_test_run` on an install with no
 * runner image now submits a well-formed report saying so — zero passed, zero
 * failed, one skipped — rather than dying without one. That report is accurate,
 * but every existing signal reads it as a pass: `failed` is 0, so `runTone`
 * says `pass`, so the row renders green and "Failed only" hides it. The page
 * then contradicts itself, because the headline (correctly) says nothing was
 * verified while the row underneath it looks like a clean run. Reproduced on
 * the shipped Testing tab.
 *
 * The condition is "passed nothing **and** failed nothing", not `skipped > 0`:
 * a suite that runs some tests and skips others has verified something, and
 * calling that unverified would be its own lie. Only a report with no results
 * at all in it is nothing.
 */
export function verifiedNothing(run: TestingRun): boolean {
  if (!run.report) return false;
  if (run.status === "pending" || run.status === "running") return false;
  return run.report.passed === 0 && run.report.failed === 0;
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
  return runTone(run) === "fail" || couldNotRun(run) || verifiedNothing(run);
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
  /**
   * Runs that reported and verified nothing (all skips). Counted separately
   * from `notReported` because the fix is different: this one is a *decision*
   * the installation made, and the report says which.
   */
  unverified: number;
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
    unverified: 0,
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
      // Checked inside this branch, not after it: a run that reported only
      // skips *has* a report, so it takes the counts path above and would never
      // reach a later `else if`.
      if (verifiedNothing(run)) tally.unverified += 1;
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
  // "skipped" is already in the counts above, so this reads as "of which, none
  // were results" rather than as a second skip tally.
  if (tally.unverified > 0) {
    parts.push(`${tally.unverified} verified nothing`);
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
    const alsoUnverified =
      tally.unverified > 0
        ? ` ${tally.unverified === 1 ? "Another group" : `${tally.unverified} other groups`} reported only skips.`
        : "";
    return {
      tone: "fail",
      message: `${groups} could not run, so nothing was verified. The feature is marked failed rather than sent back — this is an environment problem, not a code one. Open the run below for the reason.${alsoUnverified}`,
    };
  }
  // `total` counts skipped tests too, so "nothing here is a result" has to be
  // tested against the counts that are results — an all-skips report has
  // `total: 1` and would slip past a `total === 0` check into the pass branch.
  if (tally.unverified > 0 && tally.passed + tally.failed === 0) {
    // Every run reported only skips. Saying "all 0 assertions passed" here is
    // the one wrong answer that costs the most, so this is its own message.
    const groups =
      tally.unverified === 1 ? "This test group" : `All ${tally.unverified} test groups`;
    return {
      tone: "fail",
      message: `${groups} reported only skips, so nothing was verified. That is a decision this installation made rather than a result about the code — open a run below to see which.`,
    };
  }
  if (tally.unverified > 0) {
    // Some groups verified something, others did not: a pass with a caveat
    // rather than a pass, because the caveat is what a reader needs.
    return {
      tone: "pass",
      message: `${tally.passed} assertion${tally.passed === 1 ? "" : "s"} passed, but ${tally.unverified === 1 ? "1 test group" : `${tally.unverified} test groups`} reported only skips and verified nothing.`,
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

  // A report that verified nothing is now tinted like a failure (it is one for
  // the stage, even though no job failed), so it has to say why — otherwise the
  // row is red with no explanation, which is the defect this whole module is
  // about in a new costume. The runner's own summary carries the reason.
  if (run.report && verifiedNothing(run)) {
    const summary = run.report.summary.trim();
    if (summary) return summary;
    return `${run.report.skipped} test${run.report.skipped === 1 ? " was" : "s were"} skipped and nothing was run.`;
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
