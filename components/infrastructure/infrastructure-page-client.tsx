"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jobKindMeta, type JobKind } from "@/lib/mock/monitoring";
import { appRoute } from "@/lib/config";
import { mockProject } from "@/lib/msw/fixtures";
import { cn } from "@/lib/utils";

const clusterMeta = [
  { label: "Kubernetes version", value: "v1.29.2" },
  { label: "Ingress class", value: "ingress-nginx" },
  { label: "Cert issuer", value: "letsencrypt-prod" },
  { label: "Apps base domain", value: "apps.acmeretail.com" },
  { label: "Sandboxed runtime", value: "gVisor", accent: true },
  { label: "Node pools", value: "1 shared · dedicated pools not yet supported" },
];

interface ActiveJob {
  kind: JobKind;
  title: string;
  href?: string;
  meta: string;
  resources: string;
  status: string;
  statusClass: string;
}

const activeJobs: ActiveJob[] = [
  {
    kind: "feature_build",
    title: "Usage metrics dashboard",
    href: appRoute(`/projects/${mockProject.id}/features/feat_004`),
    meta: `${mockProject.slug}/feature-build-482-x7k2p`,
    resources: "1.2 vCPU · 2.1 GB",
    status: "Running",
    statusClass: "text-aurora",
  },
  {
    kind: "spec_grill",
    title: "Webhook retry queue",
    meta: "internal-ops-console/spec-grill-317-m9qz",
    resources: "0.4 vCPU · 0.9 GB",
    status: "Running",
    statusClass: "text-aurora",
  },
  {
    kind: "test_run",
    title: "Auth flow",
    href: appRoute(`/projects/${mockProject.id}/tests/test_001`),
    meta: `${mockProject.slug}/test-run-901-t4jd`,
    resources: "—",
    status: "Pending",
    statusClass: "text-shadow",
  },
];

const namespaces = [
  { name: mockProject.slug, count: "2 active pods" },
  { name: "internal-ops-console", count: "1 active pod" },
  { name: "marketing-site", count: "0 active pods" },
  { name: "data-pipeline", count: "0 active pods" },
];

const resourceLimits: { kind: JobKind; cpu: string; memory: string }[] = [
  { kind: "spec_grill", cpu: "0.5 vCPU", memory: "1 GB" },
  { kind: "feature_build", cpu: "2 vCPU", memory: "4 GB" },
  { kind: "test_run", cpu: "1 vCPU", memory: "2 GB" },
  { kind: "design_grill", cpu: "0.5 vCPU", memory: "1 GB" },
];

export function InfrastructurePageClient() {
  return (
    <HubLayout
      title="Infrastructure"
      description="The Kubernetes cluster your projects' jobs and deployments run on."
    >
      <Card className="mb-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-frost">Cluster connection</div>
            <p className="mt-0.5 text-xs text-shadow">Configured in Organization settings.</p>
          </div>
          <Badge variant="outline" className="border-transparent bg-bifrost/15 text-bifrost">
            Connected
          </Badge>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clusterMeta.map((item) => (
            <div key={item.label}>
              <div className="text-[11px] uppercase tracking-wide text-shadow">{item.label}</div>
              <div
                className={cn(
                  "mt-1 font-mono text-sm",
                  item.accent ? "text-bifrost" : "text-frost",
                )}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm">
          <Link
            href={appRoute("/settings/organization/cluster")}
            className="inline-flex items-center gap-1 text-bifrost hover:underline"
          >
            Manage cluster connection <ArrowRight className="size-3.5" />
          </Link>
        </p>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-mist">CPU</span>
            <span className="font-mono text-xl font-semibold text-frost">62%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-02">
            <div className="h-full rounded-full bg-bifrost" style={{ width: "62%" }} />
          </div>
          <div className="mt-2 text-xs text-shadow">24.8 / 40 vCPU across the shared node pool</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-mist">Memory</span>
            <span className="font-mono text-xl font-semibold text-frost">78%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-02">
            <div className="h-full rounded-full bg-status-input" style={{ width: "78%" }} />
          </div>
          <div className="mt-2 text-xs text-shadow">62.4 / 80 GB across the shared node pool</div>
        </Card>
      </div>

      <Card className="mb-6 p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-frost">Active jobs</div>
        <div className="mb-1 mt-1 text-xs text-shadow">
          Every job pod currently running or pending across all projects.
        </div>
        {activeJobs.map((job, i) => {
          const meta = jobKindMeta[job.kind];
          const title = job.href ? (
            <Link href={job.href} className="hover:text-bifrost">
              {job.title}
            </Link>
          ) : (
            job.title
          );
          return (
            <div
              key={i}
              className="mt-2.5 flex items-center gap-3 rounded-md border border-rime p-3 first:mt-0"
            >
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
                <div className="mt-0.5 truncate font-mono text-xs text-shadow">{job.meta}</div>
              </div>
              <div className="w-[110px] shrink-0 text-right font-mono text-xs text-mist">{job.resources}</div>
              <div className={cn("w-[84px] shrink-0 text-xs", job.statusClass)}>&#9679; {job.status}</div>
            </div>
          );
        })}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <div className="text-[15px] font-semibold text-frost">Namespaces</div>
          <div className="mb-1 mt-1 text-xs text-shadow">One per project — the isolation unit (ADR 003).</div>
          {namespaces.map((ns) => (
            <div
              key={ns.name}
              className="mt-2 flex items-center justify-between gap-3 rounded-md border border-rime px-3 py-2.5 first:mt-0"
            >
              <span className="font-mono text-sm text-frost">{ns.name}</span>
              <span className="text-xs text-shadow">{ns.count}</span>
            </div>
          ))}
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="text-[15px] font-semibold text-frost">Resource limits</div>
          <div className="mb-2 mt-1 text-xs text-shadow">Per-job defaults. Illustrative — not a real ADR 003 value.</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                  Job kind
                </th>
                <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                  CPU
                </th>
                <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                  Memory
                </th>
              </tr>
            </thead>
            <tbody>
              {resourceLimits.map((row) => (
                <tr key={row.kind}>
                  <td className="border-b border-rime-soft px-2.5 py-2.5 text-frost">{row.kind}</td>
                  <td className="border-b border-rime-soft px-2.5 py-2.5 font-mono text-mist">{row.cpu}</td>
                  <td className="border-b border-rime-soft px-2.5 py-2.5 font-mono text-mist">{row.memory}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm">
            <Link
              href={appRoute("/allocations/infra")}
              className="inline-flex items-center gap-1 text-bifrost hover:underline"
            >
              Manage per-project limits <ArrowRight className="size-3.5" />
            </Link>
          </p>
        </Card>
      </div>
    </HubLayout>
  );
}
