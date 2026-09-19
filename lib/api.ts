import { apiUrl } from "@/lib/config";
import { formatApiError } from "@/lib/features/load-errors";
import { agenticReviewFromResponse } from "@/lib/features/agentic-review";
import { LISTING_NEEDS_ADMIN } from "@/lib/features/model-catalog";
import type {
  AgentJobKind,
  AuditEventsResponse,
  DeployHistoryResponse,
  DeployStatus,
  Design,
  DesignDetailResponse,
  DesignEventsResponse,
  DesignSession,
  DesignsResponse,
  Feature,
  FeatureEventsResponse,
  FeatureGrillRunsResponse,
  FeatureJobModelOverride,
  FeatureModelConfigResponse,
  FeatureModelSecretMetadata,
  GithubAccessResponse,
  JobModelDefault,
  JobRecordingResponse,
  JobSessionResponse,
  ModelConfigInput,
  Notification,
  NotificationPreferenceEntry,
  NotificationPreferencesResponse,
  NotificationsResponse,
  OrgClusterMetadata,
  Organization,
  OrgExtension,
  OrgExtensionDetailResponse,
  OrgExtensionResponse,
  OrgExtensionsResponse,
  OrgInvite,
  OrgMember,
  OrgModel,
  OrgProvider,
  OrgRole,
  OrganizationAllocationsResponse,
  Project,
  ProjectJobModelOverride,
  ProjectOverview,
  ProjectPreviewsResponse,
  ProjectResourceQuota,
  ProjectSecretMetadata,
  ProviderModelsResult,
  ProviderType,
  ReadinessReport,
  RolesResponse,
  Test,
  TestRunHistoryEntry,
  TestRunsResponse,
  TokenCapState,
  AgenticReview,
  AgenticReviewResponse,
  TestingResults,
  OrganizationAnalyticsReport,
  OrganizationUsageReport,
  ProjectAnalyticsReport,
  ProjectUsageReport,
} from "@/lib/features/types";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    // The status is always included, not only when there is no body: it is the
    // one thing the failure-copy module classifies on, and building the message
    // anywhere else is how it came to be dropped for every error the API
    // answered with JSON (see `formatApiError`'s note).
    throw new Error(formatApiError(response.status, response.statusText, body?.error));
  }
  return response.json() as Promise<T>;
}

export interface BlockingFeature {
  id: string;
  title: string;
  slug: string;
  status: string;
}

export interface BlockingTestRun {
  jobId: string;
  testId: string | null;
}

export interface ProjectDeletionBlocker {
  reason: string;
  features: BlockingFeature[];
  testRuns: BlockingTestRun[];
}

export class ProjectDeletionBlockedError extends Error {
  readonly blocker: ProjectDeletionBlocker;

