"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { StatusBadge } from "@/components/features/status-badge";
import { Button } from "@/components/ui/button";
import { fetchFeature, fetchProject } from "@/lib/api";
import type { Feature, Project } from "@/lib/features/types";

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

  if (error) {
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
            <Link href={`/projects/${projectId}/features`}>← Back to features</Link>
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
        <div className="mx-auto max-w-content rounded-card border border-dashed border-rime bg-surface-01 px-4 py-8 text-center sm:px-6 sm:py-12">
          <p className="text-sm text-mist">Detail view coming soon.</p>
          <p className="mt-2 text-xs text-shadow">
            This stub reserves space for the full feature spec editor and run timeline.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
