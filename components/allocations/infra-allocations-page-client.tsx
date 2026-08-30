"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allocationsInfraRows } from "@/lib/mock/monitoring";
import { appRoute } from "@/lib/config";

export function InfraAllocationsPageClient() {
  return (
    <HubLayout
      title="Infra allocations"
      description="Per-project Kubernetes resource limits on your organization's shared cluster."
    >
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-mist">Cluster capacity</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">40 vCPU</div>
          <div className="mt-1 text-xs text-shadow">80 GB memory · shared node pool</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-mist">Allocated across projects</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">6 vCPU</div>
          <div className="mt-1 text-xs text-shadow">12 GB memory · 15% of capacity</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-mist">Live utilization</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">62%</div>
          <div className="mt-1 text-xs">
            <Link
              href={appRoute("/infrastructure")}
              className="inline-flex items-center gap-1 text-bifrost hover:underline"
            >
              See Infrastructure <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-frost">Per-project limits</div>
        <div className="mb-4 mt-1 text-xs text-shadow">
          Caps applied to each project&apos;s namespace. Projects without an explicit override fall back to the
          shared per-job-kind defaults.
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                  Project
                </th>
                <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                  CPU limit
                </th>
                <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                  Memory limit
                </th>
                <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                  Max concurrent jobs
                </th>
              </tr>
            </thead>
            <tbody>
              {allocationsInfraRows.map((row) => (
                <tr key={row.name}>
                  <td className="border-b border-rime-soft px-2.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-surface-03 font-mono text-[11px] font-semibold text-bifrost">
                        {row.letter}
                      </span>
                      <span className="text-sm text-frost">{row.name}</span>
                    </div>
                  </td>
                  <td className="border-b border-rime-soft px-2.5 py-2.5">
                    <Input readOnly defaultValue={row.cpu} className="h-8 w-[92px] text-sm" />
                  </td>
                  <td className="border-b border-rime-soft px-2.5 py-2.5">
                    <Input readOnly defaultValue={row.memory} className="h-8 w-[92px] text-sm" />
                  </td>
                  <td className="border-b border-rime-soft px-2.5 py-2.5">
                    <Input readOnly defaultValue={row.maxConcurrent} className="h-8 w-[92px] text-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <Button disabled>Save changes</Button>
        </div>
      </Card>
    </HubLayout>
  );
}