  constructor(blocker: ProjectDeletionBlocker) {
    super(blocker.reason);
    this.name = "ProjectDeletionBlockedError";
    this.blocker = blocker;
  }
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch(apiUrl("/projects"), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<Project[]>(response);
}

export interface CreateProjectRepository {
  githubOwner: string;
  githubRepo: string;
  isPrimary: boolean;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  installationId: string;
  repositories: CreateProjectRepository[];
  /** The org to create the project under (ADR 016). Omit to default to the caller's personal org. */
  organizationId?: string;
  /** Custom bundle for this project only. Omit to inherit the org config. */
  modelConfig?: ModelConfigInput;
  /** Ignored since ADR 007 was retired — retained for request-shape compatibility. */
  saveModelConfigAsDefault?: boolean;
}

export async function fetchGithubAccess(options?: { force?: boolean }): Promise<GithubAccessResponse> {
  const query = options?.force ? "?refresh=1" : "";
  const response = await fetch(apiUrl(`/github/installations${query}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<GithubAccessResponse>(response);
}

export async function fetchInstallationConfigureUrl(
  installationId: string,
): Promise<string> {
  const response = await fetch(
    apiUrl(`/github/installations/${installationId}/configure-url`),
    { cache: "no-store", credentials: "include" },
  );
  const data = await parseJson<{ url: string }>(response);
  return data.url;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const response = await fetch(apiUrl("/projects"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<Project>(response);
}

export async function fetchProject(projectId: string): Promise<Project> {
  const response = await fetch(apiUrl(`/projects/${projectId}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<Project>(response);
}

export interface AddProjectRepositoryInput {
  githubOwner: string;
  githubRepo: string;
}

export async function addProjectRepository(
  projectId: string,
  input: AddProjectRepositoryInput,
): Promise<Project> {
  const response = await fetch(apiUrl(`/projects/${projectId}/repositories`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<Project>(response);
}

export async function removeProjectRepository(
  projectId: string,
  repositoryId: string,
): Promise<Project> {
  const response = await fetch(apiUrl(`/projects/${projectId}/repositories/${repositoryId}`), {
    method: "DELETE",
    credentials: "include",
  });
  return parseJson<Project>(response);
}

export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(apiUrl(`/projects/${projectId}`), {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "delete" }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string; features?: BlockingFeature[]; testRuns?: BlockingTestRun[] }
      | null;
    if (response.status === 409 && body?.error) {
      throw new ProjectDeletionBlockedError({
        reason: body.error,
        features: body.features ?? [],
        testRuns: body.testRuns ?? [],
      });
    }
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

export async function completeProjectInit(projectId: string): Promise<Project> {
  const response = await fetch(apiUrl(`/projects/${projectId}/complete-init`), {
    method: "POST",
    credentials: "include",
  });
  return parseJson<Project>(response);
}

export async function fetchDeployStatus(projectId: string): Promise<DeployStatus> {
  const response = await fetch(apiUrl(`/projects/${projectId}/deploy`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<DeployStatus>(response);
}

/** Manually (re)dispatches the project's `deploy` job — the "Deploy now" action. */
export async function triggerDeploy(projectId: string): Promise<void> {
  const response = await fetch(apiUrl(`/projects/${projectId}/deploy`), {
    method: "POST",
    credentials: "include",
  });
  await parseJson<unknown>(response);
}

/** ADR 022: the project's deploy history plus the revisions it can roll back to. */
export async function fetchDeployHistory(projectId: string): Promise<DeployHistoryResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/deploys`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<DeployHistoryResponse>(response);
}

/**
 * ADR 022: rolls the primary deployment back to an earlier revision. Enqueues a
 * `rollback` job — the API rejects an unknown target, the already-live revision,
 * or a request made while another deployment operation is in flight.
 */
export async function requestRollback(projectId: string, revision: number): Promise<void> {
  const response = await fetch(apiUrl(`/projects/${projectId}/rollback`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision }),
  });
  await parseJson<unknown>(response);
}

/** ADR 015 item 12: toggles the per-project Agentic Review gate (default on). */
export async function setAgenticReviewEnabled(
  projectId: string,
  enabled: boolean,
): Promise<Project> {
  const response = await fetch(apiUrl(`/projects/${projectId}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agenticReviewEnabled: enabled }),
  });
  return parseJson<Project>(response);
}

export async function fetchProjectSecrets(
  projectId: string,
): Promise<ProjectSecretMetadata[]> {
  const response = await fetch(apiUrl(`/projects/${projectId}/secrets`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ProjectSecretMetadata[]>(response);
}

export async function upsertProjectSecret(
  projectId: string,
  key: string,
  value: string,
): Promise<ProjectSecretMetadata> {
  const response = await fetch(apiUrl(`/projects/${projectId}/secrets`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return parseJson<ProjectSecretMetadata>(response);
}

export async function deleteProjectSecret(
  projectId: string,
  secretId: string,
): Promise<void> {
  const response = await fetch(apiUrl(`/projects/${projectId}/secrets/${secretId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

// --- ADR 018: org providers, model catalog, per-job-kind defaults ---

export async function fetchOrgProviders(organizationId: string): Promise<OrgProvider[]> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/providers`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<OrgProvider[]>(response);
}

export async function createOrgProvider(
  organizationId: string,
  input: { name: string; providerType: ProviderType; baseUrl?: string; apiKey: string },
): Promise<OrgProvider> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/providers`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<OrgProvider>(response);
}

export async function updateOrgProvider(
  organizationId: string,
  providerId: string,
  input: { name?: string; baseUrl?: string; apiKey?: string },
): Promise<OrgProvider> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/providers/${providerId}`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<OrgProvider>(response);
}

export async function deleteOrgProvider(organizationId: string, providerId: string): Promise<void> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/providers/${providerId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

export interface ProviderConnectionTestResult {
  ok: boolean;
  error?: string;
}

export async function testOrgProviderConnection(
  organizationId: string,
  input: { providerType: ProviderType; baseUrl?: string; apiKey: string },
): Promise<ProviderConnectionTestResult> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/providers/test-connection`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<ProviderConnectionTestResult>(response);
}

export async function testOrgProvider(
  organizationId: string,
  providerId: string,
): Promise<ProviderConnectionTestResult> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/providers/${providerId}/test-connection`),
    { method: "POST", credentials: "include" },
  );
  return parseJson<ProviderConnectionTestResult>(response);
}

export async function fetchOrgModels(organizationId: string): Promise<OrgModel[]> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/models`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<OrgModel[]>(response);
}

export async function createOrgModel(
  organizationId: string,
  input: { providerId: string; displayName: string; modelId: string },
): Promise<OrgModel> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/models`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<OrgModel>(response);
}

/**
 * The models a provider the organization has configured actually serves
 * (ADR 018 / issue #36), so adding a catalog model is a choice rather than a
 * hand-typed identifier that fails later as a broken job.
 *
 * A failure is returned rather than thrown: the provider being unreachable or
 * the key being rejected is not an error in the *page*, and the caller renders
 * the reason next to the model field instead of replacing the whole catalog with
 * an error state.
 */
export async function fetchOrgProviderModels(
  organizationId: string,
  providerId: string,
): Promise<ProviderModelsResult> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/providers/${providerId}/models`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<ProviderModelsResult>(response);
}

/**
 * The same listing for a connection that is not in the catalog — the custom
 * `baseUrl` + `apiKey` triplet, where nothing is stored to read and the
 * credentials come from the form. Admin-only, like the stored-provider listing;
 * the field keeps its free-text fallback for everyone else.
 */
export async function listModelsForConnection(
  organizationId: string,
  input: { baseUrl: string; apiKey: string; providerType?: ProviderType },
): Promise<ProviderModelsResult> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/providers/probe-models`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  // A 403 is not a listing failure — it is "you cannot do this", which the field
  // explains differently (and which leaving the field as free text already
  // handles). Returned as a reason rather than thrown so the card does not have
  // to special-case an exception to get the copy right.
  if (response.status === 403) {
    return { ok: false, error: LISTING_NEEDS_ADMIN };
  }
  return parseJson<ProviderModelsResult>(response);
}

export async function deleteOrgModel(organizationId: string, modelId: string): Promise<void> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/models/${modelId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

export async function fetchOrgJobModelDefaults(organizationId: string): Promise<JobModelDefault[]> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/job-model-defaults`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<JobModelDefault[]>(response);
}

export async function setOrgJobModelDefault(
  organizationId: string,
  jobKind: AgentJobKind,
  modelId: string,
): Promise<JobModelDefault> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/job-model-defaults/${jobKind}`),
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    },
  );
  return parseJson<JobModelDefault>(response);
}

