"use client";

import { useEffect, useState } from "react";
import { BuildProgressPanel } from "@/components/features/build-progress-panel";
import { useFeatureDetail } from "@/components/features/feature-detail-context";
import { Button } from "@/components/ui/button";
import {
  fetchFeature,
  fetchFeatureEvents,
  resumeFeatureImplementation,
  retryFeatureBuild,
} from "@/lib/api";

/**
 * Implementation stage (ADR 015: `queued`, `running`, a build `failed` after
 * ADR approval, and `returned` — the three "sent back to Implementation"
 * reasons unified under one state per item 17). Ports the build-progress
 * panel and both the "failed build" and "returned" banners straight out of
 * the old combined FeatureDetailClient.
 */
export function FeatureImplementationClient() {
  const { projectId, featureId, feature, setFeature } = useFeatureDetail();
  const [retryingBuild, setRetryingBuild] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (feature.status !== "failed" || !feature.adrApproved) {
      setLastError(null);
      return;
    }
    let active = true;
    fetchFeatureEvents(projectId, featureId)
      .then((data) => {
        if (active) setLastError(data.lastError);
      })
      .catch(() => {
        // Best-effort: the generic banner copy still renders without this.
      });
    return () => {
      active = false;
    };
  }, [projectId, featureId, feature.status, feature.adrApproved]);

  async function handleRetryBuild() {
    setRetryingBuild(true);
    setError(null);
    try {
      await retryFeatureBuild(projectId, featureId);
      const updated = await fetchFeature(projectId, featureId);
      setFeature(updated);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Failed to retry build");
    } finally {
      setRetryingBuild(false);
    }
  }

  async function handleResume() {
    setResuming(true);
    setError(null);
    try {
      await resumeFeatureImplementation(projectId, featureId);
      const updated = await fetchFeature(projectId, featureId);
      setFeature(updated);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Failed to resume");
    } finally {
      setResuming(false);
    }
  }

  const notReached =
    feature.status === "draft" ||
    feature.status === "spec_ready" ||
    (feature.status === "failed" && !feature.adrApproved);

  const alreadyPast =
    feature.status === "testing" ||
    feature.status === "agentic_review" ||
    feature.status === "in_review" ||
    feature.status === "merged";

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {(feature.status === "queued" || feature.status === "running") && (
        <BuildProgressPanel
          projectId={projectId}
          featureId={featureId}
          onFeatureChange={setFeature}
        />
      )}

      {feature.status === "failed" && feature.adrApproved && (
        <section className="rounded-card border border-red-500/30 bg-red-500/10 p-6">
          <h2 className="text-base font-semibold text-frost">This feature failed</h2>
          <p className="mt-1 text-sm text-mist">The build didn&apos;t complete successfully.</p>
          {lastError && (
            <p className="mt-2 rounded-md bg-surface-02 p-3 font-mono text-xs text-red-400">
              {lastError}
            </p>
          )}
          <Button
            className="mt-4"
            disabled={retryingBuild}
            onClick={() => void handleRetryBuild()}
          >
            {retryingBuild ? "Retrying…" : "Retry build"}
          </Button>
        </section>
      )}

      {feature.status === "returned" && (
        <section className="rounded-card border border-amber-500/30 bg-amber-500/10 p-6">
          <h2 className="text-base font-semibold text-frost">Returned for changes</h2>
          <p className="mt-1 text-sm text-mist">
            Sent back to implementation
            {feature.returnReason ? ` (${feature.returnReason})` : ""}.
          </p>
          {feature.returnComment ? (
            <p className="mt-2 rounded-md bg-surface-02 p-3 text-sm text-frost">
              {feature.returnComment}
            </p>
          ) : null}
          <Button className="mt-4" disabled={resuming} onClick={() => void handleResume()}>
            {resuming ? "Resuming…" : "Resume implementation"}
          </Button>
        </section>
      )}

      {feature.status === "cancelled" && feature.adrApproved && (
        <section className="rounded-card border border-rime bg-surface-01 p-6">
          <h2 className="text-base font-semibold text-frost">This feature was cancelled</h2>
          <p className="mt-1 text-sm text-mist">The build was stopped.</p>
        </section>
      )}

      {notReached ? (
        <div className="rounded-md border border-dashed border-rime px-4 py-5 text-sm text-shadow">
          Implementation hasn&apos;t started yet — it starts once every Action Item resolves and
          the build is dispatched.
        </div>
      ) : null}

      {alreadyPast ? (
        <div className="rounded-md border border-dashed border-rime px-4 py-5 text-sm text-shadow">
          Implementation finished — see Testing, Agentic Review, or Manual Review for what
          happened next.
        </div>
      ) : null}
    </div>
  );
}
