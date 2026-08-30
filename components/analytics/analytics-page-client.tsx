"use client";

import Link from "next/link";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Card } from "@/components/ui/card";
import {
  jobKindMeta,
  orgActivityHeatmap,
  orgAnalyticsByProject,
  orgAnalyticsByUser,
  type JobKind,
} from "@/lib/mock/monitoring";
import { appRoute } from "@/lib/config";
import { mockProject } from "@/lib/msw/fixtures";
import { cn } from "@/lib/utils";

const heatLevelClass = [
  "bg-surface-02",
  "bg-bifrost/25",
  "bg-bifrost/45",
  "bg-bifrost/70",
  "bg-bifrost",
] as const;

const sessionTypeBreakdown: { kind: JobKind; label: string; tokens: string; pct: number }[] = [
  { kind: "feature_build", label: "Feature build", tokens: "3.7M", pct: 100 },
  { kind: "spec_grill", label: "Feature spec", tokens: "1.75M", pct: 47 },
  { kind: "test_run", label: "Tests", tokens: "890K", pct: 24 },
  { kind: "design_grill", label: "Design session", tokens: "460K", pct: 12 },
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

const recentSessions: Session[] = [
  {
    kind: "feature_build",
    title: "Usage metrics dashboard",
    href: appRoute(`/projects/${mockProject.id}/features/feat_004`),
    meta: `${mockProject.name} · Sarat Chandra`,
    tokens: "94.2K",
    status: "Running",
    statusClass: "text-aurora",
  },
  {
    kind: "test_run",
    title: "Auth flow",
    href: appRoute(`/projects/${mockProject.id}/tests/test_001`),
    meta: `${mockProject.name} · Scheduled`,
    tokens: "18.6K",
    status: "Failed",
    statusClass: "text-status-rejected",
  },
  {
    kind: "spec_grill",
    title: "Project settings page",
    href: appRoute(`/projects/${mockProject.id}/features/feat_002`),
    meta: `${mockProject.name} · Jordan Ellis`,
    tokens: "31.4K",
    status: "Completed",
    statusClass: "text-status-approved",
  },
  {
    kind: "feature_build",
    title: "Webhook retry queue",
    meta: "Internal Ops Console · Priya Nair",
    tokens: "112K",
    status: "Completed",
    statusClass: "text-status-approved",
  },
  {
    kind: "design_grill",
    title: "Pricing page refresh",
    meta: "Marketing Site · Marcus Webb",
    tokens: "27.9K",
    status: "Completed",
    statusClass: "text-status-approved",
  },
  {
    kind: "test_run",
    title: "Checkout regression suite",
    meta: "Data Pipeline · Scheduled",
    tokens: "15.1K",
    status: "Completed",
    statusClass: "text-status-approved",
  },
];

function SessionRow({ session }: { session: Session }) {
  const meta = jobKindMeta[session.kind];
  const title = session.href ? (
    <Link href={session.href} className="hover:text-bifrost">
      {session.title}
    </Link>
  ) : (
    session.title
  );

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
        <div className="truncate text-sm text-frost">{title}</div>
        <div className="mt-0.5 truncate text-xs text-shadow">{session.meta}</div>
      </div>
      <div className="w-[76px] shrink-0 text-right font-mono text-sm text-mist">{session.tokens}</div>
      <div className={cn("w-[90px] shrink-0 text-xs", session.statusClass)}>&#9679; {session.status}</div>
    </div>
  );
}

function BreakdownRow({
  label,
  tokens,
  pct,
  leading,
  fillClass,
}: {
  label: string;
  tokens: string;
  pct: number;
  leading?: React.ReactNode;
  fillClass?: string;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-3 first:mt-0">
      <div className="flex w-[150px] shrink-0 items-center gap-2 overflow-hidden text-sm text-frost">
        {leading}
        <span className="truncate">{label}</span>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-02">
        <div className={cn("h-full rounded-full", fillClass ?? "bg-bifrost")} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-[90px] shrink-0 text-right font-mono text-xs text-mist">{tokens}</div>
    </div>
  );
}

export function AnalyticsPageClient() {
  return (
    <HubLayout title="Analytics" description="Agent activity and token consumption across your organization.">
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-mist">Sessions (30d)</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">142</div>
          <div className="mt-1 text-xs text-shadow">+18% vs. previous 30 days</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-mist">Tokens consumed (30d)</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">6.8M</div>
          <div className="mt-1 text-xs text-shadow">Across 4 providers</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-mist">Avg tokens / session</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">47.9K</div>
          <div className="mt-1 text-xs text-shadow">feature_build runs highest, ~92K avg</div>
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
            {orgActivityHeatmap.map((level, i) => (
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

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <div className="text-[15px] font-semibold text-frost">By session type</div>
          <div className="mb-4 mt-1 text-xs text-shadow">Token consumption, last 30 days.</div>
          {sessionTypeBreakdown.map((item) => (
            <BreakdownRow
              key={item.kind}
              label={item.label}
              tokens={item.tokens}
              pct={item.pct}
              leading={<span className={cn("size-2 shrink-0 rounded-full", jobKindMeta[item.kind].dotClass)} />}
            />
          ))}
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="text-[15px] font-semibold text-frost">By project</div>
          <div className="mb-4 mt-1 text-xs text-shadow">Token consumption, last 30 days.</div>
          {orgAnalyticsByProject.map((item) => (
            <BreakdownRow key={item.name} label={item.name} tokens={item.tokens} pct={item.pct} />
          ))}
        </Card>
      </div>

      <Card className="mb-6 p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-frost">By user</div>
        <div className="mb-4 mt-1 text-xs text-shadow">Token consumption, last 30 days.</div>
        {orgAnalyticsByUser.map((item) => (
          <BreakdownRow
            key={item.initials}
            label={item.name}
            tokens={item.tokens}
            pct={item.pct}
            leading={
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface-03 text-[10px] font-medium text-frost">
                {item.initials}
              </span>
            }
          />
        ))}
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-frost">Recent sessions</div>
        <div className="mb-1 mt-1 text-xs text-shadow">Every grill, build, and test run, most recent first.</div>
        {recentSessions.map((session, i) => (
          <SessionRow key={i} session={session} />
        ))}
      </Card>
    </HubLayout>
  );
}