export async function clearOrgJobModelDefault(
  organizationId: string,
  jobKind: AgentJobKind,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/job-model-defaults/${jobKind}`),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok && response.status !== 404) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

export async function fetchProjectJobModelOverrides(
  projectId: string,
): Promise<ProjectJobModelOverride[]> {
  const response = await fetch(apiUrl(`/projects/${projectId}/job-model-overrides`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ProjectJobModelOverride[]>(response);
}

export async function setProjectJobModelOverride(
  projectId: string,
  jobKind: AgentJobKind,
  modelId: string,
): Promise<ProjectJobModelOverride> {
  const response = await fetch(apiUrl(`/projects/${projectId}/job-model-overrides/${jobKind}`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId }),
  });
  return parseJson<ProjectJobModelOverride>(response);
}

export async function clearProjectJobModelOverride(
  projectId: string,
  jobKind: AgentJobKind,
): Promise<void> {
  const response = await fetch(apiUrl(`/projects/${projectId}/job-model-overrides/${jobKind}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok && response.status !== 404) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

// --- ADR 018 amendment (issue #5): the per-feature override tier ---

/**
 * The read that makes "inherit" legible: for every agent job kind, which tier
 * wins and — when it's a catalog tier — the model by name. Values are never
 * part of the response.
 */
export async function fetchFeatureModelConfig(
  projectId: string,
  featureId: string,
): Promise<FeatureModelConfigResponse> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/model-config`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<FeatureModelConfigResponse>(response);
}

export async function fetchFeatureJobModelOverrides(
  projectId: string,
  featureId: string,
): Promise<FeatureJobModelOverride[]> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/job-model-overrides`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<FeatureJobModelOverride[]>(response);
}

export async function setFeatureJobModelOverride(
  projectId: string,
  featureId: string,
  jobKind: AgentJobKind,
  modelId: string,
): Promise<FeatureJobModelOverride> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/job-model-overrides/${jobKind}`),
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    },
  );
  return parseJson<FeatureJobModelOverride>(response);
}

export async function clearFeatureJobModelOverride(
  projectId: string,
  featureId: string,
  jobKind: AgentJobKind,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/job-model-overrides/${jobKind}`),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok && response.status !== 404) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

export async function fetchFeatureModelSecrets(
  projectId: string,
  featureId: string,
): Promise<FeatureModelSecretMetadata[]> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/model-secrets`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<FeatureModelSecretMetadata[]>(response);
}

/**
 * Writes the feature's custom triplet as one all-or-nothing bundle — the API
 * rejects a partial triplet, so the UI can never leave a half-configured
 * override behind.
 */
export async function saveFeatureModelSecrets(
  projectId: string,
  featureId: string,
  bundle: { modelBaseUrl: string; modelApiKey: string; modelId: string },
): Promise<FeatureModelSecretMetadata[]> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/model-secrets`),
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
    },
  );
  return parseJson<FeatureModelSecretMetadata[]>(response);
}

export async function clearFeatureModelSecrets(
  projectId: string,
  featureId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/model-secrets`),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok && response.status !== 404) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

export async function fetchProjectOverview(projectId: string): Promise<ProjectOverview> {
  const response = await fetch(apiUrl(`/projects/${projectId}/overview`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ProjectOverview>(response);
}

export async function fetchFeatures(projectId: string): Promise<Feature[]> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<Feature[]>(response);
}

export async function fetchFeature(
  projectId: string,
  featureId: string,
): Promise<Feature> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features/${featureId}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<Feature>(response);
}

export async function createFeature(
  projectId: string,
  title: string,
): Promise<Feature> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return parseJson<Feature>(response);
}

export async function updateFeature(
  projectId: string,
  featureId: string,
  body: {
    adrMarkdown?: string;
    approveAdr?: boolean;
    startBuild?: boolean;
  },
): Promise<Feature> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features/${featureId}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<Feature>(response);
}

export async function fetchFeatureEvents(
  projectId: string,
  featureId: string,
): Promise<FeatureEventsResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features/${featureId}/events`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<FeatureEventsResponse>(response);
}

