import type { Feature, FeatureEvent, FeatureType, JobStatus } from "./types";
import { forkFailureNotice } from "./grill-resume";
import { featureStageForStatus, featureStagePath } from "./stage";

/**
 * View-state for a feature's `spec_grill` session, which has its own
 * full-page route (`/projects/:projectId/features/:featureId/grill`) rather
 * than the small embedded widget the Spec stage page used to hold.
 *
 * Every predicate here was lifted verbatim out of the old SpecGrillPanel so
 * the transcript's exact behaviour (reply gating, retry gating, the stopped
 * banner's copy) survives the move — and so it can be unit-tested, since
 * this repo's vitest setup is node-environment with no component testing
 * library (see src/features/*.test.ts).
 */

/**
 * How often the grill surface re-reads the feature and its job events while the
 * relay is **not** live.
 *
 * The relay landed (ADR 019), so this is the fallback rather than the norm: the
 * grill page polls at `LIVE_SAFETY_POLL_INTERVAL_MS` (30s) once its subscription
 * is confirmed and at this interval otherwise. Both paths matter — the fast one
 * is what a deployment without the relay gets, and the slow one is what keeps a
 * silently-dead relay at "a bit stale" rather than "wrong forever".
 *
 * (The previous comment here said a relay "remains a tracked follow-up, not
 * something this page changes", which stopped being true when the grill page was
 * converted; corrected rather than left to mislead the next reader.)
 */
export const GRILL_POLL_INTERVAL_MS = 2000;

export type GrillBubbleTone = "default" | "error" | "user";

export interface GrillBubbleView {
  label: string;
  tone: GrillBubbleTone;
  content: string;
}

/**
 * The grill transcript's route. Deliberately NOT a seventh entry in
 * lib/features/stage.ts's FEATURE_STAGES: that array drives the six-stage
 * tab nav and its done/active/upcoming arithmetic (ADR 015), and adding a
 * stage there would corrupt it. The grill is a detail view *of* the Spec
 * stage, reached by CTA, not a stage of its own.
 */
export function grillRoutePath(projectId: string, featureId: string): string {
  return `/projects/${projectId}/features/${featureId}/grill`;
}

/**
 * Whether a feature is currently in a grill-able state — i.e. the transcript
 * is live and replies/cancel are meaningful. Same condition the Spec stage
 * page used to gate the embedded panel on.
 */
export function isGrillLive(feature: Pick<Feature, "status">): boolean {
  return feature.status === "draft";
}

/**
 * Where the bare `/features/:featureId` route should send a feature. A
 * `draft` feature's Spec stage has no ADR content yet — the grill transcript
 * *is* its spec stage, so it lands on the full-page grill instead. Every
 * other status keeps redirecting through the six-stage mapping, which is
 * what lib/features/stage.ts already computes.
 */
export function featureEntryPath(
  projectId: string,
  featureId: string,
  feature: Pick<Feature, "status" | "adrApproved">,
): string {
  if (isGrillLive(feature)) {
    return grillRoutePath(projectId, featureId);
  }
  return featureStagePath(projectId, featureId, featureStageForStatus(feature));
}

/** Maps one curated job event onto its transcript bubble. */
export function grillBubbleFor(event: FeatureEvent): GrillBubbleView | null {
  switch (event.type) {
    case "ask_user":
      return { label: "Agent", tone: "default", content: event.question ?? "" };
    case "agent_text":
      return { label: "Agent", tone: "default", content: event.message ?? "" };
    case "submit_adr":
      return {
        label: "Agent",
        tone: "default",
        content: "Submitted the ADR for review.",
      };
    case "run_failed":
      return {
        label: "System",
        tone: "error",
        content: event.message ?? "The grill session failed.",
      };
    case "run_cancelled":
      return {
        label: "System",
        tone: "error",
        content: event.message ?? "The grill session was cancelled.",
      };
    case "user_message":
      return { label: "You", tone: "user", content: event.message ?? "" };
    /*
     * ADR 032 item 3. Without this arm a `fork_failed` event renders as **nothing** —
     * both the agent's own sentence and the stage it names are dropped at the last
     * hop, leaving a run that is `failed` with a transcript that does not say why.
     * `forkFailureNotice`'s wording rather than the raw `message`, because the stage is
     * what tells the reader what to do about it.
     */
    case "fork_failed":
      return { label: "System", tone: "error", content: forkFailureNotice(event) };
    default:
      return null;
  }
}

/**
 * Whether the reply composer renders. Both halves matter: the agent must
 * actually be waiting on a human (`awaitingUserInput`, set by an `ask_user`
 * event) *and* the job must still be running.
 */
export function canReplyToGrill(input: {
  awaitingUserInput: boolean;
  jobStatus: JobStatus | null;
}): boolean {
  return input.awaitingUserInput && input.jobStatus === "running";
}

/**
 * The retry affordance's exact gate, unchanged from the embedded panel:
 * scoped to `project_init` (ADR 007 — general re-grilling of normal features
 * is a separate, still-open question), never while a run is in flight, and
 * gated on `polled` so the button doesn't flash in before the first poll has
 * had a chance to find a running job.
 */
export function canRetryGrill(input: {
  polled: boolean;
  featureType: FeatureType;
  jobStatus: JobStatus | null;
}): boolean {
  return (
    input.polled && input.featureType === "project_init" && input.jobStatus !== "running"
  );
}

/** A grill run that stopped — cleanly cancelled or failed. */
export function isGrillStopped(jobStatus: JobStatus | null): boolean {
  return jobStatus === "failed" || jobStatus === "cancelled";
}

/** The "agent is thinking" bubble: running, with no pending question. */
export function isGrillProcessing(input: {
  awaitingUserInput: boolean;
  jobStatus: JobStatus | null;
}): boolean {
  return input.jobStatus === "running" && !input.awaitingUserInput;
}

/**
 * Placeholder copy for an empty transcript, or null once there's something
 * to show. Null `jobStatus` means the first poll hasn't resolved yet.
 */
export function grillPlaceholder(input: {
  eventCount: number;
  jobStatus: JobStatus | null;
}): string | null {
  if (input.eventCount !== 0) return null;
  if (input.jobStatus === null) return "Starting the grill session…";
  if (input.jobStatus !== "running") return "Waiting for the agent to start…";
  return null;
}

/**
 * The stopped banner's copy — the underlying `jobs.last_error` is appended
 * only for a genuine failure, never for an intentional cancel.
 */
export function grillStoppedMessage(
  jobStatus: JobStatus | null,
  lastError: string | null,
): string | null {
  if (!isGrillStopped(jobStatus)) return null;
  const base = `Grill session ${jobStatus === "cancelled" ? "cancelled" : "failed"}.`;
  return jobStatus === "failed" && lastError ? `${base} ${lastError}` : base;
}
