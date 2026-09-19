import { describe, expect, it } from "vitest";
import {
  NO_GRILL_WAIT,
  describeGrillWait,
  formatWaitAge,
  grillWaitMessage,
  resolveGrillWaitView,
  waitAgeMs,
  type GrillWaitView,
} from "@/lib/features/grill-wait";
import type { AwaitingReply } from "@/lib/features/types";

/**
 * Issue #92's Web half.
 *
 * Two of the three decisions here are the kind that would be invisible inside a
 * component, which is why they are not: **whether a countdown may be rendered at
 * all** (it may not, unless the API said its bound was configured) and **what
 * happens when `awaitingReply` goes null mid-wait** (nothing may flicker).
 * Both are asserted below, and both were mutation-tested — see each block.
 */

const TIMEOUT_MS = 24 * 60 * 60 * 1000; // the Orchestrator's default bound

function reply(overrides: Partial<AwaitingReply> = {}): AwaitingReply {
  return {
    since: "2026-01-01T10:00:00.000Z",
    timeoutMs: TIMEOUT_MS,
    timeoutSource: "default",
    ...overrides,
  };
}

/** Epoch millis for an ISO instant, so the arithmetic in a test reads plainly. */
function at(iso: string): number {
  return Date.parse(iso);
}

describe("waitAgeMs", () => {
  it("measures from the question to now", () => {
    expect(
      waitAgeMs("2026-01-01T10:00:00.000Z", at("2026-01-01T10:20:00.000Z")),
    ).toBe(20 * 60_000);
  });

  it("clamps a future timestamp to zero rather than going negative", () => {
    // The timestamp is written by the database and read against the browser's
    // clock, so a slow browser clock (or a drifted container) would otherwise
    // render "waiting -3 seconds" — which looks like a product bug rather than a
    // clock disagreement, on a number that ticks every second.
    expect(
      waitAgeMs("2026-01-01T10:00:03.000Z", at("2026-01-01T10:00:00.000Z")),
    ).toBe(0);
  });

  it("is null for an unreadable timestamp rather than zero", () => {
    // "Unknown" and "just now" are different facts, and the module already has a
    // state for unknown; collapsing them would show an age that is too small,
    // which under a countdown means understating how long the operator has left.
    expect(waitAgeMs("not-a-date", at("2026-01-01T10:00:00.000Z"))).toBeNull();
  });
});

describe("formatWaitAge", () => {
  it("uses seconds under a minute, singular at one", () => {
    expect(formatWaitAge(0)).toBe("0 seconds");
    expect(formatWaitAge(1000)).toBe("1 second");
    expect(formatWaitAge(38_000)).toBe("38 seconds");
    expect(formatWaitAge(59_999)).toBe("59 seconds");
  });

  it("uses minutes under an hour, singular at one", () => {
    expect(formatWaitAge(60_000)).toBe("1 minute");
    expect(formatWaitAge(19 * 60_000)).toBe("19 minutes");
    expect(formatWaitAge(59 * 60_000 + 59_999)).toBe("59 minutes");
  });

  it("carries minutes at hour scale so the display still advances", () => {
    // Without the minutes an hour-scale wait would sit still for a whole hour,
    // which reads as a frozen value rather than a live one.
    expect(formatWaitAge(6 * 3_600_000)).toBe("6h");
    expect(formatWaitAge(6 * 3_600_000 + 12 * 60_000)).toBe("6h 12m");
  });

  it("uses days beyond a day, and never rounds up", () => {
    expect(formatWaitAge(24 * 3_600_000)).toBe("1d");
    expect(formatWaitAge(2 * 24 * 3_600_000 + 4 * 3_600_000)).toBe("2d 4h");
    // Truncation, not rounding: an age that reads *older* than the evidence pairs
    // badly with a countdown derived from the same number.
    expect(formatWaitAge(59 * 60_000 + 59_000)).toBe("59 minutes");
    expect(formatWaitAge(23 * 3_600_000 + 59 * 60_000)).toBe("23h 59m");
  });
});

/*
 * The transient-null rule.
 *
 * `awaitingReply` is null whenever the API's two gates disagree — they are
 * separate best-effort writes after the event row commits — so a null *during* a
 * genuine wait is expected rather than a bug. A client rendering purely from the
 * current read would blink the age away and back, which reads as the grill having
 * been answered and then unanswered again.
 */