/**
 * Issue #28 part 2: a feature's **earlier** `spec_grill` runs, so the Spec page can
 * offer what a rewind discarded. The API returns earlier runs only and says so in
 * the response key; this reads it verbatim rather than filtering a full list.
 */
export async function fetchFeatureGrillRuns(
  projectId: string,
  featureId: string,
): Promise<FeatureGrillRunsResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features/${featureId}/grill-runs`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<FeatureGrillRunsResponse>(response);
}

/**
 * Issue #28 part 2: one run's transcript, by job id — the read that makes a
 * superseded run's conversation reachable.
 *
 * Deliberately separate from `fetchFeatureEvents`, which resolves the feature's
 * *latest* job. The two answer different questions — "the current conversation"
 * and "that one, the one I rewound away" — and collapsing them into one function
 * with an optional job id would hide which a caller means.
 *
 * `awaitingReply` is absent from this response by design (see the API route): a
 * terminal run is waiting on nothing, so there is no live wait to report.
 */
export async function fetchFeatureJobEvents(
  projectId: string,
  featureId: string,
  jobId: string,
): Promise<FeatureEventsResponse> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/jobs/${jobId}/events`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<FeatureEventsResponse>(response);
}

export async function sendFeatureMessage(
  projectId: string,
  featureId: string,
  content: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/messages`),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  await parseJson<unknown>(response);
}

export async function cancelFeature(projectId: string, featureId: string): Promise<Feature> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features/${featureId}/cancel`), {
    method: "POST",
    credentials: "include",
  });
  return parseJson<Feature>(response);
}

export async function restartFeature(projectId: string, featureId: string): Promise<Feature> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features/${featureId}/restart`), {
    method: "POST",
    credentials: "include",
  });
  return parseJson<Feature>(response);
}

export interface CreateDesignInput {
  name: string;
  description: string;
  slug?: string;
  featureId?: string;
  actionItemId?: string;
}

export async function createDesignSession(
  projectId: string,
  input: CreateDesignInput,
): Promise<DesignSession> {
  const response = await fetch(apiUrl(`/projects/${projectId}/designs`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<DesignSession>(response);
}

export async function fetchDesignEvents(
  projectId: string,
  sessionId: string,
): Promise<DesignEventsResponse> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/designs/${sessionId}/events`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<DesignEventsResponse>(response);
}

export async function sendDesignMessage(
  projectId: string,
  sessionId: string,
  content: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/designs/${sessionId}/messages`),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  );
  await parseJson<unknown>(response);
}

export async function cancelDesignSession(
  projectId: string,
  sessionId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/designs/${sessionId}/cancel`),
    { method: "POST", credentials: "include" },
  );
  await parseJson<unknown>(response);
}

/** A project's saved designs, most recently touched first (ADR 020 item 6). */
export async function fetchDesigns(projectId: string): Promise<DesignsResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/designs`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<DesignsResponse>(response);
}

/** One design plus every session that has worked on it. */
export async function fetchDesign(
  projectId: string,
  designId: string,
): Promise<DesignDetailResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/designs/${designId}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<DesignDetailResponse>(response);
}

/** Re-dispatches spec_grill for a project_init feature stuck without a resolvable model config (ADR 007). */
export async function retryFeatureGrill(projectId: string, featureId: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/retry-grill`),
    { method: "POST", credentials: "include" },
  );
  await parseJson<unknown>(response);
}

/**
 * ADR 024: rewinds a feature's Spec interview to one transcript turn and
 * re-runs it from there. The feature goes back to `draft` and a new spec_grill
 * job is dispatched whose seed is the conversation before `eventId`.
 */
export async function restartFeatureFromMessage(
  projectId: string,
  featureId: string,
  eventId: string,
): Promise<Feature> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/restart-from-message`),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    },
  );
  return parseJson<Feature>(response);
}

/** Re-dispatches feature_build for a feature whose build failed, keeping the already-approved ADR. */
export async function retryFeatureBuild(projectId: string, featureId: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/retry-build`),
    { method: "POST", credentials: "include" },
  );
  await parseJson<unknown>(response);
}

