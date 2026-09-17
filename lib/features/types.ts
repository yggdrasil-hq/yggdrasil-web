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
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  installationId: string | null;
  githubAccessWarning: boolean;
  modelConfigWarning: boolean;
  /** ADR 015 item 12: per-project Agentic Review gate, default on. */
  agenticReviewEnabled: boolean;
  /** ADR 014: whether design sessions are enabled for this project. */
  hasDesignSurface: boolean;
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
  parentFeatureId?: string | null;
  returnReason?: string | null;
  returnComment?: string | null;
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
  | "user_message"
  | "submit_build_result"
  | "run_started"
  | "update_design_preview"
  | "submit_design";

export interface FeatureEvent {
  id: string;
  type: FeatureEventType;
  question: string | null;
  markdown: string | null;
  message: string | null;
  status: string | null;
  prUrl: string | null;
  summary: string | null;
  actionItems?: Array<{
    type: string;
    description: string;
    secretKey?: string;
    draftTestMarkdown?: string;
  }> | null;
  snapshot: Record<string, string> | null;
  createdAt: string;
}

export interface DesignSession {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: JobStatus;
  createdAt: string;
}

export interface DesignEventsResponse {
  session: DesignSession;
  jobStatus: JobStatus;
  lastError: string | null;
  events: FeatureEvent[];
}

export interface FeatureEventsResponse {
  jobStatus: JobStatus | null;
  lastError: string | null;
  events: FeatureEvent[];
}

/** A project's most recent `deploy` job (ADR 013 addendum) — no `events`, unlike FeatureEventsResponse: deploy runs synchronously in the Orchestrator with no curated event stream. */
export interface DeployStatus {
  status: JobStatus | null;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Deterministic from the project slug (`<slug>.apps.<domain>`) — always present regardless of job status; only link to it once `status === "completed"`. */
  url: string;
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

// --- ADR 018: multi-provider model configuration ---

export const AGENT_JOB_KINDS = [
  "spec_grill",
  "feature_build",
  "test_run",
  "agentic_review",
  "design_grill",
] as const;
export type AgentJobKind = (typeof AGENT_JOB_KINDS)[number];

export const AGENT_JOB_KIND_LABELS: Record<AgentJobKind, string> = {
  spec_grill: "Spec grill",
  feature_build: "Feature build",
  test_run: "Tests",
  agentic_review: "Agentic review",
  design_grill: "Design grill",
};

export const PROVIDER_TYPES = ["openrouter", "anthropic", "custom_openai_compatible"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  custom_openai_compatible: "Custom (OpenAI-compatible)",
};

/** Mirrors the API's DEFAULT_PROVIDER_BASE_URLS (ADR 018) — used to prefill the add-provider form. */
export const DEFAULT_PROVIDER_BASE_URLS: Record<Exclude<ProviderType, "custom_openai_compatible">, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1",
};

