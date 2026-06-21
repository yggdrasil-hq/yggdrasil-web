"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchProjects } from "@/lib/api";
import type { Project } from "@/lib/features/types";
import { appRoute } from "@/lib/config";

export function ProjectsPageClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await fetchProjects();
        if (active) {
          setProjects(data);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load projects",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <HubLayout
      title="Projects"
      description="Connect GitHub repositories and manage agent work from one place."
    >
      <div className="mb-6 flex justify-end">
        <Button asChild className="gap-2">
          <Link href={appRoute("/projects/new")}>
            <Plus className="size-4" />
            New project
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-mist">Loading projects…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <div className="flex flex-col items-center px-6 py-12 text-center sm:px-10 sm:py-16">
            <CardTitle className="text-xl">No projects yet</CardTitle>
            <CardDescription className="mt-4 max-w-md text-base leading-relaxed line-clamp-none">
              Create your first project by linking a primary GitHub repository. You can add
              sub-repositories for multi-repo setups like meta repos with submodules.
            </CardDescription>
            <Button asChild className="mt-8">
              <Link href={appRoute("/projects/new")}>Create project</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={appRoute(`/projects/${project.id}`)} className="block h-full">
                <Card className="h-full transition-colors hover:border-rime hover:bg-surface-02">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <span
                        className={
                          project.status === "ready"
                            ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300"
                            : "rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300"
                        }
                      >
                        {project.status === "ready" ? "Ready" : "Initializing"}
                      </span>
                    </div>
                    {project.description ? (
                      <CardDescription>{project.description}</CardDescription>
                    ) : null}
                    <CardDescription>
                      {project.repositories.length} linked repositor
                      {project.repositories.length === 1 ? "y" : "ies"}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HubLayout>
  );
}
