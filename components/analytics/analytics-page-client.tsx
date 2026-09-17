"use client";

import { useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ActivityCard,
  BreakdownCard,
  BreakdownRow,
  RecentSessionsCard,
  StatCard,
} from "@/components/usage/usage-blocks";
import { useActiveOrganization } from "@/components/usage/use-active-organization";
import { fetchOrganizationAnalytics, USAGE_DEFAULT_DAYS } from "@/lib/api";
import type { OrganizationAnalyticsReport } from "@/lib/features/types";
import {
  deltaPercent,
  formatTokens,
  jobKindMeta,
  modelLabel,
  sharePercent,
  type UsageJobKind,
} from "@/lib/features/usage";
import { cn } from "@/lib/utils";

/**
 * Organization-level agent activity (ADR 023).
 *
 * One deliberate difference from the wireframe this replaces: it had a "By
 * user" breakdown, which is not derivable. Nothing in the schema attributes a
 * job to the person who triggered it — the glossary calls that the "acting
 * user" and distinguishes it from the feature's creator, and only mutations
 * (not jobs) carry an actor, in the audit trail. Attributing consumption to a
 * feature's creator would be a guess, so the card is replaced with "By model",
 * which is measured.
 */
export function AnalyticsPageClient() {
  const { orgId } = useActiveOrganization();
  const [report, setReport] = useState<OrganizationAnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    fetchOrganizationAnalytics(orgId, USAGE_DEFAULT_DAYS)
      .then((data) => {
        if (active) {
          setReport(data);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load analytics.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  const totals = report?.totals;
  const sessionDelta = totals
    ? deltaPercent(totals.sessions, totals.previousSessions)
    : null;
  const tokenDelta = totals ? deltaPercent(totals.tokens, totals.previousTokens) : null;
  const avgTokens =
    totals && totals.sessions > 0 ? Math.round(totals.tokens / totals.sessions) : 0;

  return (
    <HubLayout
      title="Analytics"
      description="Agent activity and token consumption across your organization."
      activeOrgId={orgId}
    >
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
          hint={
            tokenDelta === null
              ? "No earlier window to compare against"
              : `${tokenDelta >= 0 ? "+" : ""}${tokenDelta}% vs. previous ${USAGE_DEFAULT_DAYS} days`
          }
        />
        <StatCard
          label="Avg tokens / session"
          value={totals && totals.sessions > 0 ? formatTokens(avgTokens) : "—"}
          hint="Provider-reported, across sessions that reported usage"
        />
      </div>

      <ActivityCard activity={report?.activity ?? []} />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard
          title="By session type"
          description={`Token consumption, last ${USAGE_DEFAULT_DAYS} days.`}
          emptyMessage="No sessions in this window."
          rows={(report?.byKind ?? []).map((bucket) => (
            <BreakdownRow
              key={bucket.jobKind}
              label={jobKindMeta(bucket.jobKind as UsageJobKind).label}
              detail={`${bucket.sessions} session${bucket.sessions === 1 ? "" : "s"}`}
              barPct={sharePercent(bucket.tokens, totals?.tokens ?? 0)}
              right={formatTokens(bucket.tokens)}
              leading={
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    jobKindMeta(bucket.jobKind as UsageJobKind).dotClass,
                  )}
                />
              }
            />
          ))}
        />

        <BreakdownCard
          title="By project"
          description={`Token consumption, last ${USAGE_DEFAULT_DAYS} days.`}
          emptyMessage="No project activity in this window."
          rows={(report?.byProject ?? []).map((bucket) => (
            <BreakdownRow
              key={bucket.projectId}
              label={bucket.projectName}
              detail={`${bucket.sessions} session${bucket.sessions === 1 ? "" : "s"}`}
              barPct={sharePercent(bucket.tokens, totals?.tokens ?? 0)}
              right={formatTokens(bucket.tokens)}
            />
          ))}
        />
      </div>

      {/* Replaces the replaced wireframe's "By user" card: job rows carry no
          acting-user attribution, so a per-user split would be a guess. By
          model is measured instead. */}
      <BreakdownCard
        title="By model"
        description={`Token consumption, last ${USAGE_DEFAULT_DAYS} days.`}
        emptyMessage="No model usage recorded in this window."
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
        description="Every grill, build, and test run, most recent first."
      />
    </HubLayout>
  );
}
