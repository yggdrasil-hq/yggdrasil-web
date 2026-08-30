"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { TestingPanel } from "@/components/features/testing-panel";
import { fetchProject } from "@/lib/api";
import type { Project } from "@/lib/features/types";

export function FeatureTestingClient({
  projectId,
  featureId,
}: {
  projectId: string;
  featureId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let active = true;
    fetchProject(projectId).then((data) => {
      if (active) setProject(data);
    }).catch(() => {
      if (active) setProject(null);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!project) {
    return <div className="flex min-h-screen items-center justify-center text-mist">Loading…</div>;
  }

  return (
    <AppShell project={project}>
      <main className="mx-auto w-full max-w-content px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="mb-6 text-xl font-semibold text-frost">Feature testing</h1>
        <TestingPanel projectId={projectId} featureId={featureId} />
      </main>
    </AppShell>
  );
}
