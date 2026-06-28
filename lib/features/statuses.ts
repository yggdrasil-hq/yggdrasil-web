export type FeatureStatus =
  | "draft"
  | "spec_ready"
  | "queued"
  | "running"
  | "in_review"
  | "changes_requested"
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
  { id: "in_review", label: "In review", setBy: "user", color: "#5BC0E8" },
  {
    id: "changes_requested",
    label: "Changes requested",
    setBy: "user",
    color: "#E2A13C",
  },
  { id: "merged", label: "Merged", setBy: "user", color: "#46C285" },
  { id: "failed", label: "Failed", setBy: "system", color: "#C84A52" },
  { id: "cancelled", label: "Cancelled", setBy: "user", color: "#6B7A8A" },
];

export const FEATURE_STATUS_ORDER = FEATURE_STATUSES.map((s) => s.id);

export type FeatureBucket = "planned" | "inProgress" | "completed";

export function getFeatureBucket(status: FeatureStatus): FeatureBucket {
  if (status === "draft" || status === "spec_ready") return "planned";
  if (
    status === "queued" ||
    status === "running" ||
    status === "in_review" ||
    status === "changes_requested" ||
    status === "failed"
  ) {
    return "inProgress";
  }
  return "completed";
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
  changes_requested: "Changes requested",
  test_failure: "Test failure",
  failed_build: "Failed build",
  fix_github_access: "Fix GitHub access",
};
