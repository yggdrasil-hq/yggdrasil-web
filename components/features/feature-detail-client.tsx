"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { StatusBadge } from "@/components/features/status-badge";
import { Button } from "@/components/ui/button";
import { fetchFeature, fetchProject, updateFeature } from "@/lib/api";
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
        <div className="mx-auto max-w-content space-y-6">
          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          {feature.status === "draft" && (
            <section className="rounded-card border border-rime bg-surface-01 p-6">
              <h2 className="text-base font-semibold text-frost">Spec grill in progress</h2>
              <p className="mt-2 text-sm text-mist">
                {feature.awaitingUserInput
                  ? "The agent is waiting for your response in the grill session."
                  : "The agent is exploring the codebase and preparing questions."}
              </p>
              <p className="mt-4 text-xs text-shadow">
                Live grill chat will connect here once the Orchestrator integration ships.
              </p>
            </section>
          )}

          {(feature.status === "spec_ready" ||
            feature.adrMarkdown ||
            feature.status === "draft") && (
            <section className="rounded-card border border-rime bg-surface-01 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold text-frost">Feature ADR</h2>
                {feature.status === "spec_ready" && !feature.adrApproved && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() => void handleSaveAdr()}
                    >
                      Save edits
                    </Button>
                    <Button disabled={saving} onClick={() => void handleApproveAdr()}>
                      Approve ADR
                    </Button>
                  </div>
                )}
                {feature.status === "spec_ready" && feature.adrApproved && (
                  <Button disabled={saving} onClick={() => void handleStartBuild()}>
                    Start build
                  </Button>
                )}
              </div>

              {feature.status === "spec_ready" ? (
                <textarea
                  className="mt-4 min-h-80 w-full rounded-md border border-rime bg-surface-02 p-4 font-mono text-sm text-frost"
                  value={adrDraft}
                  onChange={(event) => setAdrDraft(event.target.value)}
                  readOnly={feature.adrApproved}
                />
              ) : feature.adrMarkdown ? (
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-02 p-4 text-sm text-mist">
                  {feature.adrMarkdown}
                </pre>
              ) : (
                <p className="mt-4 text-sm text-shadow">ADR not generated yet.</p>
              )}
            </section>
          )}

          {feature.status === "queued" || feature.status === "running" ? (
            <section className="rounded-card border border-dashed border-rime bg-surface-01 p-6 text-sm text-mist">
              Build job dispatched. Run timeline and live logs will appear here.
            </section>
          ) : null}

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
