import type { FeatureStatus } from "./statuses";

export type ManualReviewSubview = "in_review" | "changes_requested" | "merged";

export const MANUAL_REVIEW_SUBVIEWS: {
  id: ManualReviewSubview;
  label: string;
}[] = [
  { id: "in_review", label: "In Review" },
  { id: "changes_requested", label: "Changes Requested" },
  { id: "merged", label: "Merged" },
];

/** Map a concrete feature state onto the Manual Review grouping tab. */
export function manualReviewSubviewForStatus(
  status: FeatureStatus,
): ManualReviewSubview {
  switch (status) {
    case "returned":
      return "changes_requested";
    case "merged":
      return "merged";
    default:
      return "in_review";
  }
}

export function manualReviewStatusCopy(
  subview: ManualReviewSubview,
  feature: { status: FeatureStatus; returnComment?: string | null },
): string {
  switch (subview) {
    case "in_review":
      return "Draft pull request opened, awaiting review.";
    case "changes_requested":
      return "A reviewer requested changes. Returned to implementation" +
        (feature.returnComment ? `: "${feature.returnComment}"` : " with a comment") +
        ".";
    case "merged":
      return "Pull request merged.";
  }
}