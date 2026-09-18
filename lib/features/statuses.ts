export type FeatureStatus =
  | "draft"
  | "spec_ready"
  | "queued"
  | "running"
  | "testing"
  | "agentic_review"
  | "in_review"
  | "returned"
  | "merged"
  | "failed"
  | "cancelled";

export type FeatureStatusSetBy = "user" | "system";

export interface FeatureStatusMeta {
  id: FeatureStatus;
  label: string;
  setBy: FeatureStatusSetBy;
  color: string;
}

export const FEATURE_STATUSES: FeatureStatusMeta[] = [
  { id: "draft", label: "Spec grill", setBy: "system", color: "#6B7A8A" },
  { id: "spec_ready", label: "ADR review", setBy: "user", color: "#2FD4C6" },
  { id: "queued", label: "Queued", setBy: "system", color: "#7A8A9A" },
  { id: "running", label: "Building", setBy: "system", color: "#4F9BF0" },
  { id: "testing", label: "Testing", setBy: "system", color: "#8A6CE0" },
  { id: "agentic_review", label: "Agentic review", setBy: "system", color: "#3AA0C0" },
  { id: "in_review", label: "In review", setBy: "user", color: "#5BC0E8" },
  { id: "returned", label: "Returned", setBy: "user", color: "#E2A13C" },
  { id: "merged", label: "Merged", setBy: "user", color: "#46C285" },
  { id: "failed", label: "Failed", setBy: "system", color: "#C84A52" },
  { id: "cancelled", label: "Cancelled", setBy: "user", color: "#6B7A8A" },
];

export const FEATURE_STATUS_ORDER = FEATURE_STATUSES.map((s) => s.id);

export type FeatureBucket = "planned" | "inProgress" | "completed";

/**
 * Which home-page bucket a feature status belongs to, or null for a status this
 * version does not know.
 *
 * **Mirrors the API's implementation** (`api/src/projects/types.ts`), which is
 * authoritative because it is what computes the counts the home page renders.
 * That matters more than it looks: this function previously fell through to
 * `"completed"` for an unrecognised status while the API returned null and the
 * MSW fixture incremented `inProgress` — three spellings of one rule that agree
 * on today's eleven statuses and disagree on the twelfth. Since a new status is
 * added by editing an enum, "silently wrong bucket until someone notices" is the
 * default outcome of leaving them unaligned.
 *
 * Null rather than a bucket for an unknown status, matching the API: guessing
 * puts a feature in a section nobody looks at, and not counting it is the honest
 * answer to "which bucket is this".
 *
 * It has one real caller — the MSW fixture's overview counts — which previously
 * reimplemented this mapping inline (issue #66).
 */
export function getFeatureBucket(status: FeatureStatus): FeatureBucket | null {
  if (status === "draft" || status === "spec_ready") return "planned";
  if (
    status === "queued" ||
    status === "running" ||
    status === "testing" ||
    status === "agentic_review" ||
    status === "in_review" ||
    status === "returned" ||
    status === "failed"
  ) {
    return "inProgress";
  }
  if (status === "merged" || status === "cancelled") return "completed";
  return null;
}

export function getStatusMeta(status: FeatureStatus): FeatureStatusMeta {
  const meta = FEATURE_STATUSES.find((s) => s.id === status);
  if (!meta) {
    throw new Error(`Unknown feature status: ${status}`);
  }
  return meta;
}

export const ACTION_QUEUE_LABELS: Record<string, string> = {
  grill_response_needed: "Grill response needed",
  adr_review: "ADR review",
  start_build: "Start build",
  pr_review: "PR review",
  changes_requested: "Returned",
  test_failure: "Test failure",
  failed_build: "Failed build",
  fix_github_access: "Fix GitHub access",
};