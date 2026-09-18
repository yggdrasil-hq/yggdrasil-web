"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BreakdownCard, BreakdownRow, StatCard } from "@/components/usage/usage-blocks";
import { fetchProject, fetchProjectUsage, USAGE_DEFAULT_DAYS } from "@/lib/api";
import type { Project, ProjectUsageReport } from "@/lib/features/types";
import {
  formatCost,
  formatTokens,
  jobKindMeta,
  providerLabel,
  sharePercent,
  type UsageJobKind,
} from "@/lib/features/usage";
import { appRoute } from "@/lib/config";
import { cn } from "@/lib/utils";
import { LoadFailure } from "@/components/ui/load-failure";

interface ProjectUsageClientProps {
  projectId: string;
}

/**
 * One project's slice of the organization's metered consumption (ADR 023).
 *
 * Framed as a slice rather than a quota, on purpose: providers are
 * bring-your-own-key and organization-owned, and there is no per-project cap
 * (that is issue #18, unbuilt). So there is no progress bar against a limit
 * here — only measured tokens, plus how they compare to their neighbors.
 */
export function ProjectUsageClient({ projectId }: ProjectUsageClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [report, setReport] = useState<ProjectUsageReport | null>(null);
  /*
   * Two error slots, for the same reason as the analytics page next door: the
   * project and the usage report fail independently, and only one of those
   * failures means there is no page to render. A single `Promise.all` used to
   * discard a project that had loaded perfectly well because the usage endpoint
   * 404'd, leaving an un-shelled error with no sidebar and no way back.
   */
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      let projectData: Project;
      try {
        projectData = await fetchProject(projectId);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load project",
          );
          setLoaded(true);
        }
        return;
      }

      if (active) {
        setProject(projectData);
        setError(null);
      }

      try {
        const usageData = await fetchProjectUsage(projectId, USAGE_DEFAULT_DAYS);
        if (active) {
          setReport(usageData);
          setReportError(null);
        }
      } catch (reportLoadError) {
        if (active) {
          setReportError(
            reportLoadError instanceof Error
              ? reportLoadError.message
              : "Failed to load usage",
          );
        }
      } finally {
        if (active) setLoaded(true);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  if (error && !project) {
    return <LoadFailure message={error} subject="project" />
  }

  if (!project) {
    return <div className="flex min-h-screen items-center justify-center text-mist">Loading usage…</div>;
  }

  const totals = report?.totals;
  const topProvider = report?.byProvider[0] ?? null;
  const topKind = report?.byKind[0] ?? null;

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">Project</p>
        <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">Usage</h1>
        <p className="mt-1 text-sm text-mist">
          This project&apos;s token usage across your organization&apos;s connected providers.
        </p>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content">
          <div className="mb-6 flex items-start gap-3 rounded-md border border-rime bg-surface-01 px-4 py-3.5">
            <Info className="mt-0.5 size-4 shrink-0 text-shadow" />
            <p className="text-sm leading-relaxed text-mist">
              These runs draw on your organization&apos;s own provider keys — this
              project has no separate limit or quota of its own.{" "}
              <Link href={appRoute("/usage")} className="text-bifrost hover:underline">
                View organization usage &rarr;
              </Link>
            </p>
          </div>

          {/* The usage failure, not the project's — see the two error slots
              above. Inline so the panels below still render and the message is
              attributable to one thing rather than to the whole page. */}
          {reportError && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{reportError}</AlertDescription>
            </Alert>
          )}

          <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label={`Tokens consumed (${USAGE_DEFAULT_DAYS}d)`}
              value={totals ? formatTokens(totals.tokens) : "—"}
              hint="Measured across this project's agent sessions"
            />
            <StatCard
              label="Most-used provider"
              value={topProvider ? providerLabel(topProvider.providerName) : "—"}
              hint={topProvider ? `${formatTokens(topProvider.tokens)} tokens` : "No sessions yet"}
            />
            <StatCard
              label="Most-used for"
              value={topKind ? jobKindMeta(topKind.jobKind as UsageJobKind).label : "—"}
              hint={
                topKind
                  ? `${formatTokens(topKind.tokens)} tokens · ${topKind.sessions} session${topKind.sessions === 1 ? "" : "s"}`
                  : "No sessions yet"
              }
            />
          </div>

          {loaded && !error && totals?.sessions === 0 && (
            <p className="mb-6 text-sm text-mist">
              No agent runs for this project reported usage in the last{" "}
              {USAGE_DEFAULT_DAYS} days.
            </p>
          )}

          <BreakdownCard
            title="By provider"
            description={`Share of this project's measured tokens, last ${USAGE_DEFAULT_DAYS} days.`}
            emptyMessage="No provider usage recorded for this project in this window."
            rows={(report?.byProvider ?? []).map((provider) => {
              const label = providerLabel(provider.providerName);
              return (
                <BreakdownRow
                  key={label}
                  label={label}
                  detail={`${provider.sessions} session${provider.sessions === 1 ? "" : "s"} · ${formatCost(provider.costUsd)}`}
                  barPct={sharePercent(provider.tokens, totals?.tokens ?? 0)}
                  right={formatTokens(provider.tokens)}
                  leading={
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        provider.providerName ? "bg-bifrost" : "bg-mist",
                      )}
                    />
                  }
                />
              );
            })}
          />

          <BreakdownCard
            title="By session type"
            description={`Share of this project's measured tokens, last ${USAGE_DEFAULT_DAYS} days.`}
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
        </div>
      </main>
    </AppShell>
  );
}
