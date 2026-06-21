"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { FeatureList } from "@/components/features/feature-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createFeature, fetchFeatures, fetchProject } from "@/lib/api";
import type { Feature, Project } from "@/lib/features/types";
import { appRoute } from "@/lib/config";

interface FeaturesPageClientProps {
  projectId: string;
}

export function FeaturesPageClient({ projectId }: FeaturesPageClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  async function reloadFeatures() {
    const featureData = await fetchFeatures(projectId);
    setFeatures(featureData);
  }

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

  async function handleCreateFeature() {
    const title = newTitle.trim();
    if (!title) return;

    setCreating(true);
    setError(null);
    try {
      const feature = await createFeature(projectId, title);
      setNewTitle("");
      setShowCreate(false);
      await reloadFeatures();
      window.location.href = appRoute(
        `/projects/${projectId}/features/${feature.id}`,
      );
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Failed to create feature",
      );
    } finally {
      setCreating(false);
    }
  }

  if (error && !project) {
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

  const canCreate = project.status === "ready";

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

          {canCreate ? (
            showCreate ? (
              <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
                <Input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Feature title"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleCreateFeature();
                  }}
                />
                <div className="flex gap-2">
                  <Button disabled={creating} onClick={() => void handleCreateFeature()}>
                    {creating ? "Creating…" : "Create"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="gap-2" onClick={() => setShowCreate(true)}>
                <Plus className="size-4" />
                New Feature
              </Button>
            )
          ) : (
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
                <TooltipContent>Complete project initialization first</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {error && project ? (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        ) : null}
      </header>

      <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-content">
          <FeatureList features={features} projectId={projectId} />
        </div>
      </main>
    </AppShell>
  );
}
