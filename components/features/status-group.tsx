"use client";

import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FeatureCard } from "@/components/features/feature-card";
import { StatusBadge } from "@/components/features/status-badge";
import { getStatusMeta, type FeatureStatus } from "@/lib/features/statuses";
import type { Feature } from "@/lib/features/types";
import { cn } from "@/lib/utils";

interface StatusGroupProps {
  status: FeatureStatus;
  features: Feature[];
  projectId: string;
  defaultOpen?: boolean;
}

export function StatusGroup({
  status,
  features,
  projectId,
  defaultOpen = true,
}: StatusGroupProps) {
  const meta = getStatusMeta(status);

  return (
    <Collapsible defaultOpen={defaultOpen} className="space-y-3">
      <CollapsibleTrigger className="group flex w-full items-center gap-3 rounded-md px-1 py-1 text-left">
        <ChevronDown
          className={cn(
            "size-4 text-shadow transition-transform group-data-[state=closed]:-rotate-90",
          )}
        />
        <div className="flex flex-1 items-center gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-frost">
            {meta.label}
          </h2>
          <StatusBadge status={status} />
          <span className="text-xs text-shadow">{features.length}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              projectId={projectId}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
