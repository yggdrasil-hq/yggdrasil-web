import { describe, expect, it } from "vitest";
import {
  canReplyToGrill,
  canRetryGrill,
  featureEntryPath,
  grillBubbleFor,
  grillPlaceholder,
  grillRoutePath,
  grillStoppedMessage,
  isGrillLive,
  isGrillProcessing,
  isGrillStopped,
} from "@/lib/features/grill";
import type { FeatureEvent } from "@/lib/features/types";

function event(overrides: Partial<FeatureEvent>): FeatureEvent {
  return {
    id: "event",
    type: "agent_text",
    question: null,
    markdown: null,
    message: null,
    status: null,
    prUrl: null,
    summary: null,
    snapshot: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * These predicates were lifted verbatim out of the embedded SpecGrillPanel
 * when the grill chat moved to its own full-page route (yggdrasil-web#1).
 * They're pinned here so the move can't silently change the gating.
 */
describe("grill route", () => {
  it("is a detail view of the Spec stage, not a seventh stage", () => {
    expect(grillRoutePath("proj_1", "feat_1")).toBe("/projects/proj_1/features/feat_1/grill");
  });
});

describe("featureEntryPath", () => {
  it("sends a draft feature to the grill chat", () => {
    expect(featureEntryPath("proj_1", "feat_1", { status: "draft", adrApproved: false })).toBe(
      "/projects/proj_1/features/feat_1/grill",
    );
  });

  it("leaves every other status on the six-stage mapping", () => {
    expect(
      featureEntryPath("proj_1", "feat_1", { status: "spec_ready", adrApproved: false }),
    ).toBe("/projects/proj_1/features/feat_1/spec");
    expect(
      featureEntryPath("proj_1", "feat_1", { status: "spec_ready", adrApproved: true }),
    ).toBe("/projects/proj_1/features/feat_1/action-items");
    expect(
      featureEntryPath("proj_1", "feat_1", { status: "running", adrApproved: true }),
    ).toBe("/projects/proj_1/features/feat_1/implementation");
    // A grill that failed *before* approval keeps the Spec page: that's where
    // the failed banner and its Retry button live.
    expect(
      featureEntryPath("proj_1", "feat_1", { status: "failed", adrApproved: false }),
    ).toBe("/projects/proj_1/features/feat_1/spec");
  });
});

describe("isGrillLive", () => {
  it("is live only while draft", () => {
    expect(isGrillLive({ status: "draft" })).toBe(true);
    expect(isGrillLive({ status: "spec_ready" })).toBe(false);
    expect(isGrillLive({ status: "cancelled" })).toBe(false);
  });
});

describe("grillBubbleFor", () => {
  it("maps the assistant's prose and question turns", () => {
    expect(grillBubbleFor(event({ type: "agent_text", message: "hello" }))).toEqual({
      label: "Agent",
      tone: "default",
      content: "hello",
    });
    expect(grillBubbleFor(event({ type: "ask_user", question: "Which stack?" }))).toEqual({
      label: "Agent",
      tone: "default",
      content: "Which stack?",
    });
  });

  it("renders submit_adr as a fixed summary line", () => {
    expect(grillBubbleFor(event({ type: "submit_adr" }))?.content).toBe(
      "Submitted the ADR for review.",
    );
  });

  it("maps the human's reply to a user-tone bubble", () => {
    expect(grillBubbleFor(event({ type: "user_message", message: "Postgres" }))).toEqual({
      label: "You",
      tone: "user",
      content: "Postgres",
    });
  });

  it("falls back to canned copy for a failure with no message", () => {
    expect(grillBubbleFor(event({ type: "run_failed" }))).toEqual({
      label: "System",
      tone: "error",
      content: "The grill session failed.",
    });
    expect(grillBubbleFor(event({ type: "run_cancelled" }))?.content).toBe(
      "The grill session was cancelled.",
    );
  });

  it("ignores events with no bubble", () => {
    expect(grillBubbleFor(event({ type: "run_started" }))).toBeNull();
    expect(grillBubbleFor(event({ type: "submit_build_result" }))).toBeNull();
  });
});

describe("canReplyToGrill", () => {
  it("requires both a pending question and a running job", () => {
    expect(canReplyToGrill({ awaitingUserInput: true, jobStatus: "running" })).toBe(true);
    expect(canReplyToGrill({ awaitingUserInput: false, jobStatus: "running" })).toBe(false);
    expect(canReplyToGrill({ awaitingUserInput: true, jobStatus: "completed" })).toBe(false);
    expect(canReplyToGrill({ awaitingUserInput: true, jobStatus: null })).toBe(false);
  });
});

describe("canRetryGrill", () => {
  it("stays project_init-only and never shows while running", () => {
    expect(
      canRetryGrill({ polled: true, featureType: "project_init", jobStatus: "failed" }),
    ).toBe(true);
    expect(
      canRetryGrill({ polled: true, featureType: "normal", jobStatus: "failed" }),
    ).toBe(false);
    expect(
      canRetryGrill({ polled: true, featureType: "project_init", jobStatus: "running" }),
    ).toBe(false);
  });

  it("waits for the first poll so it can't flash in", () => {
    expect(
      canRetryGrill({ polled: false, featureType: "project_init", jobStatus: "failed" }),
    ).toBe(false);
  });
});

describe("grill progress", () => {
  it("only treats a stopped job as stopped", () => {
    expect(isGrillStopped("failed")).toBe(true);
    expect(isGrillStopped("cancelled")).toBe(true);
    expect(isGrillStopped("running")).toBe(false);
    expect(isGrillStopped(null)).toBe(false);
  });

  it("shows the thinking bubble only while running with no pending question", () => {
    expect(isGrillProcessing({ awaitingUserInput: false, jobStatus: "running" })).toBe(true);
    expect(isGrillProcessing({ awaitingUserInput: true, jobStatus: "running" })).toBe(false);
    expect(isGrillProcessing({ awaitingUserInput: false, jobStatus: "failed" })).toBe(false);
  });

  it("explains an empty transcript only before the first poll resolves", () => {
    expect(grillPlaceholder({ eventCount: 0, jobStatus: null })).toBe(
      "Starting the grill session…",
    );
    expect(grillPlaceholder({ eventCount: 0, jobStatus: "completed" })).toBe(
      "Waiting for the agent to start…",
    );
    expect(grillPlaceholder({ eventCount: 0, jobStatus: "running" })).toBeNull();
    expect(grillPlaceholder({ eventCount: 2, jobStatus: null })).toBeNull();
  });

  it("appends the failure reason only for a genuine failure", () => {
    expect(grillStoppedMessage("cancelled", "boom")).toBe("Grill session cancelled.");
    expect(grillStoppedMessage("failed", "boom")).toBe("Grill session failed. boom");
    expect(grillStoppedMessage("failed", null)).toBe("Grill session failed.");
    expect(grillStoppedMessage("running", "boom")).toBeNull();
  });
});
