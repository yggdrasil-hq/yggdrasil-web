"use client";

import { ManualReviewPanel } from "@/components/features/manual-review-panel";
import { useFeatureDetail } from "@/components/features/feature-detail-context";

/**
 * Manual Review stage (ADR 015 item 17 — a UI grouping of `in_review`,
 * `returned`, and `merged`, not a distinct job kind). Ports ManualReviewPanel
 * straight out of the old combined page's identical status condition. Note
 * `returned` renders here too (PR + ADR context, "Changes Requested" tab)
 * *and* on the Implementation page (the actionable "Resume implementation"
 * banner) — the old single page showed both simultaneously for a returned
 * feature, so splitting by stage keeps both rather than picking one.
 */
export function FeatureManualReviewClient() {
  const { feature } = useFeatureDetail();

  if (
    feature.status !== "in_review" &&
    feature.status !== "returned" &&
    feature.status !== "merged"
  ) {
    return (
      <div className="rounded-md border border-dashed border-rime px-4 py-5 text-sm text-shadow">
        This feature hasn&apos;t opened a pull request yet — manual review starts once Agentic
        Review approves.
      </div>
    );
  }

  return <ManualReviewPanel projectId={feature.projectId} feature={feature} />;
}
