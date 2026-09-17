"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { appRoute } from "@/lib/config";
import type { UsageSession } from "@/lib/features/types";
import {
  ACTIVITY_LEVEL_CLASS,
  activityLevel,
  buildActivityHeatmap,
  formatCost,
  formatDuration,
  formatTokens,
  jobKindMeta,
  sessionHref,
  sessionStatusMeta,
  sharePercent,
  type ActivityDay,
} from "@/lib/features/usage";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the Usage and Analytics pages (ADR 023), so the
 * four pages that read this data render it identically instead of drifting
 * apart. Everything here takes already-fetched figures — no page owns logic
 * that isn't in lib/features/usage.ts and unit-tested there.
 */

/** A headline figure with an optional explanatory line beneath it. */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-sm text-mist">{label}</div>
      <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">{value}</div>
      {hint && <div className="mt-1 text-xs text-shadow">{hint}</div>}
    </Card>
  );
}

/**
 * One labelled share bar. `barPct` is a share of the total the caller chose to
 * compare against, never a share of an unknown provider quota.
 */
export function BreakdownRow({
  label,
  detail,
  leading,
  barPct,
  right,
  fillClass,
}: {
  label: string;
  /** Optional second line (sessions, cost) beneath the label. */
  detail?: string;
  leading?: React.ReactNode;
  barPct: number;
  right: string;
  fillClass?: string;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-3 first:mt-0">
      <div className="flex w-[180px] shrink-0 items-center gap-2 overflow-hidden text-sm text-frost">
        {leading}
        <span className="min-w-0">
          <span className="block truncate">{label}</span>
          {detail && (
            <span className="block truncate text-[11px] text-shadow">{detail}</span>
          )}
        </span>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-02">
        <div
          className={cn("h-full rounded-full", fillClass ?? "bg-bifrost")}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="w-[110px] shrink-0 text-right font-mono text-xs text-mist">{right}</div>
    </div>
  );
}

/** A titled card holding breakdown rows, or an empty state when there is nothing to show. */
export function BreakdownCard({
  title,
  description,
  rows,
  emptyMessage,
}: {
  title: string;
  description: string;
  rows: React.ReactNode[];
  emptyMessage: string;
}) {
  return (
    <Card className="mb-6 p-4 sm:p-5">
      <div className="text-[15px] font-semibold text-frost">{title}</div>
      <div className="mb-4 mt-1 text-xs text-shadow">{description}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-shadow">{emptyMessage}</p>
      ) : (
        rows
      )}
    </Card>
  );
}

/**
 * The 52-week activity graph. Cells come from the API's sparse per-day counts
 * via buildActivityHeatmap, which fills and week-aligns the grid — a day with
 * no runs is a real zero, not a gap.
 */
export function ActivityCard({ activity }: { activity: ActivityDay[] }) {
  const heatmap = buildActivityHeatmap(activity);

  return (
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
          {heatmap.cells.map((sessions, i) => (
            <span
              key={i}
              className={cn(
                "min-w-[2px] rounded-[2px]",
                ACTIVITY_LEVEL_CLASS[activityLevel(sessions, heatmap.maxSessions)],
              )}
            />
          ))}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-shadow">
        <span>Less</span>
        {ACTIVITY_LEVEL_CLASS.map((className, i) => (
          <span key={i} className={cn("inline-block size-3 rounded-[2px]", className)} />
        ))}
        <span>More</span>
        <span className="ml-2">
          {heatmap.totalSessions} session{heatmap.totalSessions === 1 ? "" : "s"} in the last 52 weeks
        </span>
      </div>
    </Card>
  );
}

/** One recent session: kind chip, subject, and its measured cost of the run. */
export function SessionRow({ session }: { session: UsageSession }) {
  const meta = jobKindMeta(session.jobKind);
  const status = sessionStatusMeta(session.status);
  const href = sessionHref({
    projectId: session.projectId,
    featureId: session.featureId,
    testId: session.testId,
  });
  const title = session.title ?? meta.label;

  return (
    <div className="mt-2.5 flex items-center gap-3 rounded-md border border-rime p-3 first:mt-0">
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
        <div className="truncate text-sm text-frost">
          {href ? (
            <Link href={appRoute(href)} className="hover:text-bifrost">
              {title}
            </Link>
          ) : (
            title
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-shadow">
          {session.projectName} · {formatDuration(session.durationMs)} ·{" "}
          {formatCost(session.costUsd)}
        </div>
      </div>
      <div className="w-[76px] shrink-0 text-right font-mono text-sm text-mist">
        {formatTokens(session.tokens)}
      </div>
      <div className={cn("w-[90px] shrink-0 text-xs", status.className)}>
        &#9679; {status.label}
      </div>
    </div>
  );
}

export function RecentSessionsCard({
  sessions,
  description,
}: {
  sessions: UsageSession[];
  description: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-[15px] font-semibold text-frost">Recent sessions</div>
      <div className="mb-1 mt-1 text-xs text-shadow">{description}</div>
      {sessions.length === 0 ? (
        <p className="mt-2 text-sm text-shadow">
          No completed agent sessions yet — a run appears here once its session ends
          and reports its token usage.
        </p>
      ) : (
        sessions.map((session) => <SessionRow key={session.jobId} session={session} />
        )
      )}
    </Card>
  );
}

/**
 * The honesty note both levels of the Usage page carry. Yggdrasil meters
 * consumption against a bring-your-own-key provider; it does not own a quota
 * and has no idea what the provider's own limit or billing cycle is, so the
 * pages deliberately show no "% of limit" or "resets in N days".
 */
export function MeteringNotice() {
  return (
    <p className="mb-6 rounded-md border border-rime bg-surface-01 px-4 py-3 text-xs leading-relaxed text-mist">
      These figures are what the providers reported for your own connected keys,
      measured per job session. Yggdrasil meters consumption — it does not hold a
      quota of its own and cannot see a provider&apos;s account limit or billing
      cycle, so no percentage-of-limit or reset date is shown here.
    </p>
  );
}

/** Percentage of a total, with the "of the organization" style hint beside it. */
export function shareHint(part: number, whole: number, suffix: string): string {
  return `${sharePercent(part, whole)}% of ${suffix}`;
}
