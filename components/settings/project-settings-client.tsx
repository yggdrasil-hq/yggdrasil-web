"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchProject } from "@/lib/api";
import type { Project } from "@/lib/features/types";

interface ProjectSettingsClientProps {
  projectId: string;
}

export function ProjectSettingsClient({ projectId }: ProjectSettingsClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const projectData = await fetchProject(projectId);
        if (active) {
          setProject(projectData);
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
      <div className="p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-sm text-mist">Loading project settings…</p>
      </div>
    );
  }

  return (
    <AppShell project={project}>
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-frost">Settings</h1>
          <p className="mt-1 text-sm text-mist">
            Configuration for <span className="text-frost">{project.name}</span>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Repositories</CardTitle>
            <CardDescription>
              {project.repositories.length} linked repositor
              {project.repositories.length === 1 ? "y" : "ies"}
            </CardDescription>
          </CardHeader>
          {project.repositories.length > 0 ? (
            <ul className="space-y-2 px-4 pb-4">
              {project.repositories.map((repo) => (
                <li key={repo.id} className="text-sm text-mist">
                  <span className="text-frost">
                    {repo.githubOwner}/{repo.githubRepo}
                  </span>
                  {repo.isPrimary ? (
                    <span className="ml-2 text-xs text-shadow">(primary)</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>More settings coming soon</CardTitle>
            <CardDescription>
              Model defaults, build commands, agent timeouts, and GitHub scope upgrades will
              be configurable here.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppShell>
  );
}
