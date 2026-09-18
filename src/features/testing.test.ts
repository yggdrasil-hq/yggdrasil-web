import { describe, expect, it } from "vitest";
import {
  couldNotRun,
  isFailingRun,
  runFailureReason,
  verifiedNothing,
  tallyLine,
  tallyRuns,
  testingHeadline,
} from "@/lib/features/testing";
import type { TestingReport, TestingRun } from "@/lib/features/types";

/**
 * Issue #40. The bug this module exists to prevent was a header reading
 * "0 passed · 0 failed · 0 skipped" over a page whose every row was a failure,
 * because the tally summed report fields and the failing runs had no reports.
 */

function makeReport(overrides: Partial<TestingReport> = {}): TestingReport {
  return {
    passed: 3,
    failed: 0,
    skipped: 0,
    total: 3,
    coveragePercent: null,
    failingTests: [],
    summary: "",
    recordingPath: null,
    createdAt: "2026-09-18T10:00:00.000Z",
    ...overrides,
  };
}

function makeRun(overrides: Partial<TestingRun> = {}): TestingRun {
  return {
    jobId: "job_1",
    testId: null,
    testGroup: "unit",
    status: "completed",
    report: makeReport(),
    steps: [],
    lastError: null,
    completedAt: "2026-09-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("couldNotRun", () => {
  it("is true only for a finished run with no report", () => {
    expect(couldNotRun(makeRun({ report: null, status: "failed" }))).toBe(true);
    expect(couldNotRun(makeRun({ report: null, status: "completed" }))).toBe(true);
    expect(couldNotRun(makeRun({ report: null, status: "cancelled" }))).toBe(true);
    // Still going: nothing is known yet, which is not the same as "did not run".
    expect(couldNotRun(makeRun({ report: null, status: "running" }))).toBe(false);
    expect(couldNotRun(makeRun({ report: null, status: "pending" }))).toBe(false);
    expect(couldNotRun(makeRun())).toBe(false);
  });
});

describe("isFailingRun", () => {
  it("is true for a failed job", () => {
    expect(isFailingRun(makeRun({ report: null, status: "failed" }))).toBe(true);
  });

  it("is true for a report with failures", () => {
    expect(isFailingRun(makeRun({ report: makeReport({ failed: 1 }) }))).toBe(true);
  });

  // The run that broke the pipeline: a successful job that submitted nothing.
  // Grey-and-hidden is how it went unnoticed, so the filter has to include it.
  it("is true for a run that completed without reporting", () => {
    expect(isFailingRun(makeRun({ report: null, status: "completed" }))).toBe(true);
  });

  it("is false for a pass and for a run still going", () => {
    expect(isFailingRun(makeRun())).toBe(false);
    expect(isFailingRun(makeRun({ report: null, status: "running" }))).toBe(false);
  });
});

describe("verifiedNothing", () => {
  // The state that made the shipped page contradict itself: a `script_test_run`
  // on an install with no runner image submits an honest all-skips report, which
  // every pre-existing signal read as a pass.
  it("is true for a report with no results at all", () => {
    expect(
      verifiedNothing(
        makeRun({ report: makeReport({ passed: 0, failed: 0, skipped: 1, total: 1 }) }),
      ),
    ).toBe(true);
  });

  // A suite that runs some tests and skips others has verified something;
  // calling that unverified would be its own lie.
  it("is false when anything actually ran", () => {
    expect(
      verifiedNothing(
        makeRun({ report: makeReport({ passed: 1, failed: 0, skipped: 5, total: 6 }) }),
      ),
    ).toBe(false);
  });

  it("is false while the run is still going, and when there is no report", () => {
    expect(verifiedNothing(makeRun({ report: null, status: "running" }))).toBe(false);
    expect(verifiedNothing(makeRun({ report: null, status: "failed" }))).toBe(false);
  });
});

