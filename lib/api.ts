import { apiUrl } from "@/lib/config";
import type {
  DeployStatus,
  DesignEventsResponse,
  DesignSession,
  Feature,
  FeatureEventsResponse,
  GithubAccessResponse,
  ModelConfigInput,
  Notification,
  NotificationsResponse,
  OrgClusterMetadata,
  Organization,
  OrgInvite,
  OrgMember,
  OrgRole,
  Project,
  ProjectOverview,
  ProjectSecretMetadata,
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

/** Account-level default model configuration (ADR 007) — resolved as a fallback for projects with no override. */
export async function fetchAccountSecrets(): Promise<ProjectSecretMetadata[]> {
  const response = await fetch(apiUrl("/settings/secrets"), {
    cache: "no-store",
    credentials: "include",
  });
  return parseJson<ProjectSecretMetadata[]>(response);
}

export async function upsertAccountSecret(
  key: string,
  value: string,
): Promise<ProjectSecretMetadata> {
  const response = await fetch(apiUrl("/settings/secrets"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return parseJson<ProjectSecretMetadata>(response);
}

export async function deleteAccountSecret(secretId: string): Promise<void> {
  const response = await fetch(apiUrl(`/settings/secrets/${secretId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
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

export async function cancelFeatureGrill(projectId: string, featureId: string): Promise<void> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features/${featureId}/cancel`), {
    method: "POST",
    credentials: "include",
  });
  await parseJson<unknown>(response);
}

export interface CreateDesignInput {
  name: string;
  description: string;
  slug?: string;
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

// --- Feature Action Items (ADR 015 / Track B) ---

export interface ActionItem {
  id: string;
  type: "secret_request" | "design_grill" | "subtask_feature" | "test_request";
  description: string;
  status: "open" | "resolved";
  resolvedAt: string | null;
  secretKey: string | null;
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
