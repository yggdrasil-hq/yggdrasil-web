import { describe, expect, it } from "vitest";
import {
  RUN_HISTORY_POLL_INTERVAL_MS,
  emptyHistoryMessage,
  failingSteps,
  formatDuration,
  hasRunDetail,
  historySummaryLine,
  runCounts,
  runDurationMs,
  runStatusLabel,
  runTone,
  runToneClass,
  runTriggerLabel,
  describeTriggerRunFailure,
  summarizeHistory,
} from "@/lib/features/test-runs";
import { pollIntervalMsForRelay } from "@/lib/features/live-relay";
import type { JobStatus, TestRunHistoryEntry } from "@/lib/features/types";

function makeRun(overrides: Partial<TestRunHistoryEntry> = {}): TestRunHistoryEntry {
  return {
    jobId: "job_1",
    testId: "test_1",
    status: "completed",
    trigger: "schedule",
    testGroup: null,
    ref: "main",
    createdAt: "2026-09-17T09:00:00.000Z",
    startedAt: "2026-09-17T09:00:05.000Z",
    completedAt: "2026-09-17T09:01:35.000Z",
    durationMs: 90_000,
    report: {
      passed: 12,
      failed: 0,
      skipped: 1,
      total: 13,
      coveragePercent: 84.5,
      failingTests: [],
      summary: "12 passed, 1 skipped",
      recordingPath: null,
      createdAt: "2026-09-17T09:01:30.000Z",
    },
    steps: [],
    ...overrides,
  };
}

describe("runCounts", () => {
  it("returns the reported counts", () => {
    expect(runCounts(makeRun())).toEqual({
      passed: 12,
      failed: 0,
      skipped: 1,
      total: 13,
    });
  });

  it("returns null for a run that never reported", () => {
    // Not a zeroed set: unknown results must not read as a clean run.
    expect(runCounts(makeRun({ report: null }))).toBeNull();
  });
});

describe("runDurationMs", () => {
  it("passes the server-computed duration through", () => {
    expect(runDurationMs(makeRun())).toBe(90_000);
  });

  it("keeps a still-running run at null rather than measuring to now", () => {
    expect(
      runDurationMs(
        makeRun({ status: "running", durationMs: null, completedAt: null }),
      ),
    ).toBeNull();
  });

  it("does not substitute queue time for run time", () => {
    // createdAt -> completedAt would be 95s here; the honest answer is null.
    expect(
      runDurationMs(makeRun({ durationMs: null, startedAt: null })),
    ).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [999, "1s"],
    [1_000, "1s"],
    [45_000, "45s"],
    [60_000, "1m"],
    [90_000, "1m 30s"],
    [3_600_000, "1h"],
    [3_900_000, "1h 5m"],
    [7_320_000, "2h 2m"],
  ])("formats %i ms as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it("renders a missing duration as an em dash, not a zero", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it("rejects nonsense values rather than printing them", () => {
    expect(formatDuration(Number.NaN)).toBe("—");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
  });
});

describe("runTriggerLabel", () => {
  it("distinguishes a scheduled run from a feature-branch one", () => {
    expect(runTriggerLabel(makeRun({ trigger: "schedule" }))).toBe("Scheduled");
    expect(runTriggerLabel(makeRun({ trigger: "feature" }))).toBe("Feature branch");
  });

  /*
   * Issue #31's on-demand run. It gets its own label rather than the fallback:
   * the API records `trigger_source = 'manual'` specifically so a history entry
   * does not attribute a deliberate run to the scheduler, and a label reading the
   * same as the unknown-value fallback would undo that where a user looks.
   */
  it("labels a manual run as its own thing, not as the unknown fallback", () => {
    expect(runTriggerLabel(makeRun({ trigger: "manual" }))).toBe("Run manually");
    expect(runTriggerLabel(makeRun({ trigger: "manual" }))).not.toBe(
      runTriggerLabel(makeRun({ trigger: null })),
    );
  });

  it("falls back for a run with no recorded trigger", () => {
    expect(runTriggerLabel(makeRun({ trigger: null }))).toBe("Run");
  });
});

