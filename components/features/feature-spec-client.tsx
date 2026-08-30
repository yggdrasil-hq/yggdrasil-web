"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFeatureDetail } from "@/components/features/feature-detail-context";
import { SpecGrillPanel } from "@/components/features/spec-grill-panel";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { fetchFeature, fetchFeatureEvents, retryFeatureGrill, updateFeature } from "@/lib/api";
import { featureStagePath } from "@/lib/features/stage";
import { appRoute } from "@/lib/config";

/**
 * Spec stage (ADR 015: `draft`, plus the "Spec" half of `spec_ready` before
 * the ADR is approved). Ports the live grill chat and the ADR edit/approve
 * workflow straight out of the old combined FeatureDetailClient — same
 * handlers, same API calls, now scoped to this route instead of one
 * conditional block among six. "Start build" moved to the Action Items
 * page (feature-action-items-client.tsx) since it's gated on action-item
 * resolution, not ADR content.
 */
export function FeatureSpecClient() {
  const { projectId, featureId, feature, setFeature } = useFeatureDetail();
  const [adrDraft, setAdrDraft] = useState(feature.adrMarkdown ?? "");
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Keep the draft textarea in sync with live updates from elsewhere (e.g.
  // SpecGrillPanel's own polling populating adrMarkdown for the first time).
  useEffect(() => {
    setAdrDraft(feature.adrMarkdown ?? "");
  }, [feature.adrMarkdown]);

  // Surfaces the actual failure reason on the failed banner (jobs.last_error,
  // ADR 012) — only relevant here for a grill that failed before approval;
  // a build failure after approval is the Implementation page's concern.
  useEffect(() => {
    if (feature.status !== "failed" || feature.adrApproved) {
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

  async function handleSaveAdr() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFeature(projectId, featureId, { adrMarkdown: adrDraft });
      setFeature(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save ADR");
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveAdr() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFeature(projectId, featureId, { approveAdr: true });
      setFeature(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to approve ADR");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetryGrill() {
    setRetrying(true);
    setError(null);
    try {
      await retryFeatureGrill(projectId, featureId);
      const updated = await fetchFeature(projectId, featureId);
      setFeature(updated);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Failed to retry grill");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-6">
      {feature.status === "failed" && !feature.adrApproved && (
        <section className="rounded-card border border-red-500/30 bg-red-500/10 p-6">
          <h2 className="text-base font-semibold text-frost">This feature failed</h2>
          <p className="mt-1 text-sm text-mist">
            {feature.featureType === "project_init"
              ? "Project initialization didn't complete. Check the project's model configuration, then retry."
              : "The spec grill session didn't complete successfully."}
          </p>
          {lastError && (
            <p className="mt-2 rounded-md bg-surface-02 p-3 font-mono text-xs text-red-400">
              {lastError}
            </p>
          )}
          <Button className="mt-4" disabled={retrying} onClick={() => void handleRetryGrill()}>
            {retrying ? "Retrying…" : "Retry grill"}
          </Button>
        </section>
      )}

      {feature.status === "cancelled" && !feature.adrApproved && (
        <section className="rounded-card border border-rime bg-surface-01 p-6">
          <h2 className="text-base font-semibold text-frost">This feature was cancelled</h2>
          <p className="mt-1 text-sm text-mist">The spec grill session was stopped.</p>
        </section>
      )}

      {feature.status === "draft" && (
        <SpecGrillPanel
          projectId={projectId}
          featureId={featureId}
          feature={feature}
          onFeatureChange={setFeature}
        />
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {feature.status === "spec_ready" && (
        <section className="flex h-[calc(100vh-16rem)] min-h-[30rem] flex-col overflow-hidden rounded-card border border-rime bg-surface-01">
          <div className="flex flex-col gap-3 border-b border-rime-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-frost">Feature ADR</h2>
              {feature.adrApproved ? (
                <span className="rounded-full bg-status-approved/20 px-2 py-0.5 text-[11px] font-medium text-status-approved">
                  Approved
                </span>
              ) : null}
            </div>
            {!feature.adrApproved ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={saving} onClick={() => void handleSaveAdr()}>
                  Save edits
                </Button>
                <Button disabled={saving} onClick={() => void handleApproveAdr()}>
                  Approve ADR
                </Button>
              </div>
            ) : (
              <Button variant="outline" asChild>
                <Link href={appRoute(featureStagePath(projectId, featureId, "action-items"))}>
                  Continue to Action Items →
                </Link>
              </Button>
            )}
          </div>

          <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
            <textarea
              className="h-full w-full resize-none overflow-y-auto border-b border-rime-soft bg-surface-02 p-4 font-mono text-sm text-frost focus:outline-none md:border-b-0 md:border-r"
              value={adrDraft}
              onChange={(event) => setAdrDraft(event.target.value)}
              readOnly={feature.adrApproved}
              spellCheck={false}
            />
            <Markdown
              content={adrDraft}
              className="h-full overflow-y-auto bg-surface-02 p-4 text-mist"
            />
          </div>
        </section>
      )}

      {feature.status !== "spec_ready" && (feature.adrMarkdown || feature.status === "draft") ? (
        <section className="rounded-card border border-rime bg-surface-01 p-6">
          <h2 className="text-base font-semibold text-frost">Feature ADR</h2>
          {feature.adrMarkdown ? (
            <Markdown
              content={feature.adrMarkdown}
              className="mt-4 rounded-md bg-surface-02 p-4 text-mist"
            />
          ) : (
            <p className="mt-4 text-sm text-shadow">ADR not generated yet.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
