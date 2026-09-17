import { describe, expect, it } from "vitest";
import {
  canRestartFromMessage,
  isRestartableTurn,
  restartConfirmCopy,
  restartedNotice,
} from "@/lib/features/grill-restart";

const allowed = {
  status: "draft" as const,
  jobKind: "spec_grill",
  jobStatus: "completed" as const,
  hasTranscript: true,
};

describe("isRestartableTurn", () => {
  it("accepts the three conversation-turn types", () => {
    for (const type of ["agent_text", "ask_user", "user_message"]) {
      expect(isRestartableTurn({ type } as never)).toBe(true);
    }
  });

  it("refuses terminal and system events, which the API would reject anyway", () => {
    for (const type of ["submit_adr", "run_failed", "run_cancelled", "run_started"]) {
      expect(isRestartableTurn({ type } as never)).toBe(false);
    }
  });
});

describe("canRestartFromMessage", () => {
  it("allows a finished grill on a feature still in Spec", () => {
    expect(canRestartFromMessage(allowed)).toBe(true);
  });

  it("allows the stopped states too, which are the likeliest reason to rewind", () => {
    for (const status of ["draft", "spec_ready", "failed", "cancelled"] as const) {
      expect(canRestartFromMessage({ ...allowed, status })).toBe(true);
    }
  });

  it("refuses once work is in flight or past review", () => {
    for (const status of [
      "queued",
      "running",
      "testing",
      "agentic_review",
      "in_review",
      "merged",
      "returned",
    ] as const) {
      expect(canRestartFromMessage({ ...allowed, status })).toBe(false);
    }
  });

  it("refuses a transcript that is not a grill at all", () => {
    // A failed build also leaves the feature `failed`, and its events are not a
    // grill conversation — offering the control there would be an unactionable 409.
    expect(canRestartFromMessage({ ...allowed, status: "failed", jobKind: "feature_build" })).toBe(
      false,
    );
    expect(canRestartFromMessage({ ...allowed, jobKind: null })).toBe(false);
  });

  it("refuses while the run is still going, which the reply composer steers", () => {
    expect(canRestartFromMessage({ ...allowed, jobStatus: "running" })).toBe(false);
  });

  it("refuses with nothing to restart from", () => {
    expect(canRestartFromMessage({ ...allowed, hasTranscript: false })).toBe(false);
  });

  it("still allows a run that failed, so a dead session can be rewound", () => {
    expect(canRestartFromMessage({ ...allowed, status: "failed", jobStatus: "failed" })).toBe(true);
  });
});

describe("restartConfirmCopy", () => {
  it("says what is discarded rather than asking a bare are-you-sure", () => {
    const copy = restartConfirmCopy({ isAdrApproved: false });
    expect(copy).toContain("back to draft");
    expect(copy).toContain("discarded");
  });

  it("adds the ADR warning only when an ADR would actually be lost", () => {
    expect(restartConfirmCopy({ isAdrApproved: true })).toContain("approved ADR is discarded");
    expect(restartConfirmCopy({ isAdrApproved: false })).not.toContain("approved ADR");
  });
});

describe("restartedNotice", () => {
  it("explains a transcript that starts mid-conversation", () => {
    const notice = restartedNotice("event-1");
    expect(notice).toContain("restarted from an earlier message");
    expect(notice).toContain("discarded");
  });

  it("is absent for an ordinary run", () => {
    expect(restartedNotice(null)).toBeNull();
  });
});