describe("describeTriggerRunFailure", () => {
  /*
   * Both refusals the API can give are 409s whose own sentence is the whole
   * value — they imply different next actions (wait, versus finish project setup),
   * so replacing them with generic copy would throw away the only actionable part.
   */
  it("echoes the API's reason for an in-flight run", () => {
    const message = describeTriggerRunFailure(
      "This test already has a run in progress (API error: 409 Conflict)",
    );
    expect(message).toBe("This test already has a run in progress");
  });

  it("echoes the API's reason for a project that is not ready", () => {
    const message = describeTriggerRunFailure(
      "Project initialization must complete before running tests (API error: 409 Conflict)",
    );
    expect(message).toContain("initialization must complete");
  });

  it("still says something actionable when a 409 carried no prose", () => {
    expect(describeTriggerRunFailure("API error: 409 Conflict")).toBe(
      "This test cannot be run right now.",
    );
  });

  it("reuses the shared load-failure copy for anything else", () => {
    // A 404 here is not a special case worth its own sentence, and reusing the
    // shared module keeps its copy consistent with the rest of the app. This
    // returns the `detail`, not the heading — the heading is the panel's job — so
    // the assertion is on the sentence that carries the advice.
    expect(describeTriggerRunFailure("Test not found (API error: 404 Not Found)")).toContain(
      "may not have access",
    );
    expect(describeTriggerRunFailure("API error: 500 Internal Server Error")).toContain(
      "server could not complete",
    );
  });
});

describe("runStatusLabel", () => {
  it.each([
    ["pending", "Queued"],
    ["running", "Running"],
    ["completed", "Completed"],
    ["failed", "Failed"],
    ["cancelled", "Cancelled"],
  ] as Array<[JobStatus, string]>)("labels %s as %s", (status, expected) => {
    expect(runStatusLabel(status)).toBe(expected);
  });
});

describe("runTone", () => {
  it("tints a clean completed run as a pass", () => {
    expect(runTone(makeRun())).toBe("pass");
  });

  it("tints a completed run that reported failures as a fail", () => {
    expect(
      runTone(
        makeRun({
          report: { ...makeRun().report!, failed: 2, passed: 10 },
        }),
      ),
    ).toBe("fail");
  });

  it("tints a failed or cancelled job as a fail regardless of any report", () => {
    expect(runTone(makeRun({ status: "failed", report: null }))).toBe("fail");
    expect(runTone(makeRun({ status: "cancelled" }))).toBe("fail");
  });

  it("tints an in-flight run as active", () => {
    expect(runTone(makeRun({ status: "pending", report: null }))).toBe("active");
    expect(runTone(makeRun({ status: "running", report: null }))).toBe("active");
  });

  it("tints a completed run with no report as neither pass nor fail", () => {
    // Nothing to judge — calling it a pass would be inventing a result.
    expect(runTone(makeRun({ report: null }))).toBe("idle");
  });

  it("maps every tone to a class", () => {
    for (const tone of ["pass", "fail", "active", "idle"] as const) {
      expect(runToneClass(tone)).toMatch(/^text-/);
    }
  });
});

describe("failingSteps", () => {
  it("returns only the failing steps, in order", () => {
    const run = makeRun({
      steps: [
        { name: "signs in", status: "pass", details: null, screenshotPath: null, createdAt: "" },
        { name: "adds to cart", status: "fail", details: "badge stayed 0", screenshotPath: null, createdAt: "" },
        { name: "checks out", status: "fail", details: "500", screenshotPath: null, createdAt: "" },
      ],
    });
    expect(failingSteps(run).map((step) => step.name)).toEqual([
      "adds to cart",
      "checks out",
    ]);
  });

  it("returns nothing when every step passed", () => {
    const run = makeRun({
      steps: [
        { name: "signs in", status: "pass", details: null, screenshotPath: null, createdAt: "" },
      ],
    });
    expect(failingSteps(run)).toEqual([]);
  });
});

