"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Card } from "@/components/ui/card";
import { orgDeploymentGroups } from "@/lib/mock/monitoring";
import { mockProject } from "@/lib/msw/fixtures";
import { appRoute } from "@/lib/config";
import { cn } from "@/lib/utils";

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

interface DeployRow {
  env: keyof typeof envStyles;
  status: keyof typeof statusDot;
  statusLabel: string;
  url: string;
  source: React.ReactNode;
  deployedAt: string;
}

function DeployRowItem({ row }: { row: DeployRow }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-4 rounded-md border border-rime p-4 first:mt-0 sm:flex-nowrap">
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
  );
}

export function DeploymentsPageClient() {
  const acmeWebRows: DeployRow[] = [
    {
      env: "Production",
      status: "ready",
      statusLabel: "Ready",
      url: `${mockProject.slug}.apps.acmeretail.com`,
      source: (
        <>
          Branch <span className="font-mono">main</span>
        </>
      ),
      deployedAt: "Deployed 12m ago",
    },
    {
      env: "Staging",
      status: "ready",
      statusLabel: "Ready",
      url: `${mockProject.slug}-staging.apps.acmeretail.com`,
      source: (
        <>
          Branch <span className="font-mono">staging</span>
        </>
      ),
      deployedAt: "Deployed 1h ago",
    },
    {
      env: "Preview",
      status: "building",
      statusLabel: "Building",
      url: `${mockProject.slug}-feature_build-482.preview.acmeretail.com`,
      source: (
        <>
          <span className="font-mono">feature_build</span> &middot;{" "}
          <Link
            href={appRoute(`/projects/${mockProject.id}/features/feat_004`)}
            className="text-mist hover:text-frost"
          >
            Usage metrics dashboard
          </Link>
        </>
      ),
      deployedAt: "Deployed 3m ago",
    },
    {
      env: "Preview",
      status: "ready",
      statusLabel: "Ready",
      url: `${mockProject.slug}-test_run-901.preview.acmeretail.com`,
      source: (
        <>
          <span className="font-mono">test_run</span> &middot;{" "}
          <Link
            href={appRoute(`/projects/${mockProject.id}/tests/test_001`)}
            className="text-mist hover:text-frost"
          >
            Auth flow
          </Link>
        </>
      ),
      deployedAt: "Deployed 20m ago",
    },
  ];

  return (
    <HubLayout
      title="Deployments"
      description="Every active deployment across your projects — production, staging, and preview."
    >
      <div className="mb-7 flex flex-wrap gap-2">
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

      <div className="mb-7">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-03 font-mono text-xs font-semibold text-bifrost">
            A
          </span>
          <h2 className="text-sm font-semibold">
            <Link href={appRoute(`/projects/${mockProject.id}`)} className="text-frost hover:text-bifrost">
              {mockProject.name}
            </Link>
          </h2>
        </div>
        <div className="flex flex-col">
          {acmeWebRows.map((row, i) => (
            <DeployRowItem key={i} row={row} />
          ))}
        </div>
      </div>

      {orgDeploymentGroups.map((group) => (
        <div key={group.projectName} className="mb-7">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-03 font-mono text-xs font-semibold text-bifrost">
              {group.letter}
            </span>
            <h2 className="text-sm font-semibold text-frost">{group.projectName}</h2>
          </div>
          {group.rows ? (
            <div className="flex flex-col">
              {group.rows.map((row, i) => (
                <DeployRowItem
                  key={i}
                  row={{
                    ...row,
                    statusLabel: row.status === "ready" ? "Ready" : "Building",
                    source: row.source,
                  }}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed bg-transparent px-4 py-3.5 text-sm text-shadow">
              {group.emptyMessage}
            </Card>
          )}
        </div>
      ))}
    </HubLayout>
  );
}
