import type { DeployKind, ProjectDeploy, RollbackTarget } from "./types";

/**
 * ADR 022: presentation logic for the project deployments page, kept out of
 * the component so it can be unit-tested — this repo's vitest runs with
 * `environment: "node"` and has no React testing library, so anything with a
 * branch worth verifying belongs in a module like this one rather than in JSX.
 */

export const DEPLOY_KIND_LABELS: Record<DeployKind, string> = {
  deploy: "Deploy",
  rollback: "Rollback",
};

/**
 * What happened in one history row, in one sentence. A rollback is described in
 * terms of both revisions because that is the part that is easy to get wrong:
 * it does not go "back to" revision 3 in the sense of the counter rewinding —
 * it produces a new revision whose content matches 3, which is why the row
 * shows both numbers.
 */
export function describeDeploy(deploy: ProjectDeploy): string {
  if (deploy.status === "failed") {
    return deploy.kind === "rollback"
      ? `Rollback to revision ${deploy.targetRevision} failed`
      : "Deploy failed";
  }
  if (deploy.kind === "rollback") {
    return `Rolled back to revision ${deploy.targetRevision} (revision ${deploy.helmRevision})`;
  }
  return `Deployed revision ${deploy.helmRevision}`;
}

/**
 * Whether a history row is worth offering a rollback for: it must have actually
 * applied something, and it must not be the entry that is already live.
 *
 * `currentRevision` is compared by value rather than by row identity because a
 * rollback replays an older revision's content under a new number — so the
 * revision that is live is a number, not "the newest row".
 */
export function canRollBackTo(
  deploy: ProjectDeploy,
  currentRevision: number | null,
): boolean {
  if (deploy.status !== "completed") return false;
  if (deploy.helmRevision === null) return false;
  if (currentRevision !== null && deploy.helmRevision === currentRevision) return false;
  return true;
}

/** The URL to link to for a project's live deployment, or null if nothing is running. */
export function liveDeploymentUrl(status: string | null, url: string): string | null {
  return status === "completed" ? url : null;
}

/**
 * Whether a deployment operation is currently in flight, in which case the
 * rollback controls are disabled with an explanation rather than failing on
 * submit — the API refuses concurrent operations (it returns 409) and the
 * UI should say why before the user tries.
 */
export function isDeploymentInFlight(status: string | null): boolean {
  return status === "pending" || status === "running";
}

/**
 * The target a given revision resolves to, if the API still offers it. Used to
 * guard the confirm step: a target can disappear between page load and click
 * (a newer deploy prunes nothing today, but the page polls), and rolling back
 * to a revision the API no longer recognises would be a confusing 404.
 */
export function findTarget(
  targets: RollbackTarget[],
  revision: number,
): RollbackTarget | null {
  return targets.find((target) => target.revision === revision) ?? null;
}

/**
 * The revision a rollback would *replace*, phrased for the confirmation dialog
 * so a destructive action is never confirmed without stating what is being
 * undone.
 */
export function describeRollbackImpact(
  target: RollbackTarget | null,
  currentRevision: number | null,
): string {
  if (!target) return "That revision is no longer available.";
  if (currentRevision === null) {
    return `This will deploy revision ${target.revision} as the project's primary deployment.`;
  }
  return `This will replace the running revision ${currentRevision} with revision ${target.revision}. A new revision is created; the current one stays in history.`;
}
