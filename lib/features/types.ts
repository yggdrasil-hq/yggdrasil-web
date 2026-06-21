import type { FeatureStatus } from "./statuses";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export interface Feature {
  id: string;
  projectId: string;
  title: string;
  specExcerpt: string;
  status: FeatureStatus;
  createdAt: string;
  updatedAt: string;
}

export type FeatureSortField = "updated" | "name" | "created";

export interface FeatureListQuery {
  search: string;
  statuses: FeatureStatus[];
  sort: FeatureSortField;
}

export const DEFAULT_FEATURE_LIST_QUERY: FeatureListQuery = {
  search: "",
  statuses: [],
  sort: "updated",
};
