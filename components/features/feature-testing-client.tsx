"use client";

import { TestingPanel } from "@/components/features/testing-panel";
import { useFeatureDetail } from "@/components/features/feature-detail-context";

/**
 * Testing stage (ADR 015 items 9-11). TestingPanel self-fetches and handles
 * its own loading/empty state regardless of the feature's current status,
 * so results stay visible here even after the feature moves on to later
 * stages — it no longer needs to be gated on `status === "testing"` the way
 * the old combined page gated it.
 */
export function FeatureTestingClient() {
  const { projectId, featureId } = useFeatureDetail();
  return <TestingPanel projectId={projectId} featureId={featureId} />;
}
