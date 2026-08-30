"use client";

import { useSearchParams } from "next/navigation";

/**
 * Reads the `?org=` query param used by the org settings pages, falling back
 * to an empty string so pages can decide their own default (e.g. the user's
 * first org) when none is selected.
 */
export function useOrgParam(): string {
  const searchParams = useSearchParams();
  return searchParams.get("org") ?? "";
}