"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { StatusBadge } from "@/components/features/status-badge";
import { SpecGrillPanel } from "@/components/features/spec-grill-panel";
import { BuildProgressPanel } from "@/components/features/build-progress-panel";
import { ActionItemsPanel } from "@/components/features/action-items-panel";
import { TestingPanel } from "@/components/features/testing-panel";
import { AgenticReviewPanel } from "@/components/features/agentic-review-panel";
import { ManualReviewPanel } from "@/components/features/manual-review-panel";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import {
  fetchFeature,
  fetchFeatureEvents,
  fetchProject,
  resumeFeatureImplementation,
  retryFeatureBuild,
  retryFeatureGrill,
  updateFeature,
} from "@/lib/api";
import type { Feature, Project } from "@/lib/features/types";
import { appRoute } from "@/lib/config";

interface FeatureDetailClientProps {
  projectId: string;
  featureId: string;
}

export function FeatureDetailClient({
  projectId,
  featureId,
}: FeatureDetailClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [feature, setFeature] = useState<Feature | null>(null);
  const [adrDraft, setAdrDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryingBuild, setRetryingBuild] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  // null = action items not loaded yet → Start build stays disabled until the
  // panel reports the real open count (preempts the backend's 409, ADR 015
  // item 2).
  const [openActionItemCount, setOpenActionItemCount] = useState<number | null>(null);

  const handleOpenItemCountChange = useCallback((openCount: number) => {
    setOpenActionItemCount(openCount);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, featureData] = await Promise.all([
          fetchProject(projectId),
          fetchFeature(projectId, featureId),
        ]);
        if (active) {
          setProject(projectData);
          setFeature(featureData);
          setAdrDraft(featureData.adrMarkdown ?? "");
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load feature",
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [projectId, featureId]);

  // Surfaces the actual failure reason (e.g. a model config error) on the
  // failed banner instead of only generic copy — jobs.last_error was
  // previously written but never read anywhere (ADR 012).
  useEffect(() => {
    if (feature?.status !== "failed") {
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
  }, [projectId, featureId, feature?.status]);

  async function handleSaveAdr() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFeature(projectId, featureId, {
        adrMarkdown: adrDraft,
      });
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

  // SpecGrillPanel/BuildProgressPanel poll the feature independently of
  // this component's own one-shot load() effect (it's the only way to
  // notice a running grill/build finish/fail/get cancelled). Also resyncs
  // adrDraft, which load() only ever sets once on mount — otherwise a
  // draft -> spec_ready transition spotted by the grill panel would leave
  // the ADR textarea showing stale (empty) content even though
  // feature.adrMarkdown just got populated.
  function handleLiveFeatureUpdate(updated: Feature) {
    setFeature(updated);
    setAdrDraft(updated.adrMarkdown ?? "");
  }

  async function handleStartBuild() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFeature(projectId, featureId, { startBuild: true });
      setFeature(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to start build");
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
      setAdrDraft(updated.adrMarkdown ?? "");
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Failed to retry grill");
    } finally {
      setRetrying(false);
    }
  }

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

  if (error && !feature) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        {error}
      </div>
    );
  }

  if (!project || !feature) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading feature…
      </div>
    );
  }

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="flex flex-col gap-3">
          <Button variant="ghost" className="w-fit px-0 text-mist hover:text-frost" asChild>
            <Link href={appRoute(`/projects/${projectId}/features`)}>← Back to features</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">
              {feature.title}
            </h1>
            <StatusBadge status={feature.status} />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {feature.status === "spec_ready" && error ? (
          <p className="mx-auto mb-4 max-w-content text-sm text-red-400">{error}</p>
        ) : null}

        {feature.status === "spec_ready" && (
          <section className="flex h-[calc(100vh-13rem)] min-h-[32rem] flex-col overflow-hidden rounded-card border border-rime bg-surface-01">
            <div className="flex flex-col gap-3 border-b border-rime-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <h2 className="text-base font-semibold text-frost">Feature ADR</h2>
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
                <div className="flex flex-col items-end gap-1.5">
                  <Button
                    disabled={saving || openActionItemCount !== 0}
                    onClick={() => void handleStartBuild()}
                  >
                    Start build
                  </Button>
                  {(openActionItemCount ?? 0) > 0 ? (
                    <p className="text-xs text-shadow">
                      Resolve open action items to enable build
                    </p>
                  ) : null}
                </div>
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

        <div className="mx-auto max-w-content space-y-6">
          {feature.status === "spec_ready" ? (
            <ActionItemsPanel
              projectId={projectId}
              featureId={featureId}
              status={feature.status}
              onOpenCountChange={handleOpenItemCountChange}
            />
          ) : null}

          {feature.status === "testing" ? (
            <TestingPanel projectId={projectId} featureId={featureId} />
          ) : null}

          {feature.status === "agentic_review" ? (
            <AgenticReviewPanel projectId={projectId} featureId={featureId} />
          ) : null}

          {feature.status === "in_review" ||
          feature.status === "returned" ||
          feature.status === "merged" ? (
            <ManualReviewPanel projectId={projectId} feature={feature} />
          ) : null}

          {error && feature.status !== "spec_ready" ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : null}

          {feature.status === "failed" && (
            <section className="rounded-card border border-red-500/30 bg-red-500/10 p-6">
              <h2 className="text-base font-semibold text-frost">This feature failed</h2>
              <p className="mt-1 text-sm text-mist">
                {feature.adrApproved
                  ? "The build didn't complete successfully."
                  : feature.featureType === "project_init"
                    ? "Project initialization didn't complete. Check the project's model configuration, then retry."
                    : "The spec grill session didn't complete successfully."}
              </p>
              {lastError && (
                <p className="mt-2 rounded-md bg-surface-02 p-3 font-mono text-xs text-red-400">
                  {lastError}
                </p>
              )}
              {feature.adrApproved ? (
                <Button
                  className="mt-4"
                  disabled={retryingBuild}
                  onClick={() => void handleRetryBuild()}
                >
                  {retryingBuild ? "Retrying…" : "Retry build"}
                </Button>
              ) : (
                <Button
                  className="mt-4"
                  disabled={retrying}
                  onClick={() => void handleRetryGrill()}
                >
                  {retrying ? "Retrying…" : "Retry grill"}
                </Button>
              )}
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
              <Button
                className="mt-4"
                disabled={resuming}
                onClick={() => void handleResume()}
              >
                {resuming ? "Resuming…" : "Resume implementation"}
              </Button>
            </section>
          )}

          {feature.status === "draft" && (
            <SpecGrillPanel
              projectId={projectId}
              featureId={featureId}
              feature={feature}
              onFeatureChange={handleLiveFeatureUpdate}
            />
          )}

          {feature.status !== "spec_ready" &&
            (feature.adrMarkdown || feature.status === "draft") && (
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
            )}

          {(feature.status === "queued" || feature.status === "running") && (
            <BuildProgressPanel
              projectId={projectId}
              featureId={featureId}
              onFeatureChange={handleLiveFeatureUpdate}
            />
          )}

          {feature.prUrl ? (
            <section className="rounded-card border border-rime bg-surface-01 p-6">
              <h2 className="text-base font-semibold text-frost">Pull request</h2>
              <a
                href={feature.prUrl}
                className="mt-2 inline-block text-sm text-teal hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {feature.prUrl}
              </a>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
