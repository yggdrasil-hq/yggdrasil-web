import type { FeatureEvent, ForkPoint, JobSession } from "./types";

/**
 * ADR 032 item 3's view-state: "resume from here".
 *
 * The sibling of `grill-restart.ts`, and deliberately a separate module rather than a
 * second half of it. The two controls share a page, a job kind and a state transition,
 * and they differ in the thing the user is choosing between: a rewind **discards** the
 * turns after the chosen one, a fork **keeps** the conversation and continues the
 * agent's own session from a point in it. Collapsing them into one module would make it
 * easy to reach for the wrong copy — and the copy is where that difference is
 * communicated, which is the whole product value ADR 032 item 3 claims.
 *
 * Everything decidable lives here because this repo's vitest is node-environment with
 * no component testing library: the component keeps markup and fetching, and every
 * sentence and condition is unit-testable.
 */

/**
 * The resume points a session offers, or null when it offers none.
 *
 * **Null covers three different situations on purpose, and the caller must not
 * flatten them.** They are `available` with no capture, `unavailable` (the capture was
 * attempted and failed) and `unknown` (nobody ever reported one) — plus a `captured`
 * empty list, which is a fourth and *is* an answer. What unites the three nulls is
 * only that no choice can be rendered from them; what separates them is what the page
 * should say instead, which is why `resumePointsRefusal` exists beside this rather
 * than this returning an empty array for all four.
 *
 * Returning `[]` for the non-captured cases would be the collapse ADR 032 item 5
 * forbids, at the last hop — the exact shape `sessionNotice` was written to avoid for
 * session states.
 */
export function resumablePoints(session: JobSession | null): ForkPoint[] | null {
  if (!session || !session.canFork) return null;
  if (session.forkPoints.state !== "captured") return null;
  const points = session.forkPoints.points ?? [];
  return points.length > 0 ? points : null;
}

/**
 * Whether the page should offer the resume gesture at all.
 *
 * Requires the bytes (`canFork`) *and* at least one point to resume from, because a
 * control with nothing to pick from is a dead end. The two are genuinely independent
 * facts and the API keeps them so; this is where they are combined into "can the user
 * do anything".
 *
 * **False does not remove the rewind.** ADR 024's destructive restart stays available
 * as the fallback item 5 requires — it needs nothing but the transcript — and that is
 * why this predicate governs one control rather than the section.
 */
export function canResumeFromHere(session: JobSession | null): boolean {
  return resumablePoints(session) !== null;
}

/**
 * What to say when the resume control is **not** offered, or null when it is.
 *
 * Three sentences rather than one, because the three cases call for different things:
 * an `unavailable` capture is worth retrying, an `unknown` one may mean collection is
 * switched off for the install, and an empty `captured` list is a fact about the run
 * that nothing will change. A single "resume unavailable" would tell a user with a
 * failed capture the same thing as a user on an install that never captures.
 */
export function resumePointsRefusal(session: JobSession | null): string | null {
  if (!session) return null;
  if (resumablePoints(session)) return null;
  if (!session.canFork) {
    // The session itself is the problem, and `sessionNotice` already words that — two
    // sentences about one fact would be free to disagree.
    return null;
  }
  switch (session.forkPoints.state) {
    case "unavailable":
      return "Which points this session can resume from could not be determined. Restarting from here still works.";
    case "unknown":
      return "No resumable points were reported for this run. Restarting from here still works.";
    case "captured":
      return "This session has no earlier messages to resume from. Restarting from here still works.";
  }
}

/**
 * The confirmation shown before a resume starts, and the copy that has to distinguish
 * it from the rewind beside it.
 *
 * It states what is **kept**, because that is what the user cannot see: the rewind
 * control sitting next to it discards the turns after its chosen point, and two
 * controls that both said "start a new session from here" would be indistinguishable at
 * the moment the choice is made. It also says what *does* change — the spec is rebuilt
 * from that reply, so an approved ADR stops being current — because promising
 * "nothing is lost" without that would be the overstatement in the other direction.
 */
export function resumeConfirmCopy(input: { isAdrApproved: boolean }): string {
  const base =
    "Resume this session from this message? A new run continues the agent's own " +
    "conversation from that point, and the earlier conversation is kept — nothing is " +
    "discarded. The spec is rebuilt from that reply.";
  return input.isAdrApproved
    ? `${base} The approved ADR stops being current, because a new one comes out of this run.`
    : base;
}

/**
 * The note shown on a run that came from a resume, or null.
 *
 * The same need `restartedNotice` answers, for the same reason: the transcript on
 * screen is only the *new* run's — the forked context lives in the restored Pi session,
 * not in `job_events` — so without this the page looks like it lost the conversation.
 * It is also what tells the two gestures apart *afterwards*, which is otherwise
 * impossible: a resumed run and a retried run both leave a transcript that starts
 * mid-conversation with no visible cause.
 */
export function resumedNotice(forkFromJobId: string | null): string | null {
  if (!forkFromJobId) return null;
  return "This session was resumed from an earlier conversation, continuing the agent's own state from the point you chose. The earlier conversation is still available below — nothing was discarded.";
}

/**
 * What each `fork_failed` stage means, in the words of what to do about it.
 *
 * ADR 032 item 3's database comment names the three as separate diagnoses — a delivery
 * fault, an unusable artifact, and a *stale resume point* — and the API stores the stage
 * precisely so a surface does not have to guess. Rendering one "the fork failed" here
 * would discard that work at the last hop, which is the shape this suite keeps finding.
 *
 * The `fork` case is the one worth stating plainly: the session was collected and the
 * point was offered, so the branch has since gone — a compaction, or a point that
 * belonged to a run superseded in the meantime. "Try again" is not the advice; picking a
 * different point, or restarting, is.
 */
export function forkFailureNotice(event: Pick<FeatureEvent, "forkStage">): string {
  switch (event.forkStage) {
    case "write":
      return "This run could not be resumed: the saved session was not delivered to the run. Resuming again may work; restarting from here does not need the session at all.";
    case "switch":
      return "This run could not be resumed: the saved session arrived but the agent could not load it, so the conversation would have been empty. Restarting from here rebuilds it from the transcript instead.";
    case "fork":
      return "This run could not be resumed: the conversation loaded, but the point you chose is no longer in it — a later part of the session was compacted, or that point belonged to a run that has since been superseded. Pick a different point, or restart from here.";
    default:
      // No stage recorded: an older Orchestrator, or a failure the API did not
      // classify. Saying "the fork failed" without inventing a cause is the honest
      // answer, and it is why the default is a sentence rather than a throw.
      return "This run could not be resumed. Restarting from here does not need the saved session.";
  }
}
