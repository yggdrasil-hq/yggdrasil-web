import type { JobSession } from "./types";

/**
 * ADR 032: the pure half of "what became of this run's session".
 *
 * The Web app has no React testing library (deliberately — vitest runs in a `node`
 * environment), so every decision this surface makes lives here where it can be
 * unit-tested, and the component is left with markup and fetching. Same shape and
 * same reasoning as `lib/features/recordings.ts`.
 *
 * **Why the states are not collapsed.** ADR 032 item 5 requires the user to be able
 * to tell "this run did not save a session" from "this run's session could not be
 * retrieved", and the API reports them separately for exactly this reason. A single
 * "no session available" line would undo that at the last hop — which is the
 * "declared, marshalled and discarded" shape this suite keeps finding, except here
 * it would be discarded *in the UI*.
 */

/**
 * What the surface should render.
 *
 * The five API states plus three client-side ones. `loading` and `requestFailed`
 * are ours; `unavailable` deliberately does **not** double as the API's
 * `unavailable` — see `sessionViewState`, which keeps them distinct because they
 * are different claims. Keeping all eight in one union means the component has a
 * single switch to get right rather than a pile of booleans that can contradict
 * each other.
 */
export type SessionViewState =
  | "loading"
  | "request_failed"
  | "available"
  | "expired"
  | "not_collected"
  | "unavailable"
  | "unknown";

/**
 * The view state for one run.
 *
 * `requestFailed` is a separate input rather than being folded into `session`
 * because "the API could not tell us" must not be rendered as "there is no
 * session": the second quietly asserts a fact we do not know — and it is the same
 * mistake as the API collapsing `unavailable` into `not_collected`, one layer up.
 * If a fetch fails the UI says so and offers a retry.
 */
export function sessionViewState(input: {
  loading: boolean;
  requestFailed: boolean;
  session: JobSession | null;
}): SessionViewState {
  if (input.loading) return "loading";
  if (input.requestFailed) return "request_failed";
  if (!input.session) return "unknown";
  return input.session.state;
}

/**
 * The sentence shown for a state, or **null when nothing should be shown**.
 *
 * `available` renders nothing. That is the decision worth stating: a session being
 * saved is the ordinary, expected outcome, and this surface exists to explain the
 * cases the user would otherwise have no account of — the way an operator does not
 * want a banner saying everything is fine. A caller that wants the positive case
 * stated can ask for it; the default is silence.
 *
 * The three "we have nothing" states get three different sentences, and none of
 * them borrows another's. `unknown` in particular must not read as the run's fault:
 * it is what an install with collection switched off reports, and describing that
 * as "this run did not save a session" would be blaming the run for a configuration
 * choice.
 */
export function sessionNotice(state: SessionViewState): string | null {
  switch (state) {
    case "available":
      return null;
    case "loading":
      return null;
    case "expired":
      return "This run's session was saved but has since been removed after its retention window. Restarting from here still works, but it re-runs the conversation rather than resuming it.";
    case "not_collected":
      return "This run did not save a session, so it cannot be resumed. Restarting from here still works, but it re-runs the conversation rather than resuming it.";
    case "unavailable":
      return "This run's session could not be retrieved, so it cannot be resumed. Restarting from here still works, but it re-runs the conversation rather than resuming it.";
    case "unknown":
      return "No session was reported for this run, so it cannot be resumed. Restarting from here still works, but it re-runs the conversation rather than resuming it.";
    case "request_failed":
      return "Could not check whether this run's session was saved.";
  }
}

/**
 * Whether ADR 032 item 3's non-destructive "resume from here" could be attempted.
 *
 * Read from the API's own `canFork` rather than re-derived from the state, so this
 * cannot disagree with the service that owns the rule — and it is `false` for
 * anything we could not establish (`loading`, `request_failed`), because an
 * optimistic control that then fails is worse than one that waits.
 *
 * **False does not mean the restart control disappears.** ADR 024's shipped
 * destructive rewind remains available as the fallback item 5 requires; it needs
 * nothing but the transcript. This predicate is only about the resume gesture.
 */
export function canResumeFromSession(input: {
  state: SessionViewState;
  session: JobSession | null;
}): boolean {
  if (input.state !== "available") return false;
  return input.session?.canFork === true;
}
