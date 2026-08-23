"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { ActionQueue } from "@/components/projects/action-queue";
import { DeployStatusPanel } from "@/components/projects/deploy-status-panel";
import { FeatureCountCards } from "@/components/projects/feature-count-cards";
import { Button } from "@/components/ui/button";
import { fetchFeatures, fetchProject, fetchProjectOverview, completeProjectInit } from "@/lib/api";
import type { Feature, Project, ProjectOverview } from "@/lib/features/types";
import { appRoute } from "@/lib/config";

interface ProjectHomeClientProps {
  projectId: string;
}

export function ProjectHomeClient({ projectId }: ProjectHomeClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [initFeature, setInitFeature] = useState<Feature | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completingInit, setCompletingInit] = useState(false);

  async function handleCompleteInit() {
    setCompletingInit(true);
    setError(null);
    try {
      const updated = await completeProjectInit(projectId);
      setProject(updated);
    } catch (initError) {
      setError(
        initError instanceof Error ? initError.message : "Failed to complete setup",
      );
    } finally {
      setCompletingInit(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, overviewData, featuresData] = await Promise.all([
          fetchProject(projectId),
          fetchProjectOverview(projectId),
          fetchFeatures(projectId),
        ]);
        if (active) {
          setProject(projectData);
          setOverview(overviewData);
          setInitFeature(
            featuresData.find((feature) => feature.featureType === "project_init") ?? null,
          );
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load project",
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        {error}
      </div>
    );
  }

  if (!project || !overview) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading project…
      </div>
    );
  }

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">
              Project home
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-mist">{project.description}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={appRoute(`/projects/${projectId}/features`)}>View features</Link>
          </Button>
        </div>

        {project.status === "initializing" && (
          <div className="mt-4 rounded-card border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-frost">
            <p>Complete project initialization to unlock features and tests.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {initFeature ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={appRoute(`/projects/${projectId}/features/${initFeature.id}`)}>
                    Continue project setup
                  </Link>
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={completingInit}
                onClick={() => void handleCompleteInit()}
              >
                {completingInit ? "Completing…" : "Mark setup complete"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-shadow">
              Manual completion is available until the Orchestrator runs project init
              automatically.
            </p>
          </div>
        )}
      </header>

      <main className="flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content space-y-6">
          {project.status === "ready" && <DeployStatusPanel projectId={projectId} />}
          <FeatureCountCards counts={overview.counts} />
          <ActionQueue items={overview.actionQueue} />
        </div>
      </main>
    </AppShell>
  );
}
