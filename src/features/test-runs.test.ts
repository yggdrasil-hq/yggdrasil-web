import { describe, expect, it } from "vitest";
import {
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
  summarizeHistory,
} from "@/lib/features/test-runs";
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

  it("falls back for a run with no recorded trigger", () => {
    expect(runTriggerLabel(makeRun({ trigger: null }))).toBe("Run");
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
