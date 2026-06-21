"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Check,
  ChevronDown,
} from "@/components/ui/dropdown-menu";
import { FEATURE_STATUSES } from "@/lib/features/statuses";
import type { FeatureListQuery, FeatureSortField } from "@/lib/features/types";
import { cn } from "@/lib/utils";

const SORT_LABELS: Record<FeatureSortField, string> = {
  updated: "Updated (newest)",
  name: "Name (A–Z)",
  created: "Created (newest)",
};

interface FeatureListToolbarProps {
  query: FeatureListQuery;
  onQueryChange: (query: FeatureListQuery) => void;
}

export function FeatureListToolbar({
  query,
  onQueryChange,
}: FeatureListToolbarProps) {
  const toggleStatus = (status: FeatureListQuery["statuses"][number]) => {
    const statuses = query.statuses.includes(status)
      ? query.statuses.filter((s) => s !== status)
      : [...query.statuses, status];
    onQueryChange({ ...query, statuses });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-shadow" />
          <Input
            value={query.search}
            onChange={(event) =>
              onQueryChange({ ...query, search: event.target.value })
            }
            placeholder="Search features…"
            className="pl-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="justify-between gap-2 lg:min-w-44">
              {SORT_LABELS[query.sort]}
              <ChevronDown className="size-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORT_LABELS) as FeatureSortField[]).map((sort) => (
              <DropdownMenuItem
                key={sort}
                className="gap-2"
                onClick={() => onQueryChange({ ...query, sort })}
              >
                <Check
                  className={cn(
                    "size-4",
                    query.sort === sort ? "opacity-100" : "opacity-0",
                  )}
                />
                {SORT_LABELS[sort]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-2">
        {FEATURE_STATUSES.map((status) => {
          const active = query.statuses.includes(status.id);
          return (
            <button
              key={status.id}
              type="button"
              onClick={() => toggleStatus(status.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-transparent text-niflheim"
                  : "border-rime bg-surface-01 text-mist hover:border-rime hover:text-frost",
              )}
              style={
                active
                  ? { backgroundColor: status.color, color: "#080B11" }
                  : undefined
              }
            >
              {status.label}
            </button>
          );
        })}
        {query.statuses.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-shadow"
            onClick={() => onQueryChange({ ...query, statuses: [] })}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
