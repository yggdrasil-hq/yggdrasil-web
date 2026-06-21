"use client";

import { useMemo, useState } from "react";
import { FeatureListToolbar } from "@/components/features/feature-list-toolbar";
import { StatusGroup } from "@/components/features/status-group";
import {
  filterAndSortFeatures,
  groupFeaturesByStatus,
  orderedStatusGroups,
} from "@/lib/features/sort-filter";
import {
  DEFAULT_FEATURE_LIST_QUERY,
  type Feature,
  type FeatureListQuery,
} from "@/lib/features/types";

interface FeatureListProps {
  features: Feature[];
  projectId: string;
}

export function FeatureList({ features, projectId }: FeatureListProps) {
  const [query, setQuery] = useState<FeatureListQuery>(DEFAULT_FEATURE_LIST_QUERY);

  const visibleGroups = useMemo(() => {
    const filtered = filterAndSortFeatures(features, query);
    const groups = groupFeaturesByStatus(filtered);
    return orderedStatusGroups(groups);
  }, [features, query]);

  const totalVisible = visibleGroups.reduce(
    (count, group) => count + group.features.length,
    0,
  );

  return (
    <div className="space-y-6">
      <FeatureListToolbar query={query} onQueryChange={setQuery} />

      {totalVisible === 0 ? (
        <div className="rounded-card border border-dashed border-rime bg-surface-01 px-6 py-12 text-center">
          <p className="text-sm text-mist">No features match your search or filters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {visibleGroups.map((group) => (
            <StatusGroup
              key={group.status}
              status={group.status}
              features={group.features}
              projectId={projectId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
