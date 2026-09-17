import type { Feature, FeatureEvent, JobStatus } from "./types";

/**
 * View-state for ADR 024's per-message grill restart ("restart from here").
 *
 * Kept out of lib/features/grill.ts so the transcript's existing behaviour
 * (which wave 1 moved there verbatim) is not disturbed, and so this module's
 * rules can be tested exhaustively — this repo's vitest is node-environment
 * with no component testing library, so every decision the page makes has to
 * live somewhere testable like this.
 *
 * The control is deliberately narrow. "Restart from here" discards real work
 * (everything after the chosen turn, including an ADR that may already be
 * approved), so it appears only where the API would actually accept it, and it
 * always takes two clicks.
 */

/**
 * The only transcript bubbles a turn can be restarted from — the ones that
 * read as part of the conversation.
 *
 * The API enforces the same set, and the two must agree: offering a restart on
 * a `submit_adr` bubble would produce a 404 the user cannot act on.
 */
const RESTARTABLE_EVENT_TYPES = ["agent_text", "ask_user", "user_message"];

/** The feature states the API accepts a rewind from (see the ADR's decision section). */
const RESTARTABLE_STATUSES = ["draft", "spec_ready", "failed", "cancelled"];

/** Whether a bubble can be a restart target. */
export function isRestartableTurn(event: Pick<FeatureEvent, "type">): boolean {
  return RESTARTABLE_EVENT_TYPES.includes(event.type);
}

/**
 * Whether the page offers restart controls at all.
 *
 * `jobKind` is what stops the control appearing on a *failed build's*
 * transcript: a build failure also leaves a feature `failed`, but its events
 * are not a grill conversation and the API refuses them.
 *
 * A run that is still going is excluded too — a live session is steered with
 * the reply composer (ADR 006), and rewinding underneath it would race the
 * agent still writing to the transcript.
 */
export function canRestartFromMessage(input: {
  status: Feature["status"];
  jobKind: string | null;
  jobStatus: JobStatus | null;
  hasTranscript: boolean;
}): boolean {
  if (!RESTARTABLE_STATUSES.includes(input.status)) return false;
  if (input.jobKind !== "spec_grill") return false;
  if (input.jobStatus === "running") return false;
  return input.hasTranscript;
}

/**
 * The confirmation copy, shown before anything is discarded.
 *
 * It names what is lost rather than asking a vague "are you sure?" — the
 * irreversible part is that the conversation after the chosen turn, and any
 * ADR that came out of it, go away.
 */
export function restartConfirmCopy(input: { isAdrApproved: boolean }): string {
  const base =
    "Restart the grill from this message? This feature goes back to draft and a new " +
    "session starts from the conversation up to this point — everything after it is discarded.";
  return input.isAdrApproved
    ? `${base} The approved ADR is discarded too, because it was produced after this point.`
    : base;
}

/**
 * The short note shown on a run that came from a rewind.
 *
 * Worth surfacing because the transcript on screen is only the *new* run's, so
 * without this the page looks like it simply lost the earlier conversation.
 */
export function restartedNotice(restartedFromEventId: string | null): string | null {
  if (!restartedFromEventId) return null;
  return "This session was restarted from an earlier message. The conversation up to that point is the context the agent started from; later turns were deliberately discarded.";
}
