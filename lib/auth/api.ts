import { apiUrl } from "@/lib/config";
import type { AuthResponse, AuthUser } from "@/lib/auth/types";
import { AuthApiError } from "@/lib/auth/types";

async function authFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new AuthApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch(apiUrl("/auth/me"), {
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Failed to load session: ${response.status}`);
  }
  const data = (await response.json()) as AuthResponse;
  return data.user;
}

export async function signup(input: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<AuthUser> {
  const data = await authFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function login(input: {
  username: string;
  password: string;
  rememberMe: boolean;
}): Promise<AuthUser> {
  const data = await authFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await authFetch<void>("/auth/logout", { method: "POST" });
}

export async function confirmUsername(input: {
  username: string;
  displayName?: string;
}): Promise<AuthUser> {
  const data = await authFetch<AuthResponse>("/auth/onboarding/confirm-username", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function updateDisplayName(displayName: string): Promise<AuthUser> {
  const data = await authFetch<AuthResponse>("/settings/account", {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
  return data.user;
}

export async function setOrChangePassword(input: {
  currentPassword?: string;
  newPassword: string;
}): Promise<void> {
  await authFetch<{ ok: boolean }>("/settings/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function disconnectGithub(): Promise<AuthUser> {
  const data = await authFetch<AuthResponse>("/settings/github", {
    method: "DELETE",
  });
  return data.user;
}