export async function fetchTests(projectId: string): Promise<Test[]> {
  const response = await fetch(apiUrl(`/projects/${projectId}/tests`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<Test[]>(response);
}

export interface CreateTestInput {
  name: string;
  specMarkdown: string;
  scheduleCron: string;
  enabled?: boolean;
}

export async function createTest(
  projectId: string,
  input: CreateTestInput,
): Promise<Test> {
  const response = await fetch(apiUrl(`/projects/${projectId}/tests`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<Test>(response);
}

export async function fetchTest(projectId: string, testId: string): Promise<Test> {
  const response = await fetch(apiUrl(`/projects/${projectId}/tests/${testId}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<Test>(response);
}

export async function updateTest(
  projectId: string,
  testId: string,
  input: Partial<CreateTestInput>,
): Promise<Test> {
  const response = await fetch(apiUrl(`/projects/${projectId}/tests/${testId}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<Test>(response);
}

/**
 * Issue #31 (ADR 026 follow-up 4): dispatch this test now instead of waiting for
 * its schedule.
 *
 * Returns the new job id so the caller can refresh the right thing. Throws on
 * failure like every other mutating call, and the two failures worth naming are
 * both **409**: a run already in progress, and a project that has not finished
 * initialization. `parseJson` puts the API's own sentence into the message
 * (`"This test already has a run in progress (API error: 409 Conflict)"`), so
 * `describeTriggerRunFailure` can surface it — the caller must not reduce that to
 * a generic "something went wrong", because the sentence is the entire value of
 * the 409.
 */
export async function triggerTestRun(
  projectId: string,
  testId: string,
): Promise<{ jobId: string }> {
  const response = await fetch(apiUrl(`/projects/${projectId}/tests/${testId}/run`), {
    method: "POST",
    credentials: "include",
  });
  return parseJson<{ jobId: string }>(response);
}

/**
 * Issue #31 part 1's write half: the IANA zone a project's schedules are read in.
 *
 * `null` clears it, which the API treats identically to omitting the field — both
 * mean "fall back to UTC". The API validates the name (`isValidTimeZone`, also an
 * `Intl` check) and answers `400 Unknown time zone: <name>` for a bad one; that
 * message is deliberately not rewritten here, because it names the problem more
 * precisely than "invalid input" would and the field is free-form at the API.
 *
 * Returns the value the server stored, so a caller can set state from the response
 * rather than assuming its request was taken verbatim.
 */
export async function setProjectTimeZone(
  projectId: string,
  timeZone: string | null,
): Promise<{ timeZone: string | null }> {
  const response = await fetch(apiUrl(`/projects/${projectId}/timezone`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeZone }),
  });
  return parseJson<{ timeZone: string | null }>(response);
}

export async function fetchNotifications(): Promise<NotificationsResponse> {
  const response = await fetch(apiUrl("/notifications"), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<NotificationsResponse>(response);
}

export async function markNotificationRead(notificationId: string): Promise<Notification> {
  const response = await fetch(apiUrl(`/notifications/${notificationId}/read`), {
    method: "PATCH",
    credentials: "include",
  });
  return parseJson<Notification>(response);
}

export async function markAllNotificationsRead(): Promise<void> {
  const response = await fetch(apiUrl("/notifications/read-all"), {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
}

/**
 * The caller's notification preferences for one organization (ADR 027).
 *
 * These are personal settings keyed by organization, not organization
 * settings: the route is under `/settings` and any member may read their own.
 */
export async function fetchNotificationPreferences(
  organizationId: string,
): Promise<NotificationPreferencesResponse> {
  const response = await fetch(
    apiUrl(`/settings/notification-preferences?org=${organizationId}`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<NotificationPreferencesResponse>(response);
}

/**
 * Sets one preference row. `kind: null` writes the organization-wide row that
 * every kind without a row of its own inherits.
 */
export async function setNotificationPreference(input: {
  organizationId: string;
  kind: string | null;
  enabled: boolean;
}): Promise<NotificationPreferenceEntry> {
  const response = await fetch(apiUrl("/settings/notification-preferences"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<NotificationPreferenceEntry>(response);
}

/** Mutes or unmutes one project's notifications for the caller. */
export async function setProjectNotificationMute(
  projectId: string,
  muted: boolean,
): Promise<{ projectId: string; muted: boolean }> {
  const response = await fetch(
    apiUrl(`/settings/notification-preferences/projects/${projectId}`),
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted }),
    },
  );
  return parseJson<{ projectId: string; muted: boolean }>(response);
}

// --- Organization / RBAC (ADR 016) ---

export async function fetchOrganizations(): Promise<Organization[]> {
  const response = await fetch(apiUrl("/organizations"), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<Organization[]>(response);
}

/**
 * Issue #35: whether this user's organizations can host a project, and what is
 * outstanding if they cannot.
 *
 * User-scoped rather than per-org (no `:organizationId`), because the question
 * the entry gate asks is about the user's whole membership: entry is permitted
 * when **any** org is ready, so asking about one org would answer a different
 * question. The API's own doc explains why this is not folded into `/auth/me` —
 * readiness costs a defaults read plus a model resolution per org, and it is only
 * meaningful at the entry gate, so it is asked only there.
 *
 * A thrown error here is meaningful to the middleware, which treats an
 * unreachable API as "do not gate" (the same posture as its existing `/auth/me`
 * call): failing closed on a transient blip would lock every user out of the app.
 */
export async function fetchOrganizationReadiness(): Promise<ReadinessReport> {
  const response = await fetch(apiUrl("/organizations/readiness"), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ReadinessReport>(response);
}

export async function createOrganization(input: {
  name: string;
  description?: string;
}): Promise<Organization> {
  const response = await fetch(apiUrl("/organizations"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<Organization>(response);
}

export async function fetchOrganization(organizationId: string): Promise<Organization> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<Organization>(response);
}

export async function updateOrganization(
  organizationId: string,
  input: { name?: string; description?: string },
): Promise<Organization> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<Organization>(response);
}

export async function fetchOrganizationMembers(
  organizationId: string,
): Promise<OrgMember[]> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/members`), {
    cache: "no-store",
    credentials: "include",
  });
  const data = await parseJson<{ members: OrgMember[] }>(response);
  return data.members;
}

export async function changeOrgMemberRole(
  organizationId: string,
  userId: string,
  role: OrgRole,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/members/${userId}`),
    { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) },
  );
  await parseJson<unknown>(response);
}

export async function removeOrgMember(organizationId: string, userId: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/members/${userId}`),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status}`);
  }
}

export async function createOrganizationInvite(
  organizationId: string,
  role: OrgRole,
): Promise<OrgInvite> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/invites`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return parseJson<OrgInvite>(response);
}

export async function fetchOrganizationInvites(
  organizationId: string,
): Promise<OrgInvite[]> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/invites`), {
    cache: "no-store",
    credentials: "include",
  });
  const data = await parseJson<{ invites: OrgInvite[] }>(response);
  return data.invites;
}

export async function revokeOrganizationInvite(
  organizationId: string,
  inviteId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/invites/${inviteId}`),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status}`);
  }
}

