"use client";

import { HubLayout } from "@/components/app-shell/hub-layout";
import { Card } from "@/components/ui/card";
import { orgProviderUsage } from "@/lib/mock/monitoring";
import { cn } from "@/lib/utils";

export function UsagePageClient() {
  return (
    <HubLayout title="Usage" description="Token usage across every provider connected to your organization.">
      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-mist">Total tokens this cycle</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">6.8M</div>
          <div className="mt-1 text-xs text-shadow">Across 4 connected providers</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-mist">Highest usage</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">OpenRouter</div>
          <div className="mt-1 text-xs text-shadow">3.9M tokens &middot; 39% of limit</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-mist">Next reset</div>
          <div className="mt-1.5 font-mono text-[28px] font-semibold text-frost">18 days</div>
          <div className="mt-1 text-xs text-shadow">Anthropic &middot; Dec 1</div>
        </Card>
      </div>

      <Card className="p-4 sm:p-5">
        {orgProviderUsage.map((provider, i) => (
          <div
            key={provider.provider}
            className={cn("mt-5 first:mt-0", i > 0 && "border-t border-rime-soft pt-5")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-medium text-frost">{provider.provider}</div>
                <div className="mt-0.5 text-xs text-shadow">As reported by the provider</div>
              </div>
              <div className="text-right font-mono text-sm text-mist">
                <span className={cn("font-medium", provider.warn ? "text-status-input" : "text-frost")}>
                  {provider.pct}%
                </span>{" "}
                &middot; {provider.usedTokens} / {provider.limitTokens} tokens
              </div>
            </div>
            <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-surface-02">
              <div
                className={cn("h-full rounded-full", provider.warn ? "bg-status-input" : "bg-bifrost")}
                style={{ width: `${provider.pct}%` }}
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs text-shadow">
              <span>Used across {provider.projectCount} project{provider.projectCount === 1 ? "" : "s"}</span>
              <span>Resets in {provider.resetsInDays} days</span>
            </div>
          </div>
        ))}
      </Card>
    </HubLayout>
  );
}
