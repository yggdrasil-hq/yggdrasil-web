import { describe, expect, it } from "vitest";
import {
  canResumeFromHere,
  forkFailureNotice,
  resumeConfirmCopy,
  resumePointsRefusal,
  resumedNotice,
  resumablePoints,
} from "@/lib/features/grill-resume";
import type { JobSession } from "@/lib/features/types";

/**
 * ADR 032 item 3's resume view-state, exercised without a component.
 *
 * The distinctions under test are the whole reason this module exists rather than the
 * answers being written inline in the component: which of the three "no points" cases
 * applies, and which of the three fork stages failed, are the differences a user acts
 * on, and every one of them is a sentence rather than a flag.
 */

const POINTS = [
  { entryId: "a1b2c3d4", text: "Add a saved-cards section." },
  { entryId: "c3d4e5f6", text: "Many, with one default." },
];

function session(overrides: Partial<JobSession> = {}): JobSession {
  return {
    jobId: "job_1",
    state: "available",
    outcome: "collected",
    sessionId: "s-1",
    byteSize: 1024,
    expiresAt: null,
    purgedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    canFork: true,
    forkPoints: { state: "captured", points: POINTS },
    ...overrides,
  };
}

describe("resumablePoints", () => {
  it("returns the captured points when the session can be forked", () => {
    expect(resumablePoints(session())).toEqual(POINTS);
  });

  it("returns null when the session cannot be forked at all", () => {
    // The bytes are the first question; the points are the second. A page that offered
    // a resume on an uncollected session would be offering one the API refuses.
    expect(resumablePoints(session({ canFork: false, state: "not_collected" }))).toBeNull();
    expect(resumablePoints(null)).toBeNull();
  });

  it("returns null for a capture that failed and one that was never reported", () => {
    // Both are "we cannot show you a choice", and neither may be rendered as an empty
    // list — that is the collapse ADR 032 item 5 forbids, one layer up.
    expect(
      resumablePoints(session({ forkPoints: { state: "unavailable", points: null } })),
    ).toBeNull();
    expect(
      resumablePoints(session({ forkPoints: { state: "unknown", points: null } })),
    ).toBeNull();
  });

  it("returns null for a captured empty list, which is a real answer", () => {
    // Pi answered and there are no resumable user messages. Null here means "render no
    // choice"; it does *not* mean the same thing as the two cases above, which is why
    // the refusal beside it has three branches.
    expect(resumablePoints(session({ forkPoints: { state: "captured", points: [] } }))).toBeNull();
  });

  it("refuses the list when the state says the capture was not an answer", () => {
    /*
     * **This is the case that makes the `state` check load-bearing, and it was found by a
     * surviving mutation rather than by design.**
     *
     * For every input the API can actually produce, reading `state` and reading `points`
     * agree: the table's CHECK keeps `points` null unless the state is `captured`, so a
     * version of `resumablePoints` that ignored `state` and only checked the list length
     * passed the whole suite. Mutating the check away changed no result — which is not a
     * weak guard but an *unreachable* one.
     *
     * It becomes reachable the moment a server contradicts its own contract: an
     * `unavailable` or `unknown` capture carrying a list. That is exactly the shape ADR
     * 032 item 5 exists to forbid, and it is worth pinning because the failure would be
     * the silent one — the page would present points as an answer while the state beside
     * them said nobody found out.
     */
    const contradicting = { state: "unavailable" as const, points: POINTS };
    expect(resumablePoints(session({ forkPoints: contradicting }))).toBeNull();
    expect(
      resumablePoints(session({ forkPoints: { state: "unknown", points: POINTS } })),
    ).toBeNull();
    // And the refusal still says which case it is, rather than rendering the list.
    expect(
      resumePointsRefusal(session({ forkPoints: contradicting })),
    ).toContain("could not be determined");
  });
});

describe("canResumeFromHere", () => {
  it("requires both the bytes and at least one point", () => {
    expect(canResumeFromHere(session())).toBe(true);
    // A control with nothing to pick from is a dead end, so the two independent facts
    // are combined into "can the user do anything".
    expect(canResumeFromHere(session({ forkPoints: { state: "captured", points: [] } }))).toBe(
      false,
    );
    expect(canResumeFromHere(session({ canFork: false }))).toBe(false);
  });
});