export interface OrgProvider {
  id: string;
  organizationId: string;
  name: string;
  providerType: ProviderType;
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgModel {
  id: string;
  organizationId: string;
  providerId: string;
  providerName: string;
  providerType: ProviderType;
  displayName: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobModelDefault {
  organizationId: string;
  jobKind: AgentJobKind;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectJobModelOverride {
  projectId: string;
  jobKind: AgentJobKind;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

// --- ADR 018 amendment (issue #5): the per-feature override tier ---

/** Mirrors the API's ModelConfigSource: which tier a job kind's config resolves from, narrowest first. */
export const MODEL_CONFIG_SOURCES = [
  "feature_custom",
  "feature_override",
  "project_custom",
  "project_override",
  "organization_default",
  "none",
] as const;
export type ModelConfigSource = (typeof MODEL_CONFIG_SOURCES)[number];

export interface FeatureJobModelOverride {
  featureId: string;
  jobKind: AgentJobKind;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

/** The feature tier's custom-triplet metadata — the key that's set, never its value. */
export interface FeatureModelSecretMetadata {
  id: string;
  key: string;
  createdAt: string;
  updatedAt: string;
}

/** One job kind's effective configuration: where it comes from, and — for a catalog tier — the model by name. */
export interface FeatureModelConfigEntry {
  jobKind: AgentJobKind;
  source: ModelConfigSource;
  modelId: string | null;
  modelDisplayName: string | null;
  providerName: string | null;
}

export interface FeatureModelConfigResponse {
  /** True only when all three MODEL_* keys are set at the feature tier. */
  customTripletSet: boolean;
  jobKinds: FeatureModelConfigEntry[];
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

/**
 * One row of the notification-preferences settings (ADR 027). `kind: null` is
 * the organization-wide "all project activity" row. `enabled` is the
 * *effective* state the API resolved — a kind with no row of its own inherits
 * the org-wide row, so this is not necessarily a stored value.
 */
export interface NotificationPreferenceEntry {
  kind: string | null;
  label: string;
  description: string | null;
  enabled: boolean;
}

export interface NotificationPreferencesResponse {
  organizationId: string;
  preferences: NotificationPreferenceEntry[];
  /** Project ids this user has muted, across every organization. */
  mutedProjectIds: string[];
}

// --- Organization / RBAC (ADR 016) ---

export type OrgStatus = "pending_cluster" | "ready";

export type OrgRole = "admin" | "developer" | "designer" | "product_manager" | "tester";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  isPersonal: boolean;
  status: OrgStatus;
  role: OrgRole;
  createdAt: string;
  updatedAt: string;
}

export interface OrgMember {
  userId: string;
  username: string;
  displayName: string;
  githubLogin: string;
  role: OrgRole;
}

export interface OrgInvite {
  id: string;
  organizationId: string;
  token: string;
  role: OrgRole;
  createdByUserId: string;
  createdAt: string;
}

export type CapabilityLevel = "full" | "partial" | "none";

export interface RoleCapability {
  role: OrgRole;
  capability: string;
  level: CapabilityLevel;
}

export interface RolesResponse {
  roles: OrgRole[];
  roleDisplayNames: Record<OrgRole, string>;
  capabilities: RoleCapability[];
}

export interface OrgClusterMetadata {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

// --- Audit trail (ADR 028) ---

export type AuditActorKind = "user" | "system" | "webhook" | "job";

/** One recorded mutation. `metadata` is free-form per action — see the ADR's coverage table. */
export interface AuditEvent {
  id: string;
  organizationId: string;
  projectId: string | null;
  projectName: string | null;
  actorUserId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorKind: AuditActorKind;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface AuditEventsResponse {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Admin",
  developer: "Developer",
  designer: "Designer",
  product_manager: "Product Manager",
  tester: "Tester",
};

// --- Feature lifecycle gates (ADR 015 / Track B: Testing, Agentic Review) ---

export interface TestingStep {
  name: string;
  status: "pass" | "fail";
  details: string | null;
  screenshotPath: string | null;
  createdAt: string;
}

export interface TestingReport {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  coveragePercent: number | null;
  failingTests: string[];
  summary: string;
  recordingPath: string | null;
  createdAt: string;
}

export interface TestingRun {
  jobId: string;
  testId: string | null;
  testGroup: "unit" | "integration" | null;
  status: JobStatus;
  report: TestingReport | null;
  steps: TestingStep[];
}

export interface TestingResults {
  featureId: string;
  status: FeatureStatus;
  runs: TestingRun[];
}

export interface TestReport {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  coveragePercent?: number | null;
  failingTests: unknown[];
}

export function emptyTestReport(): TestReport {
  return { passed: 0, failed: 0, skipped: 0, total: 0, coveragePercent: null, failingTests: [] };
}

export function testReportToTestingResults(
  featureId: string,
  report: TestReport,
): TestingResults {
  return {
    featureId,
    status: "testing",
    runs: [{
      jobId: `report-${featureId}`,
      testId: null,
      testGroup: null,
      status: "completed",
      report: {
        passed: report.passed,
        failed: report.failed,
        skipped: report.skipped,
        total: report.total,
        coveragePercent: report.coveragePercent ?? null,
        failingTests: report.failingTests.map(String),
        summary: "",
        recordingPath: null,
        createdAt: new Date().toISOString(),
      },
      steps: [],
    }],
  };
}

/**
 * Agentic Review result model (ADR 015 items 13-16, B6). The reviewing agent
 * ends with `submit_review({verdict, comment})`; the web surfaces the verdict
 * plus the per-location findings.
 */
export type AgenticReviewVerdict = "approved" | "changes_requested";

export interface AgenticReviewFinding {
  location: string;
  note: string;
  blocking: boolean;
}

export interface AgenticReview {
  featureId: string;
  /**
   * The review's terminal verdict. `null` = the stage ran but no final
   * verdict was relayed yet (still in flight).
   */
  verdict: AgenticReviewVerdict | null;
  comment: string | null;
  findings: AgenticReviewFinding[];
}

export function emptyAgenticReview(featureId: string): AgenticReview {
  return { featureId, verdict: null, comment: null, findings: [] };
}

// --- Usage / analytics reporting (ADR 023) ---

/** One aggregation bucket: a token total plus how many sessions produced it. */
export interface UsageBucket {
  tokens: number;
  sessions: number;
}

export interface UsageByProvider extends UsageBucket {
  providerName: string | null;
  /** `null` when no session in the bucket had a provider-reported cost. */
  costUsd: number | null;
}

export interface UsageByKind extends UsageBucket {
  jobKind: string;
}

export interface UsageByProject extends UsageBucket {
  projectId: string;
  projectName: string;
}

export interface UsageByModel extends UsageBucket {
  modelId: string | null;
  providerName: string | null;
}

export interface UsageActivityDay {
  date: string;
  sessions: number;
  tokens: number;
}

export interface UsageSession {
  jobId: string;
  projectId: string;
  projectName: string;
  jobKind: string;
  /** Feature title / test name / design name — whichever this job kind has. */
  title: string | null;
  featureId: string | null;
  testId: string | null;
  status: string;
  tokens: number;
  costUsd: number | null;
  durationMs: number | null;
  createdAt: string;
}

export interface UsageTotals {
  sessions: number;
  tokens: number;
  costUsd: number | null;
  /** The same window immediately before this one, for period-over-period change. */
  previousSessions: number;
  previousTokens: number;
}

export interface OrganizationUsageReport {
  days: number;
  from: string;
  to: string;
  totals: UsageTotals;
  byProvider: UsageByProvider[];
  byKind: UsageByKind[];
  byProject: UsageByProject[];
}

export interface OrganizationAnalyticsReport {
  days: number;
  from: string;
  to: string;
  totals: UsageTotals;
  activity: UsageActivityDay[];
  byKind: UsageByKind[];
  byProject: UsageByProject[];
  byModel: UsageByModel[];
  recentSessions: UsageSession[];
}

export interface ProjectUsageReport {
  days: number;
  from: string;
  to: string;
  totals: UsageTotals;
  byProvider: UsageByProvider[];
  byKind: UsageByKind[];
}

export interface ProjectAnalyticsReport {
  days: number;
  from: string;
  to: string;
  totals: UsageTotals;
  activity: UsageActivityDay[];
  byKind: UsageByKind[];
  byModel: UsageByModel[];
  recentSessions: UsageSession[];
}
