"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Card } from "@/components/ui/card";
import { fetchProject } from "@/lib/api";
import type { Project } from "@/lib/features/types";
import { appRoute } from "@/lib/config";
import {
  jobKindMeta,
  projectActivityHeatmap,
  projectAnalyticsByUser,
  type JobKind,
} from "@/lib/mock/monitoring";
import { cn } from "@/lib/utils";

interface ProjectAnalyticsClientProps {
  projectId: string;
}

const heatLevelClass = [
  "bg-surface-02",
  "bg-bifrost/25",
  "bg-bifrost/45",
  "bg-bifrost/70",
  "bg-bifrost",
] as const;

const sessionTypeBreakdown: { kind: JobKind; label: string; tokens: string; pct: number }[] = [
  { kind: "feature_build", label: "Feature build", tokens: "1.3M", pct: 100 },
  { kind: "spec_grill", label: "Feature spec", tokens: "570K", pct: 44 },
  { kind: "test_run", label: "Tests", tokens: "230K", pct: 18 },
];

interface Session {
  kind: JobKind;
  title: string;
  href?: string;
  meta: string;
  tokens: string;
  status: string;
  statusClass: string;
}

export function ProjectAnalyticsClient({ projectId }: ProjectAnalyticsClientProps) {
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
    return <div className="flex min-h-screen items-center justify-center text-mist">Loading analytics…</div>;
  }

  const recentSessions: Session[] = [
    {
      kind: "feature_build",
      title: "Usage metrics dashboard",
      href: appRoute(`/projects/${project.id}/features/feat_004`),
      meta: "Sarat Chandra",
      tokens: "94.2K",
      status: "Running",
      statusClass: "text-aurora",
    },
    {
      kind: "test_run",
      title: "Auth flow",
      href: appRoute(`/projects/${project.id}/tests/test_001`),
      meta: "Scheduled",
      tokens: "18.6K",
      status: "Failed",
      statusClass: "text-status-rejected",
    },
    {
      kind: "spec_grill",
      title: "Project settings page",
      href: appRoute(`/projects/${project.id}/features/feat_002`),
      meta: "Jordan Ellis",
      tokens: "31.4K",
      status: "Completed",
      statusClass: "text-status-approved",
    },
    {
      kind: "test_run",
      title: "Checkout regression suite",
      meta: "Scheduled",
      tokens: "15.1K",
      status: "Completed",
      statusClass: "text-status-approved",
    },
  ];

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">Project</p>
        <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">Analytics</h1>
        <p className="mt-1 text-sm text-mist">Agent activity and token consumption for {project.name}.</p>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content">
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-sm text-mist">Sessions (30d)</div>
              <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">58</div>
              <div className="mt-1 text-xs text-shadow">+9% vs. previous 30 days</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-mist">Tokens consumed (30d)</div>
              <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">2.1M</div>
              <div className="mt-1 text-xs text-shadow">31% of the organization&apos;s total</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-mist">Avg tokens / session</div>
              <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">36.2K</div>
              <div className="mt-1 text-xs text-shadow">feature_build runs highest, ~88K avg</div>
            </Card>
          </div>

          <Card className="mb-6 p-4 sm:p-5">
            <div className="text-[15px] font-semibold text-frost">Activity</div>
            <div className="mb-4 mt-1 text-xs text-shadow">Sessions run per day, last 52 weeks.</div>
            <div className="overflow-x-auto pb-1">
              <div
                className="grid gap-[3px]"
                style={{
                  gridTemplateColumns: "repeat(52, 1fr)",
                  gridTemplateRows: "repeat(7, 14px)",
                  gridAutoFlow: "column",
                  width: "100%",
                  minWidth: "600px",
                }}
              >
                {projectActivityHeatmap.map((level, i) => (
                  <span key={i} className={cn("min-w-[2px] rounded-[2px]", heatLevelClass[level])} />
                ))}
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-shadow">
              <span>Less</span>
              {heatLevelClass.map((c, i) => (
                <span key={i} className={cn("inline-block size-3 rounded-[2px]", c)} />
              ))}
              <span>More</span>
            </div>
          </Card>

          <Card className="mb-6 p-4 sm:p-5">
            <div className="text-[15px] font-semibold text-frost">By session type</div>
            <div className="mb-4 mt-1 text-xs text-shadow">Token consumption, last 30 days.</div>
            {sessionTypeBreakdown.map((item) => (
              <div key={item.kind} className="mt-2.5 flex items-center gap-3 first:mt-0">
                <div className="flex w-[150px] shrink-0 items-center gap-2 overflow-hidden text-sm text-frost">
                  <span className={cn("size-2 shrink-0 rounded-full", jobKindMeta[item.kind].dotClass)} />
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-02">
                  <div className="h-full rounded-full bg-bifrost" style={{ width: `${item.pct}%` }} />
                </div>
                <div className="w-[90px] shrink-0 text-right font-mono text-xs text-mist">{item.tokens}</div>
              </div>
            ))}
          </Card>

          <Card className="mb-6 p-4 sm:p-5">
            <div className="text-[15px] font-semibold text-frost">By user</div>
            <div className="mb-4 mt-1 text-xs text-shadow">Token consumption, last 30 days.</div>
            {projectAnalyticsByUser.map((item) => (
              <div key={item.initials} className="mt-2.5 flex items-center gap-3 first:mt-0">
                <div className="flex w-[150px] shrink-0 items-center gap-2 overflow-hidden text-sm text-frost">
                  <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface-03 text-[10px] font-medium text-frost">
                    {item.initials}
                  </span>
                  <span className="truncate">{item.name}</span>
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-02">
                  <div className="h-full rounded-full bg-bifrost" style={{ width: `${item.pct}%` }} />
                </div>
                <div className="w-[90px] shrink-0 text-right font-mono text-xs text-mist">{item.tokens}</div>
              </div>
            ))}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="text-[15px] font-semibold text-frost">Recent sessions</div>
            <div className="mb-1 mt-1 text-xs text-shadow">
              Every grill, build, and test run for this project, most recent first.
            </div>
            {recentSessions.map((session, i) => {
              const meta = jobKindMeta[session.kind];
              const title = session.href ? (
                <Link href={session.href} className="hover:text-bifrost">
                  {session.title}
                </Link>
              ) : (
                session.title
              );
              return (
                <div key={i} className="mt-2.5 flex items-center gap-3 rounded-md border border-rime p-3 first:mt-0">
                  <span
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[10px] font-medium",
                      meta.bgClass,
                      meta.colorClass,
                    )}
                  >
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-frost">{title}</div>
                    <div className="mt-0.5 truncate text-xs text-shadow">{session.meta}</div>
                  </div>
                  <div className="w-[76px] shrink-0 text-right font-mono text-sm text-mist">{session.tokens}</div>
                  <div className={cn("w-[90px] shrink-0 text-xs", session.statusClass)}>
                    &#9679; {session.status}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
