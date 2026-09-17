import { describe, expect, it } from "vitest";
import {
  describePreview,
  isPreviewLive,
  previewHostLabel,
  previewRowSummary,
  previewStatusLabel,
  previewUrl,
  summarizePreviews,
} from "@/lib/features/previews";
import type { JobPreview } from "@/lib/features/types";

function makePreview(overrides: Partial<JobPreview> = {}): JobPreview {
  return {
    jobId: "job-1",
    host: "acme-web-feature-build-job-1.preview.yggdrasil.local",
    status: "active",
    lastError: null,
    createdAt: "2026-09-17T10:00:00.000Z",
    tornDownAt: null,
    ...overrides,
  };
}

describe("previewUrl", () => {
  it("composes https from the bare host the Orchestrator reported", () => {
    expect(previewUrl(makePreview())).toBe(
      "https://acme-web-feature-build-job-1.preview.yggdrasil.local",
    );
  });

  // The whole point of the status check: a torn-down host is a dead link and a
  // failed one never existed. Linking either would be worse than showing
  // nothing, because the user cannot distinguish a broken preview from a
  // broken app.
  it("offers no link once the preview has ended", () => {
    expect(previewUrl(makePreview({ status: "torn_down", tornDownAt: "2026-09-17T11:00:00.000Z" }))).toBeNull();
  });

  it("offers no link for a preview that never came up", () => {
    expect(previewUrl(makePreview({ status: "failed", lastError: "boom" }))).toBeNull();
  });

  it("does not double up a scheme if one is ever stored", () => {
    // The API stores a bare host today; this pins the assumption so a future
    // writer storing a full URL fails loudly here rather than producing
    // "https://https://…" on the page.
    expect(previewUrl(makePreview({ host: "acme.preview.local" }))).toBe("https://acme.preview.local");
  });
});

describe("isPreviewLive", () => {
  it("is true only for active", () => {
    expect(isPreviewLive({ status: "active" })).toBe(true);
    expect(isPreviewLive({ status: "torn_down" })).toBe(false);
    expect(isPreviewLive({ status: "failed" })).toBe(false);
  });
});

describe("summarizePreviews", () => {
  it("separates live from ended and orders each newest-first", () => {
    const old = makePreview({ jobId: "old", createdAt: "2026-09-17T08:00:00.000Z" });
    const newest = makePreview({ jobId: "newest", createdAt: "2026-09-17T12:00:00.000Z" });
    const middle = makePreview({ jobId: "middle", createdAt: "2026-09-17T10:00:00.000Z" });
    const ended = makePreview({
      jobId: "ended",
      status: "torn_down",
      createdAt: "2026-09-17T11:00:00.000Z",
    });

    const summary = summarizePreviews([old, ended, newest, middle]);

    expect(summary.live.map((p) => p.jobId)).toEqual(["newest", "middle", "old"]);
    expect(summary.ended.map((p) => p.jobId)).toEqual(["ended"]);
  });

  // A failure is "no longer running" like a clean teardown; the per-row status
  // label already distinguishes them, so a third bucket would only make the
  // list harder to read.
  it("treats failed previews as ended rather than a separate bucket", () => {
    const summary = summarizePreviews([
      makePreview({ jobId: "failed", status: "failed", lastError: "no chart" }),
    ]);
    expect(summary.live).toHaveLength(0);
    expect(summary.ended.map((p) => p.jobId)).toEqual(["failed"]);
  });

  it("says nothing is running when nothing is live", () => {
    expect(summarizePreviews([]).headline).toBe(
      "No preview is running for this project right now.",
    );
    const onlyEnded = summarizePreviews([makePreview({ status: "torn_down" })]);
    expect(onlyEnded.headline).toBe("No preview is running for this project right now.");
  });

  it("counts live previews in the headline", () => {
    expect(summarizePreviews([makePreview()]).headline).toBe("1 preview is live.");
    expect(summarizePreviews([makePreview(), makePreview({ jobId: "b" })]).headline).toBe(
      "2 previews are live.",
    );
  });

  it("does not mutate its input", () => {
    const input = [
      makePreview({ jobId: "a", createdAt: "2026-09-17T08:00:00.000Z" }),
      makePreview({ jobId: "b", createdAt: "2026-09-17T12:00:00.000Z" }),
    ];
    summarizePreviews(input);
    expect(input.map((p) => p.jobId)).toEqual(["a", "b"]);
  });
});

describe("previewRowSummary", () => {
  it("reports live previews only, so ended ones cannot inflate the count", () => {
    const summary = summarizePreviews([
      makePreview({ jobId: "a" }),
      makePreview({ jobId: "b", status: "torn_down" }),
      makePreview({ jobId: "c", status: "failed" }),
    ]);
    expect(previewRowSummary(summary)).toBe("1 live preview for a running job.");
  });

  it("explains the empty state instead of claiming zero previews exist", () => {
    expect(previewRowSummary(summarizePreviews([]))).toContain("No preview is running");
  });
});

describe("describePreview", () => {
  it("surfaces the recorded reason for a failure", () => {
    expect(
      describePreview(
        makePreview({ status: "failed", lastError: "failed to deploy preview release: chart missing" }),
      ),
    ).toBe("Preview failed to start: failed to deploy preview release: chart missing");
  });

  it("still explains a failure with no recorded reason", () => {
    expect(describePreview(makePreview({ status: "failed" }))).toBe("Preview failed to start.");
  });

  it("explains an ended preview in terms of its job", () => {
    expect(describePreview(makePreview({ status: "torn_down" }))).toBe(
      "Preview ended when its job finished.",
    );
  });
});

describe("labels", () => {
  it("labels each status once", () => {
    expect(previewStatusLabel("active")).toBe("Live");
    expect(previewStatusLabel("torn_down")).toBe("Ended");
    expect(previewStatusLabel("failed")).toBe("Failed");
  });

  it("shows the host without a scheme", () => {
    expect(previewHostLabel(makePreview())).toBe(
      "acme-web-feature-build-job-1.preview.yggdrasil.local",
    );
  });
});
