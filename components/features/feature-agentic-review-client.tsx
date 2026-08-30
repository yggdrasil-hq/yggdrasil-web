"use client";

import { AgenticReviewPanel } from "@/components/features/agentic-review-panel";
import { useFeatureDetail } from "@/components/features/feature-detail-context";

/**
 * Agentic Review stage (ADR 015 items 13-16). AgenticReviewPanel self-fetches
 * and handles its own empty state regardless of the feature's current
 * status, so a finished review stays visible here even after the feature
 * moves on to Manual Review.
 */
export function FeatureAgenticReviewClient() {
  const { projectId, featureId } = useFeatureDetail();
  return <AgenticReviewPanel projectId={projectId} featureId={featureId} />;
}
