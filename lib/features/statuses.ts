export type FeatureStatus =
  | "draft"
  | "ready"
  | "progress"
  | "input"
  | "review-agent"
  | "review"
  | "approved"
  | "rejected"
  | "failed";

export type FeatureStatusSetBy = "user" | "system";

export interface FeatureStatusMeta {
  id: FeatureStatus;
  label: string;
  setBy: FeatureStatusSetBy;
  color: string;
}

export const FEATURE_STATUSES: FeatureStatusMeta[] = [
  { id: "draft", label: "Draft", setBy: "user", color: "#6B7A8A" },
  { id: "ready", label: "Ready to Work On", setBy: "user", color: "#2FD4C6" },
  { id: "progress", label: "In Progress", setBy: "system", color: "#4F9BF0" },
  { id: "input", label: "Needs Input", setBy: "system", color: "#E2A13C" },
  {
    id: "review-agent",
    label: "Agent Review",
    setBy: "system",
    color: "#9B8CF0",
  },
  { id: "review", label: "In Review", setBy: "user", color: "#5BC0E8" },
  { id: "approved", label: "Approved", setBy: "user", color: "#46C285" },
  { id: "rejected", label: "Rejected", setBy: "user", color: "#E06C75" },
  { id: "failed", label: "Failed", setBy: "system", color: "#C84A52" },
];

export const FEATURE_STATUS_ORDER = FEATURE_STATUSES.map((s) => s.id);

export function getStatusMeta(status: FeatureStatus): FeatureStatusMeta {
  const meta = FEATURE_STATUSES.find((s) => s.id === status);
  if (!meta) {
    throw new Error(`Unknown feature status: ${status}`);
  }
  return meta;
}
