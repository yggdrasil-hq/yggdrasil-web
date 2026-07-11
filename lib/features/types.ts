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
  installationId: string | null;
  githubAccessWarning: boolean;
  modelConfigWarning: boolean;
  repositories: ProjectRepository[];
  repositoryRemovalBlockedReason: string | null;
}

export interface GithubInstallation {
  id: string;
  accountType: "Organization" | "User";
  accountLogin: string;
  githubInstallationId: number;
}

export interface InstallationRepo {
  fullName: string;
  githubOwner: string;
  githubRepo: string;
}

/** A repo merged across every installation the user can access, for the flattened project-creation picker. */
export interface FlattenedRepo extends InstallationRepo {
  installationId: string;
  accountLogin: string;
}

export interface GithubAccessResponse {
  installations: GithubInstallation[];
  repos: FlattenedRepo[];
  reauthRequired: boolean;
  stale: boolean;
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
  | "failed_build"
  | "fix_github_access"
  | "fix_model_configuration";

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

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type FeatureEventType =
  | "agent_text"
  | "ask_user"
  | "submit_adr"
  | "run_failed"
  | "run_cancelled"
  | "user_message";

export interface FeatureEvent {
  id: string;
  type: FeatureEventType;
  question: string | null;
  markdown: string | null;
  message: string | null;
  createdAt: string;
}

export interface FeatureEventsResponse {
  jobStatus: JobStatus | null;
  events: FeatureEvent[];
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

export type ModelSecretKey = "MODEL_BASE_URL" | "MODEL_API_KEY" | "MODEL_ID";

export interface ProjectSecretMetadata {
  id: string;
  key: string;
  createdAt: string;
  updatedAt: string;
}

/** A full model-config bundle (ADR 007) — always all three together, never a subset. */
export interface ModelConfigInput {
  modelBaseUrl: string;
  modelApiKey: string;
  modelId: string;
}

export function hasFullModelConfigBundle(secrets: ProjectSecretMetadata[]): boolean {
  const keys: ModelSecretKey[] = ["MODEL_BASE_URL", "MODEL_API_KEY", "MODEL_ID"];
  return keys.every((key) => secrets.some((secret) => secret.key === key));
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
