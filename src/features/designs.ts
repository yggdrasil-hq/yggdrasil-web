import type { Design, DesignSessionSummary, DesignStatus } from "@/lib/features/types";

/**
 * Presentation logic for design browse/history (ADR 020 item 6, issue #2).
 *
 * Kept out of the components on purpose: this repo's vitest runs with
 * `environment: "node"` and has no React testing library, so anything worth
 * asserting has to live in a module like this one.
 */

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  in_progress: "In progress",
  finalized: "Finalized",
};

export function designStatusLabel(status: DesignStatus): string {
  return DESIGN_STATUS_LABELS[status] ?? status;
}

/**
 * A design's status says whether it was ever committed; whether it is being
 * worked on *right now* is the latest session's business. The two must be read
 * together, so the list shows a "session" line whenever the newest session is
 * not a clean completion — otherwise a design whose only session died would
 * read as a serene "In progress" forever.
 */
export function sessionAttentionLabel(
  session: DesignSessionSummary | null,
): string | null {
  if (!session) return null;
  switch (session.status) {
    case "failed":
      return session.lastError
        ? `Last session failed: ${session.lastError}`
        : "Last session failed";
    case "cancelled":
      return "Last session was cancelled";
    case "running":
      return "Session running now";
    case "pending":
      return "Session queued";
    default:
      return null;
  }
}

/** The artifact's home in the repo — the one thing that identifies a design on disk. */
export function designFolderPath(slug: string): string {
  return `designs/${slug}/`;
}

/**
 * Sorted most-recently-touched first. The API already orders this way; sorting
 * here too keeps the view correct regardless of response order (and is what
 * the test pins).
 */
export function sortDesignsByRecency(designs: Design[]): Design[] {
  return [...designs].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

export interface DesignFilters {
  status: DesignStatus | "all";
  query: string;
}

export const DEFAULT_DESIGN_FILTERS: DesignFilters = { status: "all", query: "" };

export function filterDesigns(designs: Design[], filters: DesignFilters): Design[] {
  const query = filters.query.trim().toLowerCase();
  return designs.filter((design) => {
    if (filters.status !== "all" && design.status !== filters.status) return false;
    if (!query) return true;
    return (
      design.name.toLowerCase().includes(query) ||
      design.slug.toLowerCase().includes(query)
    );
  });
}

/** Counts for the filter chips, so an empty result is explainable. */
export function designStatusCounts(designs: Design[]): Record<DesignStatus, number> {
  return {
    in_progress: designs.filter((design) => design.status === "in_progress").length,
    finalized: designs.filter((design) => design.status === "finalized").length,
  };
}

/** Date-only, so a list of designs reads as a timeline rather than a wall of timestamps. */
export function formatDesignDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

export function designRoutePath(projectId: string, designId: string): string {
  return `/projects/${projectId}/designs/${designId}`;
}

/**
 * A live session gets its own reserved segment. The alternative — a bare
 * `/designs/:id` — is genuinely ambiguous, because a design id and a session id
 * are both uuids in the same path position; reserving `sessions` removes the
 * ambiguity by construction rather than by lookup-and-hope.
 */
export function designSessionPath(projectId: string, sessionId: string): string {
  return `/projects/${projectId}/designs/sessions/${sessionId}`;
}

/**
 * Re-opening starts a *new* session, so it goes through the ordinary create
 * form with the existing design pre-filled. The slug is what carries the
 * identity — it selects the same `designs/<slug>/` folder and the same index
 * row (ADR 020 item 2), which is why it must be preserved rather than
 * re-derived from a possibly-edited name.
 */
export function reopenDesignPath(projectId: string, designId: string): string {
  return `/projects/${projectId}/designs/new?reopen=${designId}`;
}
