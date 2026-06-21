import { apiUrl } from "@/lib/config";
import type {
  Feature,
  Notification,
  NotificationsResponse,
  Project,
  ProjectOverview,
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
  repositories: CreateProjectRepository[];
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

export async function completeProjectInit(projectId: string): Promise<Project> {
  const response = await fetch(apiUrl(`/projects/${projectId}/complete-init`), {
    method: "POST",
    credentials: "include",
  });
  return parseJson<Project>(response);
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