describe("resolveGrillWaitView", () => {
  const waiting: GrillWaitView = {
    kind: "waiting",
    since: "2026-01-01T10:00:00.000Z",
    timeoutMs: TIMEOUT_MS,
    timeoutSource: "configured",
  };

  it("takes a non-null awaitingReply as authoritative", () => {
    expect(
      resolveGrillWaitView({
        awaitingReply: reply({ timeoutSource: "configured" }),
        awaitingUserInput: true,
        jobStatus: "running",
        previous: NO_GRILL_WAIT,
      }),
    ).toEqual({ ...waiting, timeoutSource: "configured" });
  });

  it("replaces a previous wait with a newer one", () => {
    // A new question has a new `since`. Holding the old one would show a rising
    // wrong age *under a countdown*, which is the worst place for a wrong number.
    const next = resolveGrillWaitView({
      awaitingReply: reply({ since: "2026-01-01T11:00:00.000Z" }),
      awaitingUserInput: true,
      jobStatus: "running",
      previous: waiting,
    });

    expect(next).toMatchObject({ kind: "waiting", since: "2026-01-01T11:00:00.000Z" });
  });

  it("keeps showing the wait when a poll lands between the API's two writes", () => {
    // The case this whole function exists for: flag set, job running, events not
    // yet agreeing. Keeping the previous view means the tick continues instead of
    // the age vanishing and reappearing.
    expect(
      resolveGrillWaitView({
        awaitingReply: null,
        awaitingUserInput: true,
        jobStatus: "running",
        previous: waiting,
      }),
    ).toEqual(waiting);
  });

  it("admits an unknown age when the disagreement is the first thing seen", () => {
    // Sticky state has nothing to stick to on a cold page, and inventing an age
    // here would be worse than saying it is unknown.
    expect(
      resolveGrillWaitView({
        awaitingReply: null,
        awaitingUserInput: true,
        jobStatus: "running",
        previous: NO_GRILL_WAIT,
      }),
    ).toEqual({ kind: "waiting-unknown-age" });
  });

  /*
   * The other half of the sticky rule: it must not become a leak.
   *
   * These assert that the wait *clears*, which is what keeps rule 3 from showing
   * an age for a question the user has already answered. The `awaitingUserInput`
   * clearing and this state clearing happen on the same poll, so the reply
   * composer and the age can never disagree on screen.
   */
  it("clears once the flag is dropped, which is what the reply composer gates on too", () => {
    expect(
      resolveGrillWaitView({
        awaitingReply: null,
        awaitingUserInput: false,
        jobStatus: "running",
        previous: waiting,
      }),
    ).toEqual({ kind: "none" });
  });

  it("clears when the job is no longer running, even if the flag is stale", () => {
    // A stopped run is not waiting on anyone. The flag is cleared best-effort, so
    // a failed job can still carry it.
    for (const jobStatus of ["failed", "cancelled", "completed", null] as const) {
      expect(
        resolveGrillWaitView({
          awaitingReply: null,
          awaitingUserInput: true,
          jobStatus,
          previous: waiting,
        }),
      ).toEqual({ kind: "none" });
    }
  });

  it("shows nothing when there is no wait and nothing owed", () => {
    expect(
      resolveGrillWaitView({
        awaitingReply: null,
        awaitingUserInput: false,
        jobStatus: "running",
        previous: waiting,
      }),
    ).toEqual({ kind: "none" });
  });
});

/*
 * The countdown gate — the single most important rule in this module.
 *
 * `timeoutMs` is the API's *mirror* of a value the **Orchestrator** owns, and the
 * two services read different env files. So with `timeoutSource: "default"` the
 * number is the API's assumption about another process's environment, and a
 * countdown built on it can count to a moment that is not the deadline — an
 * operator raising the bound on the Orchestrator alone would be told to expect a
 * failure an hour before it arrives, or worse, stop watching before it does.
 */
