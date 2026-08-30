import type { Feature } from "./types";

/**
 * ADR 015's six lifecycle stages (Spec → Action Items → Implementation →
 * Testing → Agentic Review → Manual Review), matching design/README.md's
 * route map and design/projects/detail/features/detail/*'s six wireframes.
 */
export type FeatureStageId =
  | "spec"
  | "action-items"
  | "implementation"
  | "testing"
  | "agentic-review"
  | "manual-review";

export interface FeatureStageMeta {
  id: FeatureStageId;
  label: string;
}

/** Order matters — drives both the tab nav and done/active/upcoming math. */
export const FEATURE_STAGES: FeatureStageMeta[] = [
  { id: "spec", label: "Spec" },
  { id: "action-items", label: "Action Items" },
  { id: "implementation", label: "Implementation" },
  { id: "testing", label: "Testing" },
  { id: "agentic-review", label: "Agentic Review" },
  { id: "manual-review", label: "Manual Review" },
];

const STAGE_ORDER = FEATURE_STAGES.map((stage) => stage.id);

/**
 * Which of the six stages a feature's current status/adrApproved represents.
 * Used to redirect the bare `/features/:featureId` route to the right stage
 * and to compute the stage-tab nav's done/active/upcoming state.
 *
 * `spec_ready`, `failed`, and `cancelled` are ambiguous between two stages —
 * they can occur either before or after ADR approval — so `adrApproved`
 * disambiguates them exactly like the pre-split page's own
 * Retry-grill-vs-Retry-build branching already did.
 */
export function featureStageForStatus(
  feature: Pick<Feature, "status" | "adrApproved">,
): FeatureStageId {
  switch (feature.status) {
    case "draft":
      return "spec";
    case "spec_ready":
      return feature.adrApproved ? "action-items" : "spec";
    case "queued":
    case "running":
    case "returned":
      return "implementation";
    case "failed":
    case "cancelled":
      return feature.adrApproved ? "implementation" : "spec";
    case "testing":
      return "testing";
    case "agentic_review":
      return "agentic-review";
    case "in_review":
    case "merged":
      return "manual-review";
    default:
      return "spec";
  }
}

export type FeatureStageProgress = "done" | "active" | "upcoming";

/** Where `stage` sits relative to `currentStage` in the fixed six-stage order. */
export function featureStageProgress(
  stage: FeatureStageId,
  currentStage: FeatureStageId,
): FeatureStageProgress {
  const stageIndex = STAGE_ORDER.indexOf(stage);
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "active";
  return "upcoming";
}

export function featureStagePath(
  projectId: string,
  featureId: string,
  stage: FeatureStageId,
): string {
  return `/projects/${projectId}/features/${featureId}/${stage}`;
}
