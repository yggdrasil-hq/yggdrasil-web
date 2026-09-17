import type { JobPreview, PreviewStatus } from "./types";

/**
 * ADR 003 §15: presentation logic for a project's ephemeral preview
 * deployments, kept out of the component so it can be unit-tested — this
 * repo's vitest runs with `environment: "node"` and has no React testing
 * library, so anything with a branch worth verifying belongs in a module like
 * this one rather than in JSX.
 *
 * The central rule here is that a preview is only worth linking to while it is
 * `active`. A torn-down host is a dead link, and a failed one never existed —
 * showing either as a clickable URL is worse than showing nothing, because the
 * user has no way to tell a broken preview from a broken app.
 */

/** Whether a preview currently has something serving at its host. */
export function isPreviewLive(preview: Pick<JobPreview, "status">): boolean {
  return preview.status === "active";
}

/**
 * The URL to offer for a preview, or null when there is nothing to link to.
 *
 * The stored value is a bare hostname (the Orchestrator computes preview
 * identity and reports it verbatim), so the scheme is added here rather than
 * baked into the row.
 */
export function previewUrl(preview: Pick<JobPreview, "host" | "status">): string | null {
  if (!isPreviewLive(preview)) return null;
  return `https://${preview.host}`;
}

/** The hostname without its scheme, for display beside a link. */
export function previewHostLabel(preview: Pick<JobPreview, "host">): string {
  return preview.host;
}

export interface PreviewSummary {
  /** Live previews, newest first — the ones actually worth surfacing. */
  live: JobPreview[];
  /** Everything the project has record of, for a history-style list. */
  ended: JobPreview[];
  /** A short human sentence describing what the page is showing. */
  headline: string;
}

/**
 * Splits a project's previews into live and ended, newest first.
 *
 * `ended` deliberately covers both clean teardowns and failures: they are both
 * "no longer running", and the difference is already carried per-row by the
 * status label, so inventing a third bucket would only make the empty state
 * harder to read.
 */
export function summarizePreviews(previews: JobPreview[]): PreviewSummary {
  const ordered = [...previews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const live = ordered.filter(isPreviewLive);
  const ended = ordered.filter((preview) => !isPreviewLive(preview));

  return {
    live,
    ended,
    headline:
      live.length === 0
        ? "No preview is running for this project right now."
        : live.length === 1
          ? "1 preview is live."
          : `${live.length} previews are live.`,
  };
}

const STATUS_LABELS: Record<PreviewStatus, string> = {
  active: "Live",
  torn_down: "Ended",
  failed: "Failed",
};

export function previewStatusLabel(status: PreviewStatus): string {
  return STATUS_LABELS[status];
}

/**
 * One sentence explaining a preview's state.
 *
 * A failure explains itself from `lastError` when the API recorded one, because
 * "Failed" alone gives the user nothing to act on — the usual causes (a chart
 * that does not deploy, an unreachable cluster) are stated in that string.
 */
export function describePreview(preview: JobPreview): string {
  if (preview.status === "failed") {
    return preview.lastError
      ? `Preview failed to start: ${preview.lastError}`
      : "Preview failed to start.";
  }
  if (preview.status === "torn_down") {
    return "Preview ended when its job finished.";
  }
  return "Live preview of this run's environment.";
}

/**
 * What the Preview row on the deployments page should say (ADR 017 keeps that
 * page's rows aligned with `design/`'s route map, so the row exists whether or
 * not anything is live — an empty state, not an absent row).
 *
 * The count is of live previews only: a project with five ended previews has
 * nothing running, and reporting "5 previews" beside a Preview badge would
 * claim otherwise.
 */
export function previewRowSummary(summary: PreviewSummary): string {
  if (summary.live.length === 0) {
    return "No preview is running. A preview appears here while a build, test run or grill session is in flight.";
  }
  return summary.live.length === 1
    ? "1 live preview for a running job."
    : `${summary.live.length} live previews for running jobs.`;
}
