import type { AgenticReview } from "./types";

export interface AgenticReviewView {
  verdict: "approved" | "changes_requested" | null;
  blockingCount: number;
  approved: boolean;
}

/** The high-level verdict + blocking-finding count used for banner + tabs. */
export function agenticReviewToView(
  review: AgenticReview,
): AgenticReviewView {
  const blockingCount = review.findings.filter((finding) => finding.blocking).length;
  return {
    verdict: review.verdict,
    blockingCount,
    approved: review.verdict === "approved",
  };
}

export function blockStatusLabel(blockingCount: number): string {
  if (blockingCount === 0) return "no blocking issues";
  return `${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"}`;
}