import { describe, expect, it } from "vitest";
import { getLatestDesignSnapshot, isDesignReplyPending } from "@/lib/features/design";
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

describe("design session event helpers", () => {
  it("uses the newest complete snapshot", () => {
    const snapshot = getLatestDesignSnapshot([
      event({ type: "update_design_preview", snapshot: { "page.html": "old" } }),
      event({ type: "agent_text" }),
      event({ type: "submit_design", snapshot: { "page.html": "new", "app.css": "body{}" } }),
    ]);
    expect(snapshot).toEqual({ "page.html": "new", "app.css": "body{}" });
  });

  it("only enables replies for an unanswered ask_user event", () => {
    expect(isDesignReplyPending([event({ type: "ask_user", question: "Which layout?" })])).toBe(true);
    expect(isDesignReplyPending([
      event({ type: "ask_user", question: "Which layout?" }),
      event({ type: "user_message", message: "Cards" }),
    ])).toBe(false);
  });
});
