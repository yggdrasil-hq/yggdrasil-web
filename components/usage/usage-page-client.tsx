"use client";

import { useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BreakdownCard,
  BreakdownRow,
  MeteringNotice,
  StatCard,
} from "@/components/usage/usage-blocks";
import { useActiveOrganization } from "@/components/usage/use-active-organization";
import { fetchOrganizationUsage, USAGE_DEFAULT_DAYS } from "@/lib/api";
import type { OrganizationUsageReport } from "@/lib/features/types";
import {
  deltaPercent,
  formatCost,
  formatTokens,
  providerLabel,
  sharePercent,
} from "@/lib/features/usage";
import { cn } from "@/lib/utils";

/**
 * Organization-level token consumption (ADR 023).
 *
 * This page previously showed static placeholder data (ADR 017), including a
 * "% of limit" bar and a billing-cycle reset date. Those are deliberately gone
 * rather than wired to something plausible: Yggdrasil does not own the
 * provider account, so neither figure exists to be fetched — see
 * MeteringNotice. What replaced them is measured consumption per provider.
 */
export function UsagePageClient() {
  const { orgId } = useActiveOrganization();
  const [report, setReport] = useState<OrganizationUsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    setLoaded(false);
    fetchOrganizationUsage(orgId, USAGE_DEFAULT_DAYS)
      .then((data) => {
        if (active) {
          setReport(data);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load usage.",
          );
        }
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  const totals = report?.totals;
  const tokenDelta = totals ? deltaPercent(totals.tokens, totals.previousTokens) : null;

  return (
    <HubLayout
      title="Usage"
      description="Token consumption across every provider connected to your organization."
      activeOrgId={orgId}
    >
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          label={`Sessions (${USAGE_DEFAULT_DAYS}d)`}
          value={totals ? String(totals.sessions) : "—"}
          hint="Agent runs that reported usage"
        />
        <StatCard
          label="Provider-reported cost"
          value={totals ? formatCost(totals.costUsd) : "—"}
          hint="Sum of what the providers reported"
        />
      </div>

      {loaded && !error && totals?.sessions === 0 && (
        <p className="mb-6 text-sm text-mist">
          No agent runs reported usage in the last {USAGE_DEFAULT_DAYS} days. Figures
          appear once a job&apos;s session ends and reports its token accounting.
        </p>
      )}

      <BreakdownCard
        title="By provider"
        description={`Measured consumption, last ${USAGE_DEFAULT_DAYS} days.`}
        emptyMessage="No provider usage recorded in this window."
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
                    // A null provider is a bring-your-own custom endpoint, not
                    // an error — it simply has no catalog entry to colour by.
                    provider.providerName ? "bg-bifrost" : "bg-mist",
                  )}
                />
              }
            />
          );
        })}
      />

      <MeteringNotice />
    </HubLayout>
  );
}
