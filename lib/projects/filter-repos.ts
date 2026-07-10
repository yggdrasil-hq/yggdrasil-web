import type { FlattenedRepo } from "@/lib/features/types";

export function filterRepos(repos: FlattenedRepo[], search: string): FlattenedRepo[] {
  const query = search.trim().toLowerCase();
  if (!query) return repos;
  return repos.filter(
    (repo) =>
      repo.fullName.toLowerCase().includes(query) ||
      repo.accountLogin.toLowerCase().includes(query),
  );
}