export async function acceptOrganizationInvite(token: string): Promise<Organization> {
  const response = await fetch(apiUrl(`/organizations/invites/${token}/accept`), {
    method: "POST",
    credentials: "include",
  });
  const data = await parseJson<{ organization: Organization }>(response);
  return data.organization;
}

export async function fetchOrganizationRoles(): Promise<RolesResponse> {
  const response = await fetch(apiUrl("/organizations/roles"), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<RolesResponse>(response);
}

export async function fetchOrganizationCluster(
  organizationId: string,
): Promise<OrgClusterMetadata | null> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/cluster`), {
    cache: "no-store",
    credentials: "include",
  });
  const data = await parseJson<{ cluster: OrgClusterMetadata | null }>(response);
  return data.cluster;
}

export async function setOrganizationCluster(
  organizationId: string,
  kubeconfig: string,
): Promise<OrgClusterMetadata> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/cluster`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kubeconfig }),
  });
  const data = await parseJson<{ cluster: OrgClusterMetadata }>(response);
  return data.cluster;
}

export async function testOrganizationCluster(
  organizationId: string,
  kubeconfig?: string,
): Promise<ProviderConnectionTestResult> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/cluster/test-connection`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kubeconfig ? { kubeconfig } : {}),
  });
  return parseJson<ProviderConnectionTestResult>(response);
}

export async function clearOrganizationCluster(organizationId: string): Promise<void> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/cluster`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status}`);
  }
}

export async function fetchOrganizationSecrets(
  organizationId: string,
): Promise<ProjectSecretMetadata[]> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/secrets`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ProjectSecretMetadata[]>(response);
}

export async function upsertOrganizationSecret(
  organizationId: string,
  key: string,
  value: string,
): Promise<ProjectSecretMetadata> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/secrets`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return parseJson<ProjectSecretMetadata>(response);
}

export async function deleteOrganizationSecret(
  organizationId: string,
  secretId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/secrets/${secretId}`),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status}`);
  }
}

// --- Audit trail (ADR 028) ---

/**
 * One page of an organization's audit trail, newest first. Admin-only on the
 * API side: a non-admin gets the API's 403 thrown as an Error.
 */
export async function fetchOrganizationAuditEvents(
  organizationId: string,
  filters: {
    projectId?: string;
    actorUserId?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<AuditEventsResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/audit${query ? `?${query}` : ""}`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<AuditEventsResponse>(response);
}

// --- Feature Action Items (ADR 015 / Track B) ---

export interface ActionItem {
  id: string;
  type: "secret_request" | "design_grill" | "subtask_feature" | "test_request";
  description: string;
  status: "open" | "resolved";
  resolvedAt: string | null;
  secretKey: string | null;
  designSessionId: string | null;
  subtaskFeatureId: string | null;
  draftTestMarkdown: string | null;
  createdAt: string;
}

export async function fetchFeatureActionItems(
  projectId: string,
  featureId: string,
): Promise<ActionItem[]> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/action-items`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<ActionItem[]>(response);
}

export async function resolveFeatureActionItem(
  projectId: string,
  featureId: string,
  itemId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/action-items/${itemId}/resolve`),
    { method: "POST", credentials: "include" },
  );
  await parseJson<unknown>(response);
}

export async function createTestFromActionItem(
  projectId: string,
  featureId: string,
  itemId: string,
  input: { name: string; specMarkdown?: string; scheduleCron: string },
): Promise<Test> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/action-items/${itemId}/test`),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return parseJson<Test>(response);
}

export async function autoResolveFeatureActionItems(
  projectId: string,
  featureId: string,
): Promise<{ resolved: number; remainingOpen: number }> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/action-items/auto-resolve`),
    { method: "POST", credentials: "include" },
  );
  return parseJson<{ resolved: number; remainingOpen: number }>(response);
}

