"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { fetchProject } from "@/lib/api";
import type { Project } from "@/lib/features/types";
import { appRoute } from "@/lib/config";
import { cn } from "@/lib/utils";

interface ProjectDeploymentsClientProps {
  projectId: string;
}

const filterPills = ["All", "Production", "Staging", "Preview"] as const;

const envStyles = {
  Production: "bg-bifrost/15 text-bifrost",
  Staging: "bg-status-input/15 text-status-input",
  Preview: "bg-aurora/15 text-aurora",
} as const;

const statusDot = {
  ready: "bg-status-approved",
  building: "bg-aurora animate-pulse",
} as const;

export function ProjectDeploymentsClient({ projectId }: ProjectDeploymentsClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const projectData = await fetchProject(projectId);
        if (active) setProject(projectData);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load project");
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  if (error && !project) {
    return <div className="flex min-h-screen items-center justify-center text-mist">{error}</div>;
  }

  if (!project) {
    return <div className="flex min-h-screen items-center justify-center text-mist">Loading deployments…</div>;
  }

  const rows = [
    {
      env: "Production" as const,
      status: "ready" as const,
      statusLabel: "Ready",
      url: `${project.slug}.apps.acmeretail.com`,
      source: (
        <>
          Branch <span className="font-mono">main</span>
        </>
      ),
      deployedAt: "Deployed 12m ago",
    },
    {
      env: "Staging" as const,
      status: "ready" as const,
      statusLabel: "Ready",
      url: `${project.slug}-staging.apps.acmeretail.com`,
      source: (
        <>
          Branch <span className="font-mono">staging</span>
        </>
      ),
      deployedAt: "Deployed 1h ago",
    },
    {
      env: "Preview" as const,
      status: "building" as const,
      statusLabel: "Building",
      url: `${project.slug}-feature_build-482.preview.acmeretail.com`,
      source: (
        <>
          <span className="font-mono">feature_build</span> &middot;{" "}
          <Link href={appRoute(`/projects/${project.id}/features/feat_004`)} className="text-mist hover:text-frost">
            Usage metrics dashboard
          </Link>
        </>
      ),
      deployedAt: "Deployed 3m ago",
    },
    {
      env: "Preview" as const,
      status: "ready" as const,
      statusLabel: "Ready",
      url: `${project.slug}-test_run-901.preview.acmeretail.com`,
      source: (
        <>
          <span className="font-mono">test_run</span> &middot;{" "}
          <Link href={appRoute(`/projects/${project.id}/tests/test_001`)} className="text-mist hover:text-frost">
            Auth flow
          </Link>
        </>
      ),
      deployedAt: "Deployed 20m ago",
    },
  ];

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">Project</p>
        <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">Deployments</h1>
        <p className="mt-1 text-sm text-mist">
          Every active deployment for this project — production, staging, and preview.
        </p>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content">
          <div className="mb-6 flex flex-wrap gap-2">
            {filterPills.map((pill) => (
              <span
                key={pill}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  pill === "All"
                    ? "border-bifrost bg-bifrost/10 text-bifrost"
                    : "border-rime bg-surface-01 text-mist",
                )}
              >
                {pill}
              </span>
            ))}
          </div>

          <div className="flex flex-col">
            {rows.map((row, i) => (
              <div
                key={i}
                className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-rime p-4 first:mt-0 sm:flex-nowrap"
              >
                <span
                  className={cn(
                    "inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-wide",
                    envStyles[row.env],
                  )}
                >
                  {row.env}
                </span>
                <span className="flex w-[84px] shrink-0 items-center gap-1.5 text-xs text-mist">
                  <span className={cn("size-1.5 shrink-0 rounded-full", statusDot[row.status])} />
                  {row.statusLabel}
                </span>
                <div className="order-3 min-w-0 flex-1 basis-full sm:order-none sm:basis-auto">
                  <div className="flex items-center gap-1.5 truncate font-mono text-sm text-frost">
                    {row.url}
                    <ExternalLink className="size-3 shrink-0 text-shadow" />
                  </div>
                  <div className="mt-1 truncate text-xs text-shadow">{row.source}</div>
                </div>
                <div className="shrink-0 whitespace-nowrap text-xs text-shadow">{row.deployedAt}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
