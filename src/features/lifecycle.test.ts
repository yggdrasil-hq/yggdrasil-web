import { describe, expect, it } from "vitest";
import {
  emptyTestReport,
  testReportToTestingResults,
  type TestReport,
} from "@/lib/features/types";
import {
  formatDuration,
  hasTestingFailures,
} from "@/lib/features/testing";
import { agenticReviewToView, blockStatusLabel } from "@/lib/features/agentic-review";
import {
  manualReviewSubviewForStatus,
  manualReviewStatusCopy,
} from "@/lib/features/manual-review";
import type { TestingResults, AgenticReview } from "@/lib/features/types";

function sampleResults(): TestingResults {
  return {
    featureId: "feat_x",
    status: "testing",
    runs: [{
      jobId: "job_x",
      testId: "test_x",
      status: "completed",
      report: {
        passed: 2,
        failed: 1,
        skipped: 0,
        total: 3,
        coveragePercent: 78,
        failingTests: ["b"],
        summary: "one failure",
        recordingPath: null,
        createdAt: new Date().toISOString(),
      },
      steps: [
        { name: "a", status: "pass", details: null, screenshotPath: null, createdAt: new Date().toISOString() },
        { name: "b", status: "fail", details: null, screenshotPath: null, createdAt: new Date().toISOString() },
      ],
    }],
  };
}

describe("testReportToTestingResults", () => {
  it("maps a canonical empty report with null coverage", () => {
    const report: TestReport = emptyTestReport();
    const mapped = testReportToTestingResults("feat_x", report);
    expect(mapped.featureId).toBe("feat_x");
    expect(mapped.runs[0]?.report?.total).toBe(0);
    expect(mapped.runs[0]?.report?.coveragePercent).toBeNull();
    expect(mapped.runs[0]?.steps).toEqual([]);
  });

  it("carries coverage and totals from a populated report", () => {
    const report: TestReport = {
      passed: 12,
      failed: 2,
      skipped: 1,
      total: 15,
      coveragePercent: 88.4,
      failingTests: [{ name: "x" }],
    };
    const mapped = testReportToTestingResults("feat_x", report);
    expect(mapped.runs[0]?.report?.total).toBe(15);
    expect(mapped.runs[0]?.report?.coveragePercent).toBe(88.4);
  });
});

describe("hasTestingFailures", () => {
  it("detects failures from the summary or rows", () => {
    expect(hasTestingFailures(sampleResults())).toBe(true);
    const passing = sampleResults();
    passing.runs[0]!.report!.failed = 0;
    passing.runs[0]!.steps = passing.runs[0]!.steps.map((step) => ({ ...step, status: "pass" }));
    expect(hasTestingFailures(passing)).toBe(false);
  });
});

describe("formatDuration", () => {
  it("formats ms, seconds, and minutes", () => {
    expect(formatDuration(800)).toBe("800ms");
    expect(formatDuration(1200)).toBe("1.2s");
    expect(formatDuration(48000)).toBe("48.0s");
    expect(formatDuration(120000)).toBe("2m");
  });
});

describe("agenticReviewToView", () => {
  it("counts blocking findings and derives the verdict", () => {
    const review: AgenticReview = {
      featureId: "feat_x",
      verdict: "changes_requested",
      comment: null,
      findings: [
        { location: "a.ts:1", note: "n", blocking: true },
        { location: "b.ts:2", note: "n", blocking: false },
      ],
    };
    const view = agenticReviewToView(review);
    expect(view.verdict).toBe("changes_requested");
    expect(view.blockingCount).toBe(1);
    expect(view.approved).toBe(false);
    expect(blockStatusLabel(1)).toBe("1 blocking issue");
  });

  it("reports no blocking issues as plural-safe", () => {
    const rejected = blockStatusLabel(0);
    expect(rejected).toBe("no blocking issues");
  });
});

describe("manualReviewSubviewForStatus", () => {
  it("maps returned/merged/in_review to the grouping tabs", () => {
    expect(manualReviewSubviewForStatus("returned")).toBe("changes_requested");
    expect(manualReviewSubviewForStatus("merged")).toBe("merged");
    expect(manualReviewSubviewForStatus("in_review")).toBe("in_review");
  });
});

describe("manualReviewStatusCopy", () => {
  it("includes the return comment on changes requested", () => {
    const copy = manualReviewStatusCopy("changes_requested", {
      status: "returned",
      returnComment: "fix the icon",
    });
    expect(copy).toContain("fix the icon");
  });
});