describe("hasRunDetail", () => {
  it("is true when the run has steps", () => {
    expect(
      hasRunDetail(
        makeRun({
          report: null,
          steps: [
            { name: "signs in", status: "pass", details: null, screenshotPath: null, createdAt: "" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("is true when the report has a summary", () => {
    expect(hasRunDetail(makeRun())).toBe(true);
  });

  it("is true when the report lists failing tests", () => {
    expect(
      hasRunDetail(
        makeRun({
          report: { ...makeRun().report!, summary: "", failingTests: ["checkout"] },
        }),
      ),
    ).toBe(true);
  });

  it("is false for a queued run with nothing reported yet", () => {
    // A disclosure that opens onto nothing is worse than no disclosure.
    expect(hasRunDetail(makeRun({ status: "pending", report: null, steps: [] }))).toBe(false);
  });
});

describe("summarizeHistory", () => {
  it("returns an all-zero summary for a test that has never run", () => {
    expect(summarizeHistory([])).toEqual({
      runs: 0,
      reported: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      latest: null,
      latestFailed: false,
    });
  });

  it("sums only the runs that reported", () => {
    const summary = summarizeHistory([
      makeRun({ jobId: "a" }),
      makeRun({
        jobId: "b",
        report: { ...makeRun().report!, passed: 10, failed: 3, skipped: 0, total: 13 },
      }),
      makeRun({ jobId: "c", status: "running", report: null, durationMs: null }),
    ]);

    expect(summary).toMatchObject({
      runs: 3,
      reported: 2,
      passed: 22,
      failed: 3,
      skipped: 1,
    });
  });

  it("treats the first entry as the newest run", () => {
    const newest = makeRun({ jobId: "newest" });
    const summary = summarizeHistory([newest, makeRun({ jobId: "older" })]);
    expect(summary.latest?.jobId).toBe("newest");
  });

  it("flags failure from the newest run, not from history as a whole", () => {
    const summary = summarizeHistory([
      makeRun({ jobId: "newest" }),
      makeRun({
        jobId: "older",
        report: { ...makeRun().report!, passed: 0, failed: 13 },
      }),
    ]);
    // History contains failures, but the suite is currently green.
    expect(summary.failed).toBe(13);
    expect(summary.latestFailed).toBe(false);
  });

  it("flags a currently-red suite", () => {
    const summary = summarizeHistory([
      makeRun({ report: { ...makeRun().report!, passed: 11, failed: 2 } }),
    ]);
    expect(summary.latestFailed).toBe(true);
  });

  it("does not flag a pending newest run as failed", () => {
    const summary = summarizeHistory([
      makeRun({ status: "pending", report: null }),
      makeRun({ report: { ...makeRun().report!, passed: 13, failed: 0 } }),
    ]);
    expect(summary.latestFailed).toBe(false);
  });

  it("does not treat a run with no report as failing", () => {
    const summary = summarizeHistory([makeRun({ report: null, status: "completed" })]);
    expect(summary.latestFailed).toBe(false);
  });
});

describe("historySummaryLine", () => {
  it("says nothing when there is no history", () => {
    expect(historySummaryLine(summarizeHistory([]))).toBeNull();
  });

  it("names the no-report case instead of showing zeroes", () => {
    const line = historySummaryLine(
      summarizeHistory([makeRun({ status: "running", report: null })]),
    );
    expect(line).toBe("1 run, no report yet");
  });

  it("pluralises runs with no report", () => {
    const line = historySummaryLine(
      summarizeHistory([
        makeRun({ status: "running", report: null }),
        makeRun({ status: "pending", report: null }),
      ]),
    );
    expect(line).toBe("2 runs, no report yet");
  });

  it("reports pass/fail totals across reported runs", () => {
    const line = historySummaryLine(
      summarizeHistory([
        makeRun(),
        makeRun({
          report: { ...makeRun().report!, passed: 10, failed: 2, skipped: 0 },
        }),
      ]),
    );
    expect(line).toBe("22 passed · 2 failed · 1 skipped across 2 reported runs");
  });

  it("omits the skipped clause when nothing was skipped", () => {
    const line = historySummaryLine(
      summarizeHistory([
        makeRun({
          report: { ...makeRun().report!, passed: 13, skipped: 0, total: 13 },
        }),
      ]),
    );
    expect(line).toBe("13 passed · 0 failed across 1 reported run");
  });
});

describe("emptyHistoryMessage", () => {
  it("explains that a paused test will never run", () => {
    expect(emptyHistoryMessage(false)).toContain("paused");
  });

  it("explains that a fresh test is waiting for its window", () => {
    expect(emptyHistoryMessage(true)).toContain("next scheduled window");
  });
});

describe("the run history's fallback interval (#100)", () => {
  /*
   * The same rule every converted surface asserts, tied to *this* surface's fallback
   * constant so the history cannot quietly acquire a fast poll while live. Getting the
   * direction backwards leaves a connected surface polling at its fallback rate on top
   * of the socket — strictly worse than before the relay existed, and invisible in any
   * test that only checked the page renders.
   */
  it("polls slowly while live and at the surface's own rate otherwise", () => {
    // Anchored to `RUN_HISTORY_POLL_INTERVAL_MS` rather than a literal, so a change to
    // the page's behaviour is reflected here instead of hidden behind a copy of it.
    expect(
      pollIntervalMsForRelay({ isLive: true, fallbackMs: RUN_HISTORY_POLL_INTERVAL_MS }),
    ).toBe(30_000);
    expect(
      pollIntervalMsForRelay({ isLive: false, fallbackMs: RUN_HISTORY_POLL_INTERVAL_MS }),
    ).toBe(RUN_HISTORY_POLL_INTERVAL_MS);
  });

  it("is not a token-stream interval", () => {
    // A test run reports a series of steps over minutes, so the surface that lists runs
    // should not poll at the grill transcript's 2s rate. Asserted as a bound rather than
    // an equality so raising it stays allowed; the point is the order of magnitude.
    expect(RUN_HISTORY_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5_000);
  });
});