describe("describeGrillWait — the countdown is gated on timeoutSource", () => {
  const since = "2026-01-01T10:00:00.000Z";
  const now = at("2026-01-01T16:00:00.000Z"); // six hours later

  it("shows only the age when the bound is the API's default", () => {
    const described = describeGrillWait(
      { kind: "waiting", since, timeoutMs: TIMEOUT_MS, timeoutSource: "default" },
      now,
    );

    expect(described?.ageLabel).toBe("6h");
    // The assertion that matters. `null` rather than a plausible-looking number:
    // the API cannot see the Orchestrator's environment, so it cannot promise
    // this countdown is counting to the real deadline.
    expect(described?.countdownLabel).toBeNull();
    expect(described?.ageKnown).toBe(true);
  });

  it("shows the countdown when the bound was configured", () => {
    const described = describeGrillWait(
      { kind: "waiting", since, timeoutMs: TIMEOUT_MS, timeoutSource: "configured" },
      now,
    );

    expect(described?.ageLabel).toBe("6h");
    expect(described?.countdownLabel).toBe("about 18h left");
  });

  it("says a wait is past its bound rather than counting to zero", () => {
    // Reachable in practice: the Orchestrator checks the bound where the wait
    // happens, so a page can observe the gap between the bound passing and the job
    // being marked failed. "expires in 0 minutes" would read as a rounding bug.
    const described = describeGrillWait(
      {
        kind: "waiting",
        since: "2026-01-01T10:00:00.000Z",
        timeoutMs: TIMEOUT_MS,
        timeoutSource: "configured",
      },
      at("2026-01-02T11:00:00.000Z"), // 25h later
    );

    expect(described?.ageLabel).toBe("1d 1h");
    expect(described?.countdownLabel).toBe("past its 1d bound");
    // The banner tints on this rather than on the label text, so the tone cannot
    // drift from the wording.
    expect(described?.overdue).toBe(true);
  });

  it("is not overdue while time remains", () => {
    expect(
      describeGrillWait(
        { kind: "waiting", since, timeoutMs: TIMEOUT_MS, timeoutSource: "configured" },
        now,
      )?.overdue,
    ).toBe(false);
  });

  it("renders nothing at all when there is no wait", () => {
    expect(describeGrillWait(NO_GRILL_WAIT, now)).toBeNull();
  });

  it("reports an unknown age without a countdown", () => {
    // No `since` to work from, so there is nothing a deadline could be measured
    // against — and a countdown derived from an unknown age would be fabricated.
    expect(describeGrillWait({ kind: "waiting-unknown-age" }, now)).toEqual({
      ageKnown: false,
      ageLabel: "an unknown amount of time",
      countdownLabel: null,
      overdue: false,
    });
  });

  it("treats an unreadable since as unknown rather than as just-now", () => {
    const described = describeGrillWait(
      {
        kind: "waiting",
        since: "not-a-date",
        timeoutMs: TIMEOUT_MS,
        timeoutSource: "configured",
      },
      now,
    );

    expect(described).toEqual({
      ageKnown: false,
      ageLabel: "an unknown amount of time",
      countdownLabel: null,
      overdue: false,
    });
  });

  it("does not count down from a future since", () => {
    // Clamped to zero age, so the countdown reads the full bound rather than
    // *more* than it — the over-reporting direction a negative age would take.
    const described = describeGrillWait(
      {
        kind: "waiting",
        since: "2026-01-01T17:00:00.000Z",
        timeoutMs: TIMEOUT_MS,
        timeoutSource: "configured",
      },
      now,
    );

    expect(described?.ageLabel).toBe("0 seconds");
    expect(described?.countdownLabel).toBe("about 1d left");
  });

  it("advances with the clock it is given, which is what makes it live", () => {
    // The component passes `Date.now()` on a one-second timer, so this asserts the
    // property that matters: the same view describes differently as time passes,
    // with no new data from the server.
    const view: GrillWaitView = {
      kind: "waiting",
      since,
      timeoutMs: TIMEOUT_MS,
      timeoutSource: "configured",
    };

    expect(describeGrillWait(view, at("2026-01-01T10:00:30.000Z"))?.ageLabel).toBe("30 seconds");
    expect(describeGrillWait(view, at("2026-01-01T10:01:30.000Z"))?.ageLabel).toBe("1 minute");
    expect(describeGrillWait(view, at("2026-01-01T16:00:00.000Z"))?.ageLabel).toBe("6h");
  });
});

/*
 * The banner's sentence.
 *
 * `ageKnown` selects the wording rather than a comparison against `ageLabel`,
 * which is the difference between a copy tweak and a behaviour change.
 */
describe("grillWaitMessage", () => {
  it("states the age alone when no countdown may be shown", () => {
    expect(
      grillWaitMessage({
        ageKnown: true,
        ageLabel: "6h",
        countdownLabel: null,
        overdue: false,
      }),
    ).toBe("Waiting for your answer — 6h so far.");
  });

  it("adds the countdown when one is shown", () => {
    expect(
      grillWaitMessage({
        ageKnown: true,
        ageLabel: "6h",
        countdownLabel: "about 18h left",
        overdue: false,
      }),
    ).toBe("Waiting for your answer — 6h so far, about 18h left.");
  });

  it("does not claim an age it does not have", () => {
    // The unknown-age wording is chosen by the flag, so this cannot regress into
    // "an unknown amount of time so far", which reads like a broken template.
    expect(
      grillWaitMessage({
        ageKnown: false,
        ageLabel: "an unknown amount of time",
        countdownLabel: null,
        overdue: false,
      }),
    ).toBe("Waiting for your answer.");
  });

  /*
   * A contract assertion, and it is deliberate that the input above could not
   * make it.
   *
   * The first version of this file passed `ageKnown: false` *together with* the
   * exact placeholder label — so an implementation that branched on the label text
   * rather than on the flag produced the same output and the test passed. It was
   * mutated to do exactly that (`ageLabel === "an unknown amount of time"`) and
   * **survived**, which is what exposed it.
   *
   * The realistic failure it guards is a copy tweak: reword the placeholder and a
   * text comparison silently stops matching, so the banner starts rendering
   * "an unknown amount of time so far" — a template bug rather than a crash, and
   * the kind a green suite would wave through. Asserting the flag wins regardless
   * of the wording is what makes the difference observable.
   */
  it("follows the flag, not the wording, so a copy tweak cannot change behaviour", () => {
    expect(
      grillWaitMessage({
        ageKnown: false,
        ageLabel: "some reworded placeholder",
        countdownLabel: null,
        overdue: false,
      }),
    ).toBe("Waiting for your answer.");

    // And the converse, so the assertion pins the flag rather than merely
    // rejecting this particular string.
    expect(
      grillWaitMessage({
        ageKnown: true,
        ageLabel: "an unknown amount of time",
        countdownLabel: null,
        overdue: false,
      }),
    ).toBe("Waiting for your answer — an unknown amount of time so far.");
  });
});
