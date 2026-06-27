import type { FeatureStatus } from "./statuses";

export type ProjectStatus = "initializing" | "ready";

export interface ProjectRepository {
  id: string;
  githubOwner: string;
  githubRepo: string;
  isPrimary: boolean;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  repositories: ProjectRepository[];
  repositoryRemovalBlockedReason: string | null;
}

export type FeatureType = "normal" | "project_init";

export interface Feature {
  id: string;
  projectId: string;
  title: string;
  slug: string;
  featureType: FeatureType;
  specExcerpt: string;
  status: FeatureStatus;
  adrMarkdown: string | null;
  awaitingUserInput: boolean;
  adrApproved: boolean;
  branchName: string | null;
  prUrl: string | null;
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

export interface FeatureCounts {
  planned: number;
  inProgress: number;
  completed: number;
}

export type ActionQueueType =
  | "grill_response_needed"
  | "adr_review"
  | "start_build"
  | "pr_review"
  | "changes_requested"
  | "test_failure"
  | "failed_build";

export interface ActionQueueItem {
  type: ActionQueueType;
  featureId?: string;
  testId?: string;
  title: string;
  waitingSince: string;
  linkPath: string;
}

export interface ProjectOverview {
  counts: FeatureCounts;
  actionQueue: ActionQueueItem[];
}

export interface Test {
  id: string;
  projectId: string;
  name: string;
  specMarkdown: string;
  scheduleCron: string;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  projectId: string | null;
  kind: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}
