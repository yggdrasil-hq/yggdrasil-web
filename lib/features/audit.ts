import type { AuditActorKind, AuditEvent } from "./types";

/**
 * ADR 028's read side, presentation-free: action labelling/grouping, actor
 * labelling, and the pagination math the audit page renders. Kept out of the
 * component so it can be unit-tested (web has no component-testing library,
 * by convention — see src/features/lifecycle.test.ts).
 */

/**
 * The domain before the dot in an action string, in the order the filter
 * dropdown lists them. Every action the API records starts with one of these
 * (see api/src/audit/actions.ts).
 */
export const AUDIT_ACTION_GROUPS = [
  { prefix: "project.", label: "Projects" },
  { prefix: "feature.", label: "Features" },
  { prefix: "project_secret.", label: "Project secrets" },
  { prefix: "project_model_override.", label: "Project model overrides" },
  { prefix: "org.", label: "Organization" },
  { prefix: "model_provider.", label: "Model providers" },
  { prefix: "model.", label: "Model catalog" },
  { prefix: "job_model_default.", label: "Job model defaults" },
  { prefix: "github.", label: "GitHub App" },
] as const;

/**
 * Display labels for the specific actions an admin reads most often. Anything
 * missing from this map still renders (see actionLabel) by prettifying the
 * dotted string, so a newly added API action degrades gracefully instead of
 * showing blank.
 */
const ACTION_LABELS: Record<string, string> = {
  "project.created": "Project created",
  "project.updated": "Project settings updated",
  "project.deleted": "Project deleted",
  "project.repository_linked": "Repository linked",
  "project.repository_unlinked": "Repository unlinked",
  "project.marked_ready": "Initialization completed",
  "project.chart_scaffold_failed": "Helm chart scaffold failed",
  "feature.created": "Feature created",
  "feature.adr_approved": "ADR approved",
  "feature.build_started": "Build started",
  "feature.cancelled": "Feature cancelled",
  "feature.restarted": "Feature restarted",
  "feature.grill_retried": "Grill retried",
  "feature.build_retried": "Build retried",
  "feature.resumed": "Implementation resumed",
  "project_secret.updated": "Project secret set",
  "project_secret.deleted": "Project secret deleted",
  "project_model_override.set": "Project model override set",
  "project_model_override.cleared": "Project model override cleared",
  "org.created": "Organization created",
  "org.updated": "Organization updated",
  "org.invite_created": "Invite link created",
  "org.invite_revoked": "Invite link revoked",
  "org.member_joined": "Member joined",
  "org.role_changed": "Member role changed",
  "org.member_removed": "Member removed",
  "org.cluster_set": "Kubernetes cluster set",
  "org.cluster_removed": "Kubernetes cluster removed",
  "org.secret_set": "Org secret set",
  "org.secret_deleted": "Org secret deleted",
  "model_provider.created": "Provider created",
  "model_provider.updated": "Provider updated",
  "model_provider.deleted": "Provider deleted",
  "model.created": "Catalog model added",
  "model.updated": "Catalog model updated",
  "model.deleted": "Catalog model removed",
  "job_model_default.set": "Job model default set",
  "job_model_default.cleared": "Job model default cleared",
  "github.repos_synced": "Repositories synced from GitHub",
  "github.installation_updated": "GitHub App installation updated",
  "github.repositories_updated": "GitHub App repo access changed",
};

function titleCaseWords(value: string): string {
  return value
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Human label for an action, with a graceful fallback for unknown values. */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? titleCaseWords(action);
}

/** The action's domain, e.g. "project." for "project.created". */
export function actionGroupPrefix(action: string): string {
  const dot = action.indexOf(".");
  return dot === -1 ? action : `${action.slice(0, dot)}.`;
}

const ACTOR_KIND_LABELS: Record<AuditActorKind, string> = {
  user: "User",
  system: "System",
  webhook: "GitHub webhook",
  job: "Job",
};

/** Who did it: a person's name when there is one, otherwise their kind. */
export function actorLabel(
  event: Pick<AuditEvent, "actorKind" | "actorUsername" | "actorDisplayName">,
): string {
  if (event.actorUsername) {
    return event.actorDisplayName
      ? `${event.actorDisplayName} (@${event.actorUsername})`
      : `@${event.actorUsername}`;
  }
  return ACTOR_KIND_LABELS[event.actorKind] ?? event.actorKind;
}

/** The one-line summary of what an event acted on. */
export function targetLabel(
  event: Pick<AuditEvent, "action" | "projectName" | "metadata" | "targetType">,
): string {
  const metadata = event.metadata ?? {};
  const name = typeof metadata.name === "string" ? metadata.name : null;
  const title = typeof metadata.title === "string" ? metadata.title : null;
  const repository = typeof metadata.repository === "string" ? metadata.repository : null;
  const key = typeof metadata.key === "string" ? metadata.key : null;
  const jobKind = typeof metadata.jobKind === "string" ? metadata.jobKind : null;

  return title ?? repository ?? name ?? key ?? jobKind ?? event.projectName ?? "—";
}

export interface AuditPagination {
  offset: number;
  limit: number;
  total: number;
}

/** `1–50 of 213` — the page summary line. Empty string when there is nothing. */
export function paginationSummary({ offset, limit, total }: AuditPagination): string {
  if (total === 0) return "No matching events";
  const first = offset + 1;
  const last = Math.min(offset + limit, total);
  return `${first}–${last} of ${total}`;
}

export function hasPreviousPage({ offset }: AuditPagination): boolean {
  return offset > 0;
}

export function hasNextPage({ offset, limit, total }: AuditPagination): boolean {
  return offset + limit < total;
}

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Local-time rendering of an event's ISO timestamp. */
export function formatAuditTimestamp(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return createdAt;
  return TIMESTAMP_FORMATTER.format(parsed);
}
