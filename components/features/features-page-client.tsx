"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { FeatureList } from "@/components/features/feature-list";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchFeatures, fetchProject } from "@/lib/api";
import type { Feature, Project } from "@/lib/features/types";

interface FeaturesPageClientProps {
  projectId: string;
}

export function FeaturesPageClient({ projectId }: FeaturesPageClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, featureData] = await Promise.all([
          fetchProject(projectId),
          fetchFeatures(projectId),
        ]);
        if (active) {
          setProject(projectData);
          setFeatures(featureData);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load data",
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

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading project…
      </div>
    );
  }

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">
              Project
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">
              Features
            </h1>
            <p className="mt-1 text-sm text-mist">{project.description}</p>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button disabled className="gap-2">
                    <Plus className="size-4" />
                    New Feature
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-content">
          <FeatureList features={features} projectId={projectId} />
        </div>
      </main>
    </AppShell>
  );
}
