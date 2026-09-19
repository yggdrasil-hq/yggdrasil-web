import type { AwaitingReply, JobStatus } from "./types";

/**
 * Issue #92: the grill surface's view of "a human owes an answer, and it has been
 * that way for this long".
 *
 * **Why this is a module rather than a few lines in the component.** vitest runs
 * in a `node` environment with no React testing library here, deliberately, so
 * anything with a branch worth verifying lives outside JSX. Two of the three
 * decisions below are exactly that kind of branch — the countdown gate and the
 * transient-null rule — and both are the sort that a component would hide.
 *
 * The API half (`jobs/grill-wait.ts`) derives the *fact*: when the unanswered
 * question was asked, and what the Orchestrator's bound on one wait is. This
 * module does the arithmetic and decides what may be shown. Nothing here
 * re-derives waiting from the transcript, because the API already did that
 * against the same events this surface is reading.
 */

/**
 * What the page currently believes about the wait.
 *
 * `waiting-unknown-age` is a real state rather than a placeholder: the API's two
 * gates (`features.awaiting_user_input` and an open `ask_user`) are separate
 * best-effort writes made after the event row commits, so a read can land between
 * them. At that instant "waiting, age unknown" is the truthful description, and
 * reporting it is better than reporting *no* wait (which would hide the reply box
 * the user still needs) or inventing an age.
 */
export type GrillWaitView =
  | { kind: "none" }
  | { kind: "waiting-unknown-age" }
  | {
      kind: "waiting";
      since: string;
      timeoutMs: number;
      timeoutSource: AwaitingReply["timeoutSource"];
    };

export const NO_GRILL_WAIT: GrillWaitView = { kind: "none" };

/**
 * Advance the view from one poll's data.
 *
 * **`previous` is an input, and that is the whole mechanism for not flickering.**
 * `awaitingReply` is legitimately null for an instant in the middle of a genuine
 * wait — see `waiting-unknown-age` above — and a client that rendered purely from
 * the current read would blink the age away and back on the next poll, which
 * reads as the grill having been answered and then unanswered again.
 *
 * The rules, in order, and the order matters:
 *
 * 1. **A non-null `awaitingReply` always wins.** It is the only authoritative
 *    statement of the wait, so fresh data replaces sticky state immediately —
 *    including a *new* wait (a new question has a new `since`, and holding the old
 *    one would show a rising wrong age under a countdown).
 * 2. **If the flag is clear, or the job is not running, the wait is over.** This
 *    is what stops the sticky rule from becoming a leak: the user answering clears
 *    `awaitingUserInput`, and the page stops showing an age in the same poll that
 *    hides the reply composer — so the two can never disagree on screen.
 * 3. **Otherwise the flag says a human is owed an answer but the events disagree.**
 *    Keep the previous wait if there was one (the `since` did not change, so the
 *    tick simply continues), and otherwise admit the age is unknown.
 *
 * Rule 2 is gated on *both* the flag and the job status because a failed run
 * leaves the flag best-effort-cleared: a job that has stopped is not waiting on
 * anyone, whatever the flag still says.
 */
export function resolveGrillWaitView(input: {
  awaitingReply: AwaitingReply | null;
  /** The feature read's own flag — the *whether*, kept as the API keeps it. */
  awaitingUserInput: boolean;
  jobStatus: JobStatus | null;
  previous: GrillWaitView;
}): GrillWaitView {
  if (input.awaitingReply) {
    return {
      kind: "waiting",
      since: input.awaitingReply.since,
      timeoutMs: input.awaitingReply.timeoutMs,
      timeoutSource: input.awaitingReply.timeoutSource,
    };
  }

  const owed = input.awaitingUserInput && input.jobStatus === "running";
  if (!owed) return NO_GRILL_WAIT;

  return input.previous.kind === "none" ? { kind: "waiting-unknown-age" } : input.previous;
}

/**
 * Clamped age from the question's timestamp, or null when it is unreadable.
 *
 * **Clamped at zero because the clock is not something this can trust.** The
 * timestamp is written by the database and read against the browser's clock, so a
 * machine running a little slow — or a container whose clock drifted — would
 * otherwise render a *negative* age. That is not a theoretical worry for a number
 * that ticks every second, and "waiting -3 seconds" is worse than "waiting 0
 * seconds" only because it looks like a bug in the product rather than in a clock.
 *
 * Null for an unparseable `since` for the same reason: an unreadable timestamp
 * means the age is unknown, which is a state this module already models rather
 * than something to paper over with a zero.
 */