describe("resumePointsRefusal", () => {
  it("says nothing when the control is offered", () => {
    expect(resumePointsRefusal(session())).toBeNull();
  });

  it("keeps the three reasons apart, and offers the rewind in each", () => {
    const failed = resumePointsRefusal(
      session({ forkPoints: { state: "unavailable", points: null } }),
    );
    const neverReported = resumePointsRefusal(
      session({ forkPoints: { state: "unknown", points: null } }),
    );
    const noneExist = resumePointsRefusal(
      session({ forkPoints: { state: "captured", points: [] } }),
    );

    expect(failed).not.toBe(neverReported);
    expect(neverReported).not.toBe(noneExist);
    expect(failed).not.toBe(noneExist);
    // ADR 032 item 5's fallback: the destructive rewind needs nothing but the
    // transcript, so every one of these has to say it is still available.
    for (const sentence of [failed, neverReported, noneExist]) {
      expect(sentence).toContain("Restarting from here still works");
    }
  });

  it("defers to the session notice when the session itself is the problem", () => {
    // Two sentences about one fact would be free to disagree; `sessionNotice` already
    // words an unforkable session, so this says nothing rather than a second version.
    expect(resumePointsRefusal(session({ canFork: false, state: "expired" }))).toBeNull();
    expect(resumePointsRefusal(null)).toBeNull();
  });
});

describe("resumeConfirmCopy", () => {
  it("says what is kept, because that is what distinguishes it from the rewind", () => {
    const copy = resumeConfirmCopy({ isAdrApproved: false });

    expect(copy).toContain("kept");
    // The claim, positively stated, rather than an assertion that the word "discarded"
    // is absent — the copy contains it in "nothing is discarded", and a check that the
    // substring is missing would be asserting the opposite of what it means.
    expect(copy).toContain("nothing is discarded");
    // The rewind's copy promises the reverse ("everything after it is discarded"), and
    // two adjacent controls that both read as "start over" would be indistinguishable at
    // the moment of choosing — which is the `design/` wireframe's "Resume from here"
    // having been removed once for being a control that did not exist.
    expect(copy).not.toContain("everything after it is discarded");
    expect(copy).not.toContain("goes back to draft");
  });

  it("says the spec is rebuilt, so 'nothing is lost' is not overstated", () => {
    // The conversation is kept; the settled spec is not, because a new ADR comes out of
    // the new run. Promising only the first would be the overstatement in the other
    // direction.
    expect(resumeConfirmCopy({ isAdrApproved: false })).toContain("rebuilt");

    const approved = resumeConfirmCopy({ isAdrApproved: true });
    expect(approved).toContain("stops being current");
  });
});

describe("resumedNotice", () => {
  it("explains a transcript that starts mid-conversation, and says it is still available", () => {
    const notice = resumedNotice("job_0");

    expect(notice).toContain("resumed");
    expect(notice).toContain("still available");
    // The resumed run's transcript also starts mid-conversation, and the reason is the
    // opposite of a rewind's — so the notice has to *deny* the discard rather than imply
    // it. Asserted as a denial rather than as the word's absence, since the sentence
    // contains "nothing was discarded" and an absence check would be inverted.
    expect(notice).toContain("nothing was discarded");
  });

  it("says nothing for a run that was not resumed", () => {
    expect(resumedNotice(null)).toBeNull();
  });
});

describe("forkFailureNotice", () => {
  it("gives each stage its own diagnosis and its own next step", () => {
    const write = forkFailureNotice({ forkStage: "write" });
    const switchStage = forkFailureNotice({ forkStage: "switch" });
    const fork = forkFailureNotice({ forkStage: "fork" });

    expect(new Set([write, switchStage, fork]).size).toBe(3);
    // The three are a delivery fault, an unusable artifact and a stale resume point —
    // different things to do about each, which is why one "fork failed" sentence would
    // throw away the work the column does.
    expect(write).toContain("not delivered");
    expect(switchStage).toContain("could not load");
    expect(fork).toContain("no longer in it");
  });

  it("does not tell the user to retry the point that was stale", () => {
    // The `fork` stage means the session loaded and the point was rejected, so "try
    // again" is the wrong advice — the branch is gone.
    expect(forkFailureNotice({ forkStage: "fork" })).toContain("Pick a different point");
  });

  it("does not invent a cause when no stage was recorded", () => {
    const unknown = forkFailureNotice({ forkStage: null });

    // An older Orchestrator omits the field. Naming a stage would be a guess about
    // which of three things went wrong.
    expect(unknown).toContain("could not be resumed");
    expect(unknown).not.toContain("not delivered");
    expect(unknown).not.toContain("no longer in it");
    expect(forkFailureNotice({})).toBe(unknown);
  });
});
