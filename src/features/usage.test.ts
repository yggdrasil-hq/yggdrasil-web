import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LEVEL_CLASS,
  HEATMAP_DAYS,
  activityLevel,
  buildActivityHeatmap,
  deltaPercent,
  formatCost,
  formatDuration,
  formatTokens,
  jobKindMeta,
  modelLabel,
  providerLabel,
  sessionHref,
  sessionStatusMeta,
  sharePercent,
  type ActivityDay,
} from "@/lib/features/usage";

describe("formatTokens", () => {
  it("uses a magnitude suffix so a large total stays readable", () => {
    expect(formatTokens(6_800_000)).toBe("6.8M");
    expect(formatTokens(120_000)).toBe("120K");
    expect(formatTokens(94_200)).toBe("94.2K");
    expect(formatTokens(1_500_000_000)).toBe("1.5B");
  });

  it("drops a trailing .0 rather than implying false precision", () => {
    expect(formatTokens(2_000_000)).toBe("2M");
    expect(formatTokens(500)).toBe("500");
  });

  it("renders a genuine zero as zero — consumption really can be nothing", () => {
    expect(formatTokens(0)).toBe("0");
  });
});

describe("formatCost", () => {
  it("says so when nobody reported a cost, instead of showing $0.00", () => {
    // This distinction is the whole reason cost is nullable end to end: a
    // confident $0.00 would be a claim the provider never made.
    expect(formatCost(null)).toBe("Not reported");
  });

  it("renders a reported zero as a real zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("rounds to cents but flags a non-zero amount below the display floor", () => {
    expect(formatCost(0.45)).toBe("$0.45");
    expect(formatCost(12.5)).toBe("$12.50");
    expect(formatCost(0.001)).toBe("< $0.01");
  });
});

describe("formatDuration", () => {
  it("scales from milliseconds to hours", () => {
    expect(formatDuration(450)).toBe("450ms");
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(600_000)).toBe("10m");
    expect(formatDuration(4_320_000)).toBe("1h 12m");
  });

  it("distinguishes an unreported duration from an instant one", () => {
    expect(formatDuration(null)).toBe("Not reported");
    expect(formatDuration(0)).toBe("0ms");
  });
});

describe("sharePercent", () => {
  it("computes a share of the whole", () => {
    expect(sharePercent(50, 200)).toBe(25);
    expect(sharePercent(1, 3)).toBe(33);
  });

  it("returns 0 rather than NaN for an empty whole", () => {
    expect(sharePercent(0, 0)).toBe(0);
    expect(sharePercent(5, 0)).toBe(0);
  });
});

describe("deltaPercent", () => {
  it("reports a change against the previous window", () => {
    expect(deltaPercent(118, 100)).toBe(18);
    expect(deltaPercent(82, 100)).toBe(-18);
  });

  it("declines to invent a percentage when there is no previous window", () => {
    // Growth from zero has no meaningful percentage; "+100%" would be made up.
    expect(deltaPercent(10, 0)).toBeNull();
  });
});

describe("buildActivityHeatmap", () => {
  it("fills the full 52-week grid from a sparse day list", () => {
    const activity: ActivityDay[] = [
      { date: "2026-09-17", sessions: 3, tokens: 1000 },
      { date: "2026-09-10", sessions: 1, tokens: 200 },
    ];

    const heatmap = buildActivityHeatmap(activity, new Date("2026-09-17T12:00:00Z"));

    expect(heatmap.cells).toHaveLength(HEATMAP_DAYS);
    expect(heatmap.totalSessions).toBe(4);
    expect(heatmap.maxSessions).toBe(3);
    // The API only returns days that saw usage; every other cell is a real
    // zero rather than missing, or the grid would collapse.
    expect(heatmap.cells.filter((sessions) => sessions === 0)).toHaveLength(HEATMAP_DAYS - 2);
  });

  it("aligns the span to whole weeks so a column is always Sunday→Saturday", () => {
    // 2026-09-17 is a Thursday, so the grid must end on that week's Saturday
    // (2026-09-19) rather than on today.
    const heatmap = buildActivityHeatmap([], new Date("2026-09-17T00:00:00Z"));

    const lastIndex = heatmap.cells.length - 1;
    expect(heatmap.cells[lastIndex]).toBe(0);
    const startOffsetDays = HEATMAP_DAYS - 1;
    const start = new Date(
      Date.UTC(2026, 8, 19) - startOffsetDays * 86_400_000,
    );
    expect(start.getUTCDay()).toBe(0);
  });

  it("is deterministic for the same inputs regardless of time of day", () => {
    const morning = buildActivityHeatmap([], new Date("2026-09-17T01:00:00Z"));
    const evening = buildActivityHeatmap([], new Date("2026-09-17T23:00:00Z"));

    expect(morning.cells).toEqual(evening.cells);
  });

  it("sums multiple entries for one day rather than overwriting", () => {
    const activity: ActivityDay[] = [
      { date: "2026-09-17", sessions: 1, tokens: 10 },
      { date: "2026-09-17", sessions: 2, tokens: 20 },
    ];

    const heatmap = buildActivityHeatmap(activity, new Date("2026-09-17T00:00:00Z"));

    expect(heatmap.totalSessions).toBe(3);
    expect(heatmap.maxSessions).toBe(3);
  });
});

