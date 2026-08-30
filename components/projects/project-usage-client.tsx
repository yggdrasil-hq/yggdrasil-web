"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Card } from "@/components/ui/card";
import { fetchProject } from "@/lib/api";
import type { Project } from "@/lib/features/types";
import { appRoute } from "@/lib/config";

interface ProjectUsageClientProps {
  projectId: string;
}

const providerUsage = [
  { provider: "OpenRouter", tokens: "1.4M tokens", pct: 67 },
  { provider: "Anthropic", tokens: "620K tokens", pct: 30 },
  { provider: "OpenAI", tokens: "62K tokens", pct: 3 },
];

export function ProjectUsageClient({ projectId }: ProjectUsageClientProps) {
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
    return <div className="flex min-h-screen items-center justify-center text-mist">Loading usage…</div>;
  }

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">Project</p>
        <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">Usage</h1>
        <p className="mt-1 text-sm text-mist">This project&apos;s token usage across your organization&apos;s connected providers.</p>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content">
          <div className="mb-6 flex items-start gap-3 rounded-md border border-rime bg-surface-01 px-4 py-3.5">
            <Info className="mt-0.5 size-4 shrink-0 text-shadow" />
            <p className="text-sm leading-relaxed text-mist">
              These numbers count toward your organization&apos;s shared provider quotas — this project doesn&apos;t
              have its own limit.{" "}
              <Link href={appRoute("/usage")} className="text-bifrost hover:underline">
                View organization usage &amp; limits &rarr;
              </Link>
            </p>
          </div>

          <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-sm text-mist">Tokens this cycle</div>
              <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">2.1M</div>
              <div className="mt-1 text-xs text-shadow">31% of the organization&apos;s total usage</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-mist">Most-used provider</div>
              <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">OpenRouter</div>
              <div className="mt-1 text-xs text-shadow">1.4M tokens</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-mist">Most-used for</div>
              <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">feature_build</div>
              <div className="mt-1 text-xs text-shadow">1.1M tokens &middot; 52%</div>
            </Card>
          </div>

          <Card className="p-4 sm:p-5">
            {providerUsage.map((provider, i) => (
              <div key={provider.provider} className={i > 0 ? "mt-5 border-t border-rime-soft pt-5" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[15px] font-medium text-frost">{provider.provider}</div>
                  <div className="font-mono text-sm text-mist">{provider.tokens}</div>
                </div>
                <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-surface-02">
                  <div className="h-full rounded-full bg-bifrost" style={{ width: `${provider.pct}%` }} />
                </div>
                <div className="mt-2.5 text-xs text-shadow">
                  {provider.pct}% of this project&apos;s usage this cycle
                </div>
              </div>
            ))}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
