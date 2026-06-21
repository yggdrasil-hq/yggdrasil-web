import type { Feature, FeatureListQuery } from "./types";
import {
  FEATURE_STATUS_ORDER,
  type FeatureStatus,
} from "./statuses";

function compareFeatures(a: Feature, b: Feature, sort: FeatureListQuery["sort"]) {
  switch (sort) {
    case "name":
      return a.title.localeCompare(b.title);
    case "created":
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    case "updated":
    default:
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  }
}

export function filterAndSortFeatures(
  features: Feature[],
  query: FeatureListQuery,
): Feature[] {
  const search = query.search.trim().toLowerCase();

  let result = features.filter((feature) => {
    if (query.statuses.length > 0 && !query.statuses.includes(feature.status)) {
      return false;
    }

    if (!search) {
      return true;
    }

    return (
      feature.title.toLowerCase().includes(search) ||
      feature.specExcerpt.toLowerCase().includes(search)
    );
  });

  result = [...result].sort((a, b) => compareFeatures(a, b, query.sort));
  return result;
}

export function groupFeaturesByStatus(
  features: Feature[],
): Partial<Record<FeatureStatus, Feature[]>> {
  const groups: Partial<Record<FeatureStatus, Feature[]>> = {};

  for (const feature of features) {
    const bucket = groups[feature.status] ?? [];
    bucket.push(feature);
    groups[feature.status] = bucket;
  }

  return groups;
}

export function orderedStatusGroups(
  groups: Partial<Record<FeatureStatus, Feature[]>>,
): Array<{ status: FeatureStatus; features: Feature[] }> {
  return FEATURE_STATUS_ORDER.filter((status) => (groups[status]?.length ?? 0) > 0).map(
    (status) => ({
      status,
      features: groups[status]!,
    }),
  );
}
