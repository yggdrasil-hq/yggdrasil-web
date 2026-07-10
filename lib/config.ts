export const MOCK_PROJECT_ID = "proj_acme";

export function apiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${basePath}/api`;
}

/** Server-side fetches (middleware, RSC) — hits API container directly in docker. */
export function internalApiBaseUrl(): string {
  return process.env.API_INTERNAL_URL ?? apiBaseUrl();
}

export function apiUrl(path: string): string {
  const base = apiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function internalApiUrl(path: string): string {
  const base = internalApiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function appPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

/** In-app route for Next.js Link / router (basePath is applied automatically). */
export function appRoute(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/** Strip NEXT_PUBLIC_BASE_PATH from a browser pathname (e.g. ?next= query values). */
export function stripAppBasePath(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!base) return pathname;
  if (pathname === base) return "/";
  if (pathname.startsWith(`${base}/`)) {
    return pathname.slice(base.length) || "/";
  }
  return pathname;
}

export function oauthStartUrl(intent: "login" | "signup" | "link", returnTo?: string): string {
  const params = new URLSearchParams({ intent });
  if (returnTo) {
    params.set("return_to", returnTo);
  }
  return apiUrl(`/auth/github?${params.toString()}`);
}

export function githubInstallStartUrl(input: {
  name: string;
  description?: string;
  returnTo?: string;
  targetId?: number;
}): string {
  const url = new URL(apiUrl("/github/install"), window.location.origin);
  url.searchParams.set("name", input.name);
  if (input.description) {
    url.searchParams.set("description", input.description);
  }
  if (input.returnTo) {
    url.searchParams.set("return_to", input.returnTo);
  }
  if (input.targetId) {
    url.searchParams.set("target_id", String(input.targetId));
  }
  return url.toString();
}
