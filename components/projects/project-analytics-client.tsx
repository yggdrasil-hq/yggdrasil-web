"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ActivityCard,
  BreakdownCard,
  BreakdownRow,
  RecentSessionsCard,
  StatCard,
} from "@/components/usage/usage-blocks";
import { fetchProject, fetchProjectAnalytics, USAGE_DEFAULT_DAYS } from "@/lib/api";
import type { Project, ProjectAnalyticsReport } from "@/lib/features/types";
import {
  deltaPercent,
  formatTokens,
  jobKindMeta,
  modelLabel,
  sharePercent,
  type UsageJobKind,
} from "@/lib/features/usage";
import { appRoute } from "@/lib/config";
import { cn } from "@/lib/utils";

interface ProjectAnalyticsClientProps {
  projectId: string;
}

/**
 * This project's agent activity (ADR 023).
 *
 * Shows no "By project" breakdown (redundant at this scope) and no "By user"
 * breakdown — job rows carry no acting-user attribution, so a per-user split
 * would have to be guessed. "By model" is measured instead.
 */
export function ProjectAnalyticsClient({ projectId }: ProjectAnalyticsClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [report, setReport] = useState<ProjectAnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, analyticsData] = await Promise.all([
          fetchProject(projectId),
          fetchProjectAnalytics(projectId, USAGE_DEFAULT_DAYS),
        ]);
        if (active) {
          setProject(projectData);
          setReport(analyticsData);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load analytics",
          );
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

  const totals = report?.totals;
  const sessionDelta = totals
    ? deltaPercent(totals.sessions, totals.previousSessions)
    : null;
  const avgTokens =
    totals && totals.sessions > 0 ? Math.round(totals.tokens / totals.sessions) : 0;

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">Project</p>
        <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">Analytics</h1>
        <p className="mt-1 text-sm text-mist">
          Agent activity and token consumption for {project.name}.
        </p>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label={`Sessions (${USAGE_DEFAULT_DAYS}d)`}
              value={totals ? String(totals.sessions) : "—"}
              hint={
                sessionDelta === null
                  ? "No earlier window to compare against"
                  : `${sessionDelta >= 0 ? "+" : ""}${sessionDelta}% vs. previous ${USAGE_DEFAULT_DAYS} days`
              }
            />
            <StatCard
              label={`Tokens consumed (${USAGE_DEFAULT_DAYS}d)`}
              value={totals ? formatTokens(totals.tokens) : "—"}
              hint="Measured across this project's sessions"
            />
            <StatCard
              label="Avg tokens / session"
              value={totals && totals.sessions > 0 ? formatTokens(avgTokens) : "—"}
              hint="Provider-reported, across sessions that reported usage"
            />
          </div>

          <div className="mb-6 flex items-start gap-3 rounded-md border border-rime bg-surface-01 px-4 py-3.5">
            <Info className="mt-0.5 size-4 shrink-0 text-shadow" />
            <p className="text-sm leading-relaxed text-mist">
              Consumption is metered against your organization&apos;s provider keys.{" "}
              <Link href={appRoute("/analytics")} className="text-bifrost hover:underline">
                View organization analytics &rarr;
              </Link>
            </p>
          </div>

          <ActivityCard activity={report?.activity ?? []} />

          <BreakdownCard
            title="By session type"
            description={`Token consumption, last ${USAGE_DEFAULT_DAYS} days.`}
            emptyMessage="No sessions recorded for this project in this window."
            rows={(report?.byKind ?? []).map((bucket) => {
              const meta = jobKindMeta(bucket.jobKind as UsageJobKind);
              return (
                <BreakdownRow
                  key={bucket.jobKind}
                  label={meta.label}
                  detail={`${bucket.sessions} session${bucket.sessions === 1 ? "" : "s"}`}
                  barPct={sharePercent(bucket.tokens, totals?.tokens ?? 0)}
                  right={formatTokens(bucket.tokens)}
                  leading={<span className={cn("size-2 shrink-0 rounded-full", meta.dotClass)} />}
                />
              );
            })}
          />

          <BreakdownCard
            title="By model"
            description={`Token consumption, last ${USAGE_DEFAULT_DAYS} days.`}
            emptyMessage="No model usage recorded for this project in this window."
            rows={(report?.byModel ?? []).map((bucket) => (
              <BreakdownRow
                key={`${bucket.modelId ?? "none"}-${bucket.providerName ?? "none"}`}
                label={modelLabel(bucket.modelId, bucket.providerName)}
                detail={`${bucket.sessions} session${bucket.sessions === 1 ? "" : "s"}`}
                barPct={sharePercent(bucket.tokens, totals?.tokens ?? 0)}
                right={formatTokens(bucket.tokens)}
              />
            ))}
          />

          <RecentSessionsCard
            sessions={report?.recentSessions ?? []}
            description="Every grill, build, and test run for this project, most recent first."
          />
        </div>
      </main>
    </AppShell>
  );
}