describe("tallyRuns", () => {
  it("counts a run that reported only skips separately from one that never reported", () => {
    const tally = tallyRuns([
      makeRun({ report: makeReport({ passed: 0, failed: 0, skipped: 1, total: 1 }) }),
      makeRun({ jobId: "job_2", report: null, status: "failed" }),
    ]);

    // Different causes, different fixes, so they must not be summed.
    expect(tally.unverified).toBe(1);
    expect(tally.notReported).toBe(1);
    expect(tally.failingRuns).toBe(2);
  });

  it("sums the reports it can see", () => {
    const tally = tallyRuns([
      makeRun({ report: makeReport({ passed: 4, total: 4 }) }),
      makeRun({
        jobId: "job_2",
        testGroup: "integration",
        report: makeReport({ passed: 2, failed: 1, skipped: 1, total: 4 }),
      }),
    ]);

    expect(tally).toMatchObject({
      passed: 6,
      failed: 1,
      skipped: 1,
      total: 8,
      reported: 2,
      notReported: 0,
      failingRuns: 1,
      runs: 2,
    });
  });

  it("counts a failing run that never reported, instead of dropping it", () => {
    const tally = tallyRuns([
      makeRun({ report: null, status: "failed", lastError: "no image configured" }),
      makeRun({ report: null, status: "failed", lastError: "no image configured" }),
    ]);

    // Every assertion count is genuinely unknown here, which is why none is
    // invented — but the runs are not invisible either.
    expect(tally).toMatchObject({ passed: 0, failed: 0, notReported: 2, failingRuns: 2 });
  });

  it("does not count a still-running run as unreported", () => {
    const tally = tallyRuns([makeRun({ report: null, status: "running" })]);

    expect(tally).toMatchObject({ notReported: 0, inFlight: 1 });
  });

  it("counts a run that verified nothing as failing even though no job failed", () => {
    expect(
      tallyRuns([makeRun({ report: makeReport({ passed: 0, failed: 0, skipped: 1, total: 1 }) })])
        .failingRuns,
    ).toBe(1);
  });

  it("counts a run that ended without a report as failing even though it reported nothing", () => {
    expect(tallyRuns([makeRun({ report: null, status: "failed" })]).failingRuns).toBe(1);
    expect(tallyRuns([makeRun({ report: null, status: "cancelled" })]).failingRuns).toBe(1);
    expect(tallyRuns([makeRun({ report: null, status: "completed" })]).failingRuns).toBe(1);
  });
});

describe("tallyLine", () => {
  it("never reads as a clean run when a group could not run", () => {
    const line = tallyLine(
      tallyRuns([makeRun({ report: null, status: "failed" })]),
    );

    expect(line).toBe("0 passed · 0 failed · 0 skipped · 1 could not run");
  });

  it("keeps an unreported group separate from a genuine assertion failure", () => {
    // One group failed an assertion, the other never ran. Adding them would say
    // "1 failed", which would tell an operator to look at failing code that does
    // not exist.
    const line = tallyLine(
      tallyRuns([
        makeRun({ report: makeReport({ passed: 1, failed: 1, total: 2 }) }),
        makeRun({ jobId: "job_2", report: null, status: "failed" }),
      ]),
    );

    expect(line).toBe("1 passed · 1 failed · 0 skipped · 1 could not run");
  });

  it("names a group that verified nothing", () => {
    const line = tallyLine(
      tallyRuns([makeRun({ report: makeReport({ passed: 0, failed: 0, skipped: 1, total: 1 }) })]),
    );

    expect(line).toBe("0 passed · 0 failed · 1 skipped · 1 verified nothing");
  });

  it("omits the extra clause entirely on a clean run", () => {
    expect(tallyLine(tallyRuns([makeRun()]))).toBe("3 passed · 0 failed · 0 skipped");
  });
});

