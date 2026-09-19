import type { EarlierGrillRun } from "./types";

/**
 * Issue #28 part 2: the pure half of "superseded runs", for the Spec page.
 *
 * Same split as the rest of this directory — vitest here runs in a `node`
 * environment with **no React testing library**, so anything with a branch worth
 * verifying lives in a module like this one rather than in JSX.
 *
 * **What this module deliberately does not do: decide which runs are earlier, or
 * which one superseded which.** Both are rules the API owns (`earlierGrillRuns`
 * in `api/src/jobs/grill-runs.ts`), and re-deriving either in the browser is how
 * the readiness predicate came to exist in two places (#35/#89). So this only
 * turns what the API said into words.
 */

/**
 * The one-line label for a run, so a list row says what happened rather than
 * showing a bare timestamp.
 *
 * **The two states are genuinely different and the wording keeps them apart.** A
 * run whose `supersededByJobId` is set had its conversation *discarded by a rewind*
 * — that is the thing a user came here to read. A run without it is simply older:
 * ADR 012's retry creates a new job without truncating anything, so nothing was
 * lost, and calling that "superseded" would promise a discard that never happened.
 * The API draws the distinction; this names it.
 */
export function describeEarlierRun(run: EarlierGrillRun, statusLabel: string): string {
  return run.supersededByJobId
    ? `${statusLabel} · superseded by a later run`
    : `${statusLabel} · an earlier run`;
}

/**
 * The section's heading, or null when there is nothing to show.
 *
 * Null rather than "0 earlier runs": a feature on its first grill has nothing
 * behind it, and a heading announcing that would be noise on the commonest case.
 * The caller renders no section at all.
 */
export function earlierRunsSummary(runs: EarlierGrillRun[]): string | null {
  if (runs.length === 0) return null;
  return runs.length === 1 ? "1 earlier run" : `${runs.length} earlier runs`;
}

/**
 * The path to a run's read-only transcript.
 *
 * Its own route rather than a query param on the grill page, deliberately: the grill
 * page is a *live* surface — it polls, holds a relay subscription, offers a reply
 * box and a rewind — and threading "actually, render a terminal run" through all of
 * that would mean disabling four behaviours by flag. A separate route makes the
 * read-only view read-only by construction.
 */
export function grillRunPath(projectId: string, featureId: string, jobId: string): string {
  return `/projects/${projectId}/features/${featureId}/runs/${jobId}`;
}

/**
 * Whether a run's transcript is still being written — i.e. whether the read-only
 * view has anything to wait for.
 *
 * A superseded run is normally terminal, but "normally" is not "always": a run can
 * be cancelled while mid-conversation, and a cancelled run has a transcript worth
 * reading. The distinction only affects whether the page says it is finished or
 * says the run ended — never what it renders.
 */
export function isRunFinished(status: EarlierGrillRun["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