export function waitAgeMs(since: string, nowMs: number): number | null {
  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) return null;
  return Math.max(0, nowMs - sinceMs);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A coarse, live-reading duration — "38 seconds", "19 minutes", "6h 12m", "2d 4h".
 *
 * **Coarse on purpose, and the ladder is chosen so the display still visibly
 * moves.** The point of the age is magnitude, not precision: a reader wants to
 * know whether this is about to be answered or has been abandoned since
 * yesterday. Seconds under a minute keep a fresh wait obviously live; minutes
 * under an hour are the unit a person would say out loud; hours carry minutes so
 * a long wait still advances between polls rather than sitting still for an hour.
 *
 * Truncating rather than rounding is deliberate: "19 minutes" for
 * 19m59s is true, and rounding up would mean an age that reads *older* than the
 * evidence — which is the direction that pairs badly with a countdown derived
 * from the same number.
 */
export function formatWaitAge(ageMs: number): string {
  if (ageMs < MINUTE_MS) {
    const seconds = Math.floor(ageMs / 1000);
    return seconds === 1 ? "1 second" : `${seconds} seconds`;
  }
  if (ageMs < HOUR_MS) {
    const minutes = Math.floor(ageMs / MINUTE_MS);
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  if (ageMs < DAY_MS) {
    const hours = Math.floor(ageMs / HOUR_MS);
    const minutes = Math.floor((ageMs % HOUR_MS) / MINUTE_MS);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  const days = Math.floor(ageMs / DAY_MS);
  const hours = Math.floor((ageMs % DAY_MS) / HOUR_MS);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/**
 * What the surface should render, or null when it should render nothing.
 *
 * `countdownLabel` is **null unless the API said its bound was configured**, and
 * that gate is the most important rule in this module. `timeoutMs` is the API's
 * *mirror* of a value the Orchestrator owns — the two services read different env
 * files, so an operator who raised `GRILL_REPLY_TIMEOUT` on the Orchestrator
 * alone leaves the API asserting 24h over a run that will actually wait longer. A
 * countdown in that case counts to a moment that is not the deadline, and a
 * countdown that lies is worse than no countdown: it would have an operator stop
 * watching an hour before the run actually fails.
 *
 * With `"default"` the age is still shown, because *when the question was asked*
 * is a fact this client can verify from its own clock. Only the deadline is an
 * assumption, so only the deadline is withheld.
 *
 * The overdue case (`remaining <= 0`) is real rather than impossible: the
 * Orchestrator's bound is checked where the wait happens, so a page reading this
 * can observe the moment between the bound passing and the job being marked
 * failed. Saying "past its bound" is honest about the state; a countdown reading
 * "expires in 0 minutes" would look like a rounding bug.
 *
 * `ageKnown` is a field rather than something a caller infers from `ageLabel`,
 * because the alternative is comparing against the unknown-age string — which is
 * exactly how a copy tweak becomes a behaviour change.
 */
export interface GrillWaitDescription {
  /** True when `since` was readable, so the age is a measurement. */
  ageKnown: boolean;
  /** The age, or placeholder prose when it is unknown. */
  ageLabel: string;
  /** How long is left, or null when no countdown may be rendered. */
  countdownLabel: string | null;
  /** True when a configured bound has already passed. */
  overdue: boolean;
}

/** The unknown-age wording, in one place so `ageKnown` and it cannot drift. */
const UNKNOWN_AGE_LABEL = "an unknown amount of time";

export function describeGrillWait(
  view: GrillWaitView,
  nowMs: number,
): GrillWaitDescription | null {
  if (view.kind === "none") return null;

  if (view.kind === "waiting-unknown-age") {
    return {
      ageKnown: false,
      ageLabel: UNKNOWN_AGE_LABEL,
      countdownLabel: null,
      overdue: false,
    };
  }

  const age = waitAgeMs(view.since, nowMs);
  if (age === null) {
    return {
      ageKnown: false,
      ageLabel: UNKNOWN_AGE_LABEL,
      countdownLabel: null,
      overdue: false,
    };
  }

  const ageLabel = formatWaitAge(age);

  if (view.timeoutSource !== "configured") {
    return { ageKnown: true, ageLabel, countdownLabel: null, overdue: false };
  }

  const remaining = view.timeoutMs - age;
  return {
    ageKnown: true,
    ageLabel,
    countdownLabel:
      remaining <= 0
        ? `past its ${formatWaitAge(view.timeoutMs)} bound`
        : `about ${formatWaitAge(remaining)} left`,
    overdue: remaining <= 0,
  };
}

/**
 * The banner's sentence, built from the parts so the component holds no copy.
 *
 * `ageKnown` rather than an `ageLabel` comparison is what selects the wording —
 * see `GrillWaitDescription`.
 */
export function grillWaitMessage(described: GrillWaitDescription): string {
  if (!described.ageKnown) return "Waiting for your answer.";

  const base = `Waiting for your answer — ${described.ageLabel} so far`;
  return described.countdownLabel === null
    ? `${base}.`
    : `${base}, ${described.countdownLabel}.`;
}
