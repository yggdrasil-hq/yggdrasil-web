import { apiUrl } from "@/lib/config";
import type {
  Feature,
  FeatureEventsResponse,
  GithubAccessResponse,
  ModelConfigInput,
  Notification,
  NotificationsResponse,
  Project,
  ProjectOverview,
  ProjectSecretMetadata,
  Test,
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
  /** Custom bundle for this project only (ADR 007). Omit to inherit the account default. */
  modelConfig?: ModelConfigInput;
  /** Also save `modelConfig` as the account default. Ignored if modelConfig is omitted. */
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