export async function resumeFeatureImplementation(
  projectId: string,
  featureId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/resume`),
    { method: "POST", credentials: "include" },
  );
  await parseJson<unknown>(response);
}

// --- Feature lifecycle gates (ADR 015 / Track B: Testing, Agentic Review) ---

/**
 * The Testing stage's agentic runs and structured progress (B4). An empty
 * `runs` array means the stage has not dispatched a report yet.
 */
export async function fetchFeatureTestingResults(
  projectId: string,
  featureId: string,
): Promise<TestingResults | null> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/testing`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<TestingResults | null>(response);
}

/**
 * The Agentic Review stage's verdict + comments for a feature (B6).
 *
 * Returns `null` for "no review yet" rather than an object with a null verdict —
 * the endpoint answers `200 {verdict: null}` for that case, and the mapper
 * (`agenticReviewFromResponse`) is what turns it into the empty state. A thrown
 * error here therefore means a genuinely failed request, which is the distinction
 * this function could not make before: it used to 404, and the panel reported the
 * *failure* for both cases.
 *
 * The mapping happens here rather than in the panel so the wire shape is named in
 * exactly one place, next to the type that documents it.
 */
export async function fetchFeatureAgenticReview(
  projectId: string,
  featureId: string,
): Promise<AgenticReview | null> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/agentic-review`),
    { cache: "no-store", credentials: "include" },
  );
  return agenticReviewFromResponse(
    await parseJson<AgenticReviewResponse | null>(response),
  );
}

// --- Usage / analytics reporting (ADR 023) ---

/** Default reporting window, mirroring the API's own default. */
export const USAGE_DEFAULT_DAYS = 30;

/**
 * The organization's measured token/cost consumption. `days` bounds the
 * window; the response also carries the immediately preceding window's totals
 * so a page can show a period-over-period change without a second request.
 */
export async function fetchOrganizationUsage(
  organizationId: string,
  days: number = USAGE_DEFAULT_DAYS,
): Promise<OrganizationUsageReport> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/usage?days=${days}`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<OrganizationUsageReport>(response);
}

/** The organization's session activity and consumption breakdowns. */
export async function fetchOrganizationAnalytics(
  organizationId: string,
  days: number = USAGE_DEFAULT_DAYS,
): Promise<OrganizationAnalyticsReport> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/analytics?days=${days}`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<OrganizationAnalyticsReport>(response);
}

/** One project's slice of the organization's measured consumption. */
export async function fetchProjectUsage(
  projectId: string,
  days: number = USAGE_DEFAULT_DAYS,
): Promise<ProjectUsageReport> {
  const response = await fetch(apiUrl(`/projects/${projectId}/usage?days=${days}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ProjectUsageReport>(response);
}

/** One project's session activity and consumption breakdowns. */
export async function fetchProjectAnalytics(
  projectId: string,
  days: number = USAGE_DEFAULT_DAYS,
): Promise<ProjectAnalyticsReport> {
  const response = await fetch(apiUrl(`/projects/${projectId}/analytics?days=${days}`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ProjectAnalyticsReport>(response);
}

/**
 * ADR 003 §15: a project's ephemeral preview deployments — one per
 * preview-eligible job that is currently running, plus recent ended ones.
 *
 * Read-only: previews are created and removed by the Orchestrator as its jobs
 * run, so there is nothing a user can mutate here (and deliberately no manual
 * teardown control — that would need its own authorization story for something
 * the TTL sweep already handles).
 */
export async function fetchProjectPreviews(projectId: string): Promise<ProjectPreviewsResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/previews`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ProjectPreviewsResponse>(response);
}

/**
 * ADR 026 (issue #16): a Test entity's own run history — the standalone
 * Testing product's view. ADR 015's per-feature Testing tab is a different
 * read (`fetchFeatureTestingResults`), because it answers a different
 * question about the same reports.
 */
export async function fetchTestRuns(
  projectId: string,
  testId: string,
): Promise<TestRunsResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/tests/${testId}/runs`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<TestRunsResponse>(response);
}

/** One run of one test, with its report and steps. */
export async function fetchTestRun(
  projectId: string,
  testId: string,
  jobId: string,
): Promise<TestRunHistoryEntry> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/tests/${testId}/runs/${jobId}`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<TestRunHistoryEntry>(response);
}

// --- ADR 025: uploaded Pi extensions (org-scoped) ---
//
// Uploading is an org-admin action; the per-project opt-in is separate (see
// setProjectUploadedExtensionsEnabled below). The detail read is the only one
// that returns source, which is what lets a second admin review an extension
// they did not upload themselves.

export async function fetchOrgExtensions(
  organizationId: string,
): Promise<OrgExtensionsResponse> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/extensions`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<OrgExtensionsResponse>(response);
}

