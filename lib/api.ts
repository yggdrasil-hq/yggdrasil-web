import { apiUrl } from "@/lib/config";
import type { Feature, Project } from "@/lib/features/types";

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchProject(projectId: string): Promise<Project> {
  const response = await fetch(apiUrl(`/projects/${projectId}`), {
    cache: "no-store",
  });
  return parseJson<Project>(response);
}

export async function fetchFeatures(projectId: string): Promise<Feature[]> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features`), {
    cache: "no-store",
  });
  return parseJson<Feature[]>(response);
}

export async function fetchFeature(
  projectId: string,
  featureId: string,
): Promise<Feature> {
  const response = await fetch(apiUrl(`/projects/${projectId}/features/${featureId}`), {
    cache: "no-store",
  });
  return parseJson<Feature>(response);
}
