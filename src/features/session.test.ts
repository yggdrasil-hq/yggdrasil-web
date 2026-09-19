import { describe, expect, it } from "vitest";
import type { JobSession, JobSessionState } from "@/lib/features/types";
import {
  canResumeFromSession,
  sessionNotice,
  sessionViewState,
  type SessionViewState,
} from "@/lib/features/session";

/**
 * ADR 032: the session surface's pure decisions.
 *
 * The states are the API's own five plus the two that are ours (`loading`,
 * `request_failed`), and the reason this file exists is that **the two failing
 * states must not be collapsed at the last hop**: item 5 requires a user to be able
 * to tell "this run did not save a session" from "this run's session could not be
 * retrieved", and a single "no session" line would undo that in the UI after the
 * API, the Orchestrator and the database all went to the trouble of keeping them
 * apart.
 */

function makeSession(overrides: Partial<JobSession> = {}): JobSession {
  return {
    jobId: "job-1",
    state: "available",
    outcome: "collected",
    sessionId: "s-1",
    byteSize: 4200,
    expiresAt: "2026-10-19T12:00:00.000Z",
    purgedAt: null,
    createdAt: "2026-09-19T12:00:00.000Z",
    canFork: true,
    ...overrides,
  };
}

describe("sessionViewState", () => {
  it("passes each API state through unchanged", () => {
    const states: JobSessionState[] = [
      "available",
      "expired",
      "not_collected",
      "unavailable",
      "unknown",
    ];
    for (const state of states) {
      expect(
        sessionViewState({
          loading: false,
          requestFailed: false,
          session: makeSession({ state, canFork: state === "available" }),
        }),
      ).toBe(state);
    }
  });

  it("reports loading before anything else", () => {
    expect(
      sessionViewState({ loading: true, requestFailed: true, session: null }),
    ).toBe("loading");
  });

  /**
   * The one that matters. A failed fetch means "we were not told", which must not
   * render as "there is no session" — that would assert a fact we do not know, and
   * it is the same mistake as the API collapsing `unavailable` into
   * `not_collected`, one layer up.
   */
  it("keeps a failed request apart from the run having no session", () => {
    const failed = sessionViewState({
      loading: false,
      requestFailed: true,
      session: null,
    });
    const noSession = sessionViewState({
      loading: false,
      requestFailed: false,
      session: makeSession({ state: "unknown", outcome: null, canFork: false }),
    });

    expect(failed).toBe("request_failed");
    expect(noSession).toBe("unknown");
    expect(failed).not.toBe(noSession);
  });

  it("treats a missing payload as unknown rather than as a failure", () => {
    expect(
      sessionViewState({ loading: false, requestFailed: false, session: null }),
    ).toBe("unknown");
  });
});

describe("sessionNotice", () => {
  it("says nothing when the session is available", () => {
    // A saved session is the ordinary outcome, and this surface exists for the
    // cases a user would otherwise have no account of.
    expect(sessionNotice("available")).toBeNull();
  });

  it("says nothing while loading", () => {
    expect(sessionNotice("loading")).toBeNull();
  });

  it("gives every unavailability its own sentence, with none shared", () => {
    const states: SessionViewState[] = [
      "expired",
      "not_collected",
      "unavailable",
      "unknown",
      "request_failed",
    ];
    const notices = states.map((state) => sessionNotice(state));

    for (const [index, notice] of notices.entries()) {
      expect(notice, states[index]).toBeTruthy();
    }
    // Five states, five different sentences: sharing one would be the collapse item
    // 5 forbids, arriving at the last hop instead of the first.
    expect(new Set(notices).size).toBe(states.length);
  });

  it("does not blame the run for a state it did not cause", () => {
    // `unknown` is what an install with collection switched off reports. Describing
    // it as the run's doing would be wrong, and the two are told apart by wording.
    expect(sessionNotice("unknown")).not.toContain("did not save");
    expect(sessionNotice("not_collected")).toContain("did not save");
    expect(sessionNotice("unavailable")).toContain("could not be retrieved");
  });

  it("mentions that restarting still works for every unsaved state", () => {
    // ADR 032 item 5: the *shipped* rewind remains the fallback, because it needs
    // nothing but the transcript. A notice that only said "cannot be resumed" would
    // send a user looking for a control that is right there.
    for (const state of [
      "expired",
      "not_collected",
      "unavailable",
      "unknown",
    ] as const) {
      expect(sessionNotice(state)).toContain("Restarting from here still works");
    }
  });
});

describe("canResumeFromSession", () => {
  it("permits resuming only for an available, forkable session", () => {
    expect(
      canResumeFromSession({
        state: "available",
        session: makeSession({ canFork: true }),
      }),
    ).toBe(true);
  });

  it("refuses when the API says the artifact cannot be forked", () => {
    // Read from the API's own `canFork` rather than re-derived, so this cannot
    // disagree with the service that owns the rule.
    expect(
      canResumeFromSession({
        state: "available",
        session: makeSession({ canFork: false }),
      }),
    ).toBe(false);
  });

  it("refuses while the answer is unknown, rather than optimistically allowing it", () => {
    // An optimistic control that then fails is worse than one that waits.
    for (const state of ["loading", "request_failed", "unknown"] as const) {
      expect(canResumeFromSession({ state, session: null })).toBe(false);
    }
  });

  it("refuses for every non-available state even if a payload claims otherwise", () => {
    for (const state of ["expired", "not_collected", "unavailable"] as const) {
      expect(
        canResumeFromSession({ state, session: makeSession({ canFork: true }) }),
      ).toBe(false);
    }
  });
});
