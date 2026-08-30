"use client";

import Link from "next/link";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allocationsApiRows } from "@/lib/mock/monitoring";
import { appRoute } from "@/lib/config";
import { mockProject } from "@/lib/msw/fixtures";
import { cn } from "@/lib/utils";

export function ApiAllocationsPageClient() {
  return (
    <HubLayout
      title="Agent API allocations"
      description="Which of your organization's connected providers each project can draw from, and an optional monthly cap."
    >
      <Card className="p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-frost">Per-project access</div>
        <div className="mb-4 mt-1 text-xs text-shadow">
          Providers are configured once in Organization settings and shared across projects. Toggle which ones
          each project may use, and cap its monthly draw if needed.
        </div>

        {allocationsApiRows.map((row, i) => (
          <div
            key={row.name}
            className={cn(
              "flex flex-col gap-4 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center",
              i > 0 && "border-t border-rime-soft",
            )}
          >
            <div className="flex w-full shrink-0 items-center gap-2.5 md:w-[190px]">
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-surface-03 font-mono text-[11px] font-semibold text-bifrost">
                {row.letter}
              </span>
              <span className="text-sm text-frost">{row.name}</span>
            </div>

            <div className="flex flex-1 flex-wrap gap-1.5">
              {row.providers.map((provider) => (
                <span
                  key={provider.name}
                  className={cn(
                    "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-medium",
                    provider.on ? "border-transparent bg-bifrost/15 text-bifrost" : "border-rime text-shadow",
                  )}
                >
                  {provider.on ? "✓ " : ""}
                  {provider.name}
                </span>
              ))}
            </div>

            <div className="w-full shrink-0 text-left md:w-[170px] md:text-right">
              <Input readOnly defaultValue={row.cap} className="h-8 w-full text-right text-sm md:w-[110px]" />
              <div className="mt-1.5 text-xs">
                {row.name === mockProject.name ? (
                  <Link
                    href={appRoute(`/projects/${mockProject.id}/usage`)}
                    className="text-bifrost hover:underline"
                  >
                    View usage &rarr;
                  </Link>
                ) : (
                  <span className="text-shadow">View usage &rarr;</span>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="mt-5 flex justify-end">
          <Button disabled>Save changes</Button>
        </div>
      </Card>
    </HubLayout>
  );
}
