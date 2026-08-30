"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { StatusBadge } from "@/components/features/status-badge";
import { FeatureStageTabs } from "@/components/features/feature-stage-tabs";
import { FeatureDetailProvider } from "@/components/features/feature-detail-context";
import { Button } from "@/components/ui/button";
import { fetchFeature, fetchProject } from "@/lib/api";
import type { Feature, Project } from "@/lib/features/types";
import { featureStageForStatus } from "@/lib/features/stage";
import { appRoute } from "@/lib/config";

interface FeatureDetailLayoutProps {
  projectId: string;
  featureId: string;
  children: React.ReactNode;
}

/**
 * Shared chrome for every `/projects/:projectId/features/:featureId/*`
 * route (six stage pages + the bare-route redirect): fetches the project +
 * feature once, renders the back-link/title/status-badge header and the
 * six-stage tab nav (design/.../features/detail/*'s persistent
 * `.feature-steps` strip), then hands both records down through
 * FeatureDetailProvider so no stage page re-fetches them. Next.js keeps a
 * layout mounted across client-side navigation between sibling routes it
 * wraps, so switching stages doesn't reload this header or refetch data.
 *
 * This is the split-up successor to the old single-route
 * FeatureDetailClient, which used to render all six stages' content in one
 * conditional block per `feature.status`. That per-stage content now lives
 * in components/features/feature-{spec,action-items,implementation,
 * testing,agentic-review,manual-review}-client.tsx, one per route.
 */
export function FeatureDetailLayout({ projectId, featureId, children }: FeatureDetailLayoutProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [feature, setFeature] = useState<Feature | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load feature");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [projectId, featureId]);

  const handleFeatureChange = useCallback((updated: Feature) => {
    setFeature(updated);
  }, []);

  if (error && !feature) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">{error}</div>
    );
  }

  if (!project || !feature) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading feature…
      </div>
    );
  }

  const currentStage = featureStageForStatus(feature);

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
        <div className="mx-auto max-w-content">
          <FeatureStageTabs
            projectId={projectId}
            featureId={featureId}
            currentStage={currentStage}
          />

          <FeatureDetailProvider
            value={{
              projectId,
              featureId,
              project,
              feature,
              setFeature: handleFeatureChange,
            }}
          >
            {children}
          </FeatureDetailProvider>
        </div>
      </main>
    </AppShell>
  );
}