describe("testingHeadline", () => {
  it("says nothing when there are no runs", () => {
    expect(testingHeadline([])).toEqual({ tone: "empty", message: "" });
  });

  it("reports progress while something is in flight", () => {
    const headline = testingHeadline([makeRun({ report: null, status: "running" })]);

    expect(headline.tone).toBe("active");
    expect(headline.message).toContain("still running");
  });

  it("reports a return to implementation when an assertion failed", () => {
    const headline = testingHeadline([
      makeRun({ report: makeReport({ passed: 2, failed: 1, total: 3 }) }),
    ]);

    expect(headline.tone).toBe("fail");
    expect(headline.message).toContain("1 assertion failed");
    expect(headline.message).toContain("sent back to Implementation");
  });

  it("reports an environment problem as one, not as a return", () => {
    // The distinction the API's gate makes (see features/testing-gate.ts). The
    // copy has to match, or an operator goes looking for broken code.
    const headline = testingHeadline([
      makeRun({ report: null, status: "failed", lastError: "no image configured" }),
    ]);

    expect(headline.tone).toBe("fail");
    expect(headline.message).toContain("environment problem, not a code one");
    expect(headline.message).not.toContain("Implementation");
  });

  it("mentions both when one group failed and another could not run", () => {
    const headline = testingHeadline([
      makeRun({ report: makeReport({ passed: 2, failed: 1, total: 3 }) }),
      makeRun({ jobId: "job_2", testGroup: "integration", report: null, status: "failed" }),
    ]);

    expect(headline.message).toContain("1 assertion failed");
    expect(headline.message).toContain("could not run at all");
  });

  it("does not call an all-skips report a pass", () => {
    // The exact shipped contradiction: a green row and a headline saying
    // nothing was verified, on the same page.
    const headline = testingHeadline([
      makeRun({ report: makeReport({ passed: 0, failed: 0, skipped: 1, total: 1 }) }),
    ]);

    expect(headline.tone).toBe("fail");
    expect(headline.message).toContain("only skips");
  });

  it("qualifies a pass when some groups verified nothing", () => {
    const headline = testingHeadline([
      makeRun({ report: makeReport({ passed: 4, failed: 0, total: 4 }) }),
      makeRun({
        jobId: "job_2",
        testGroup: "integration",
        report: makeReport({ passed: 0, failed: 0, skipped: 1, total: 1 }),
      }),
    ]);

    expect(headline.tone).toBe("pass");
    expect(headline.message).toContain("1 test group");
    expect(headline.message).toContain("verified nothing");
  });

  // Precedence: real evidence about the code outranks a stage where nothing was
  // verified, so a genuine failure is still reported as one.
  it("still reports a real failure when another group verified nothing", () => {
    const headline = testingHeadline([
      makeRun({ report: makeReport({ passed: 1, failed: 1, total: 2 }) }),
      makeRun({
        jobId: "job_2",
        testGroup: "integration",
        report: makeReport({ passed: 0, failed: 0, skipped: 1, total: 1 }),
      }),
    ]);

    expect(headline.message).toContain("1 assertion failed");
  });

  it("reports a pass only when everything reported and passed", () => {
    const headline = testingHeadline([
      makeRun(),
      makeRun({ jobId: "job_2", testGroup: "integration" }),
    ]);

    expect(headline.tone).toBe("pass");
    expect(headline.message).toContain("All 6 assertions passed");
  });
});

describe("runFailureReason", () => {
  it("is null for a run that is still going", () => {
    expect(runFailureReason(makeRun({ report: null, status: "running" }))).toBeNull();
  });

  it("is null for a run that passed", () => {
    expect(runFailureReason(makeRun())).toBeNull();
  });

  it("prefers the report summary, because a human wrote it for this", () => {
    expect(
      runFailureReason(
        makeRun({
          report: makeReport({
            failed: 1,
            summary: "Checkout rejects an expired card.",
            failingTests: ["checkout rejects an expired card"],
          }),
        }),
      ),
    ).toBe("Checkout rejects an expired card.");
  });

  it("falls back to a count when the report has no summary", () => {
    expect(
      runFailureReason(makeRun({ report: makeReport({ failed: 2, summary: "" }) })),
    ).toBe("2 failing assertions");
  });

  it("uses the job's own error when there is no report at all", () => {
    // The case the tab previously could not answer: nothing to show, so a failed
    // row said "failed" and nothing else.
    expect(
      runFailureReason(
        makeRun({ report: null, status: "failed", lastError: "no image configured for script_test_run" }),
      ),
    ).toBe("no image configured for script_test_run");
  });

  it("explains a run that reported only skips, since it is now tinted as a failure", () => {
    const reason = runFailureReason(
      makeRun({
        report: makeReport({
          passed: 0,
          failed: 0,
          skipped: 1,
          total: 1,
          summary: "Skipped (unit): this installation has no script_test_run image configured.",
        }),
      }),
    );

    expect(reason).toBe(
      "Skipped (unit): this installation has no script_test_run image configured.",
    );
  });

  it("still explains an all-skips report that carries no summary", () => {
    const reason = runFailureReason(
      makeRun({ report: makeReport({ passed: 0, failed: 0, skipped: 2, total: 2, summary: "" }) }),
    );

    expect(reason).toContain("skipped");
  });

  it("explains a report-less run even when the job recorded no error", () => {
    expect(runFailureReason(makeRun({ report: null, status: "cancelled" }))).toContain(
      "cancelled",
    );
    expect(runFailureReason(makeRun({ report: null, status: "completed" }))).toContain(
      "without submitting a report",
    );
    expect(runFailureReason(makeRun({ report: null, status: "failed" }))).toContain(
      "before it could report",
    );
  });
});
