import { apiUrl } from "@/lib/config";
import type {
  AgentJobKind,
  AuditEventsResponse,
  DeployStatus,
  DesignEventsResponse,
  DesignSession,
  Feature,
  FeatureEventsResponse,
  FeatureJobModelOverride,
  FeatureModelConfigResponse,
  FeatureModelSecretMetadata,
  GithubAccessResponse,
  JobModelDefault,
  ModelConfigInput,
  Notification,
  NotificationPreferenceEntry,
  NotificationPreferencesResponse,
  NotificationsResponse,
  OrgClusterMetadata,
  Organization,
  OrgInvite,
  OrgMember,
  OrgModel,
  OrgProvider,
  OrgRole,
  Project,
  ProjectJobModelOverride,
  ProjectOverview,
  ProjectSecretMetadata,
  ProviderType,
  RolesResponse,
  Test,
  AgenticReview,
  TestingResults,
} from "@/lib/features/types";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error: ${response.status} ${response.statusText}`);
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

/** Re-dispatches spec_grill for a project_init feature stuck without a resolvable model config (ADR 007). */
export async function retryFeatureGrill(projectId: string, featureId: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/retry-grill`),
    { method: "POST", credentials: "include" },
  );
  await parseJson<unknown>(response);
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
 * The Agentic Review stage's verdict + findings for a feature (B6). Returns
 * `null` when the stage hasn't produced a result yet.
 */
export async function fetchFeatureAgenticReview(
  projectId: string,
  featureId: string,
): Promise<AgenticReview | null> {
  const response = await fetch(
    apiUrl(`/projects/${projectId}/features/${featureId}/agentic-review`),
    { cache: "no-store", credentials: "include" },
  );
  return parseJson<AgenticReview | null>(response);
}