describe("activityLevel", () => {
  it("keeps an empty day at level 0 and any activity at least level 1", () => {
    expect(activityLevel(0, 10)).toBe(0);
    // A single session is still activity — rendering it as blank would hide
    // exactly what the graph exists to show.
    expect(activityLevel(1, 100)).toBe(1);
  });

  it("scales up to the busiest day without exceeding the last step", () => {
    expect(activityLevel(100, 100)).toBe(4);
    expect(activityLevel(50, 100)).toBe(2);
    expect(activityLevel(1000, 100)).toBe(4);
  });

  it("handles a grid with no activity at all", () => {
    expect(activityLevel(0, 0)).toBe(0);
  });

  it("has one class per level", () => {
    expect(ACTIVITY_LEVEL_CLASS).toHaveLength(5);
  });
});

describe("jobKindMeta", () => {
  it("labels the five agent job kinds", () => {
    expect(jobKindMeta("feature_build").label).toBe("Feature build");
    expect(jobKindMeta("design_grill").label).toBe("Design grill");
  });

  it("falls back to the raw kind so an unrecognised row is still legible", () => {
    expect(jobKindMeta("script_test_run").label).toBe("script_test_run");
  });
});

describe("sessionHref", () => {
  it("links a feature session to the feature's current stage", () => {
    expect(
      sessionHref({ projectId: "p1", featureId: "f1", testId: null }),
    ).toBe("/projects/p1/features/f1");
  });

  it("links a test session to the test", () => {
    expect(sessionHref({ projectId: "p1", featureId: null, testId: "t1" })).toBe(
      "/projects/p1/tests/t1",
    );
  });

  it("prefers the feature when a run has both", () => {
    expect(sessionHref({ projectId: "p1", featureId: "f1", testId: "t1" })).toBe(
      "/projects/p1/features/f1",
    );
  });

  it("has nowhere to link a project-scoped session", () => {
    // Design sessions carry no feature (ADR 014 keeps them project-scoped).
    expect(sessionHref({ projectId: "p1", featureId: null, testId: null })).toBeNull();
  });
});

describe("sessionStatusMeta", () => {
  it("maps a job status to a label and tone", () => {
    expect(sessionStatusMeta("completed").label).toBe("Completed");
    expect(sessionStatusMeta("failed").label).toBe("Failed");
    expect(sessionStatusMeta("running").label).toBe("Running");
  });

  it("surfaces an unexpected status verbatim rather than mislabelling it", () => {
    expect(sessionStatusMeta("weird").label).toBe("weird");
  });
});

describe("provider and model labels", () => {
  it("names a bring-your-own endpoint rather than showing an empty cell", () => {
    // Custom-triplet tiers have no catalog row, so the provider is genuinely
    // unknown — but "unknown" is not the same as "nothing".
    expect(providerLabel(null)).toBe("Custom endpoint");
    expect(providerLabel("OpenRouter")).toBe("OpenRouter");
  });

  it("combines model and provider when both are known", () => {
    expect(modelLabel("anthropic/claude-sonnet-4", "OpenRouter")).toBe(
      "anthropic/claude-sonnet-4 · OpenRouter",
    );
    expect(modelLabel("anthropic/claude-sonnet-4", null)).toBe(
      "anthropic/claude-sonnet-4",
    );
    expect(modelLabel(null, null)).toBe("Unknown model");
  });
});