export async function fetchOrgExtension(
  organizationId: string,
  extensionId: string,
): Promise<OrgExtensionDetailResponse> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/extensions/${extensionId}`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<OrgExtensionDetailResponse>(response);
}

export async function uploadOrgExtension(
  organizationId: string,
  input: {
    name: string;
    slug?: string;
    entryPath?: string;
    files: Array<{ path: string; content: string }>;
    acknowledgedRisk: true;
  },
): Promise<OrgExtension> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/extensions`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parseJson<OrgExtensionResponse>(response);
  return body.extension;
}

export async function setOrgExtensionActive(
  organizationId: string,
  extensionId: string,
  active: boolean,
): Promise<OrgExtension> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/extensions/${extensionId}`),
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    },
  );
  const body = await parseJson<OrgExtensionResponse>(response);
  return body.extension;
}

export async function deleteOrgExtension(
  organizationId: string,
  extensionId: string,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/extensions/${extensionId}`),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
  }
}

/**
 * The per-project half of ADR 025. Its own endpoint rather than part of the
 * general project update, so a client cannot change this while saving
 * something else.
 */
export async function setProjectUploadedExtensionsEnabled(
  projectId: string,
  uploadedExtensionsEnabled: boolean,
): Promise<Project> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/uploaded-extensions-enabled`),
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadedExtensionsEnabled }),
    },
  );
  return parseJson<Project>(response);
}

/**
 * ADR 029: a run's screen recording metadata, fetched lazily.
 *
 * Lazy rather than folded into the run-history response on purpose. A recording
 * is orders of magnitude larger than everything else that list carries, and most
 * runs are never recorded, so shipping metadata for 25 runs to render one
 * expanded row would be paying for the exception on every page load. The user
 * expanding a run is an explicit, infrequent action — that is the right moment
 * to ask.
 *
 * A `recording: null` in the (200) response means "never recorded"; the API
 * signals a *reclaimed* recording as a non-null recording whose state is
 * "expired", so the two remain distinguishable here without any client-side
 * inference from timestamps.
 */
export async function fetchJobRecording(
  projectId: string,
  jobId: string,
): Promise<JobRecordingResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/jobs/${jobId}/recording`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<JobRecordingResponse>(response);
}

/**
 * ADR 032: what became of one run's Pi session.
 *
 * Answers for every run, including one with no session at all — the state is
 * `unknown` rather than the request failing, because "this run did not save a
 * session" is an ordinary answer the Spec page has to render rather than an error.
 * See api/src/sessions/routes.ts, which explains why the metadata route never 404s.
 *
 * No bytes are fetched here: a session is megabytes of raw JSONL, and the UI needs
 * the state and the size, not the transcript it already displays in rendered form.
 */
export async function fetchJobSession(
  projectId: string,
  jobId: string,
): Promise<JobSessionResponse> {
  const response = await fetch(apiUrl(`/projects/${projectId}/jobs/${jobId}/session`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<JobSessionResponse>(response);
}

/**
 * The recording's bytes URL, for a `<video src>`.
 *
 * Built from `apiUrl` rather than fetched, because a media element needs a URL
 * to stream from — it cannot consume a fetched blob without buffering the whole
 * artifact into memory first. Authorization rides on the session cookie exactly
 * as every other API call's does (`credentials: "include"` governs fetch; for a
 * `<video>` the cookie is sent because the API is same-site with the app).
 *
 * Served by the API behind that cookie, never from public storage: a recording
 * can capture real application data on screen and real credentials as they are
 * typed. See api/src/recordings/routes.ts.
 */
export function jobRecordingUrl(projectId: string, jobId: string): string {
  return apiUrl(`/projects/${projectId}/jobs/${jobId}/recording/content`);
}

/**
 * ADR 030: an organization's per-project allocation caps — both the monthly
 * token cap and the per-namespace resource quota, in one read so the two pages
 * cannot disagree about the period or the defaults.
 *
 * Readable by any member (a blocked developer needs to see why work stopped);
 * only admins can change either figure, which the API enforces.
 */
export async function fetchOrganizationAllocations(
  organizationId: string,
): Promise<OrganizationAllocationsResponse> {
  const response = await fetch(apiUrl(`/organizations/${organizationId}/allocations`), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<OrganizationAllocationsResponse>(response);
}

/** Sets or clears one project's monthly token cap (null clears it). */
export async function setProjectTokenCap(
  organizationId: string,
  projectId: string,
  monthlyTokenCap: number | null,
): Promise<TokenCapState> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/allocations/projects/${projectId}/token-cap`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ monthlyTokenCap }),
    },
  );
  return parseJson<TokenCapState>(response);
}

/** Sets one project's namespace resource limits. */
export async function setProjectResourceQuota(
  organizationId: string,
  projectId: string,
  quota: { cpuMillicores: number; memoryMib: number; pods: number },
): Promise<ProjectResourceQuota> {
  const response = await fetch(
    apiUrl(`/organizations/${organizationId}/allocations/projects/${projectId}/quota`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(quota),
    },
  );
  return parseJson<ProjectResourceQuota>(response);
}
