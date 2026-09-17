import { AGENT_JOB_KIND_LABELS, type AgentJobKind, type JobStatus } from "./types";

/**
 * Pure presentation/aggregation logic for the Usage and Analytics pages
 * (ADR 023). Kept out of the components because this repo's vitest runs in a
 * node environment with no React testing library — anything worth asserting
 * has to live somewhere testable.
 *
 * Everything here is derived from what the API actually measured. Where a
 * figure genuinely cannot be derived, these helpers return null (or a
 * deliberate "not reported" label) rather than a plausible-looking zero.
 */

/**
 * Job kinds a usage row can carry. Wider than `AgentJobKind`: the reporting
 * table is keyed by job kind, so a non-agent kind that ever reports tokens
 * (or an older row) must still render rather than vanish.
 */
export type UsageJobKind = AgentJobKind | "script_test_run" | "deploy" | string;

/**
 * Per-kind presentation, moved out of the old static monitoring mock now that
 * these pages render real rows. Shared with the pages that are still mock-only
 * (infrastructure) so there is exactly one spelling of this mapping.
 */
export interface JobKindMeta {
  label: string;
  colorClass: string;
  bgClass: string;
  dotClass: string;
}

export const JOB_KIND_META: Record<string, JobKindMeta> = {
  feature_build: {
    label: "Feature build",
    colorClass: "text-bifrost",
    bgClass: "bg-bifrost/15",
    dotClass: "bg-bifrost",
  },
  spec_grill: {
    label: "Spec grill",
    colorClass: "text-aurora",
    bgClass: "bg-aurora/15",
    dotClass: "bg-aurora",
  },
  test_run: {
    label: "Tests",
    colorClass: "text-status-input",
    bgClass: "bg-status-input/15",
    dotClass: "bg-status-input",
  },
  agentic_review: {
    label: "Agentic review",
    colorClass: "text-status-review-agent",
    bgClass: "bg-status-review-agent/15",
    dotClass: "bg-status-review-agent",
  },
  design_grill: {
    label: "Design grill",
    colorClass: "text-status-review-agent",
    bgClass: "bg-status-review-agent/15",
    dotClass: "bg-status-review-agent",
  },
};

/** Falls back to the raw kind so an unrecognised row is still legible. */
export function jobKindMeta(kind: UsageJobKind): JobKindMeta {
  const known = JOB_KIND_META[kind];
  if (known) {
    return known;
  }
  const agentLabel = (AGENT_JOB_KIND_LABELS as Record<string, string>)[kind];
  return {
    label: agentLabel ?? kind,
    colorClass: "text-mist",
    bgClass: "bg-surface-03",
    dotClass: "bg-mist",
  };
}

/**
 * Compact token counts. One decimal place is enough to read a magnitude
 * without implying precision the provider never reported.
 */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return "0";
  }
  if (tokens >= 1_000_000_000) {
    return `${trimDecimal(tokens / 1_000_000_000)}B`;
  }
  if (tokens >= 1_000_000) {
    return `${trimDecimal(tokens / 1_000_000)}M`;
  }
  if (tokens >= 1_000) {
    return `${trimDecimal(tokens / 1_000)}K`;
  }
  return String(Math.round(tokens));
}

function trimDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * A provider-reported cost, or an explicit "not reported" — never `$0.00` for
 * a figure nobody supplied. A genuine zero (a free model) does render as
 * `$0.00`, because that is a real measurement.
 */
export function formatCost(costUsd: number | null): string {
  if (costUsd === null || !Number.isFinite(costUsd)) {
    return "Not reported";
  }
  if (costUsd > 0 && costUsd < 0.005) {
    return "< $0.01";
  }
  return `$${costUsd.toFixed(2)}`;
}

/** Agent working time, coarse enough to read at a glance. */
export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "Not reported";
  }
  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

/**
 * Share of a whole, 0-100. Returns 0 for an empty whole rather than NaN —
 * there is no meaningful share of nothing.
 */
export function sharePercent(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return 0;
  }
  return Math.round((part / whole) * 100);
}

/**
 * Period-over-period change, or null when there is no previous period to
 * compare against. A previous total of zero has no percentage change (it grew
 * from nothing), and claiming "+100%" there would be an invented figure.
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

/** A dated activity cell from the API; days with no usage are simply absent. */
export interface ActivityDay {
  date: string;
  sessions: number;
  tokens: number;
}

export interface ActivityHeatmap {
  /** Column-major (week × day) counts, oldest first — matches the grid's `gridAutoFlow: column`. */
  cells: number[];
  /** Highest single day's session count, for the legend's scale. */
  maxSessions: number;
  /** Total sessions across the whole span. */
  totalSessions: number;
}

const DAY_MS = 86_400_000;
/** 52 weeks × 7 days, matching the design's GitHub-contribution-graph shape. */
export const HEATMAP_DAYS = 364;

/**
 * Builds the 52-week activity grid from the API's sparse per-day counts.
 *
 * The grid has to be *filled* because the API only returns days that saw
 * usage, and it is aligned so each column is a calendar week running
 * Sunday→Saturday — which is why the span ends on the Saturday of the current
 * week rather than on today: otherwise every column would drift as the week
 * progressed.
 *
 * `today` is a parameter (not `new Date()`) so this is deterministic under
 * test, and all date maths is UTC so a server and a client in different
 * timezones produce identical grids and hydration cannot mismatch.
 */
export function buildActivityHeatmap(
  activity: ActivityDay[],
  today: Date = new Date(),
): ActivityHeatmap {
  const byDate = new Map<string, number>();
  for (const day of activity) {
    byDate.set(day.date, (byDate.get(day.date) ?? 0) + day.sessions);
  }

  // Sunday of the week containing `today`, then forward to that week's
  // Saturday — the last cell of the final column.
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const weekday = new Date(todayUtc).getUTCDay();
  const end = todayUtc + (6 - weekday) * DAY_MS;
  const start = end - (HEATMAP_DAYS - 1) * DAY_MS;

  const cells: number[] = [];
  let maxSessions = 0;
  let totalSessions = 0;
  for (let offset = 0; offset < HEATMAP_DAYS; offset++) {
    const date = new Date(start + offset * DAY_MS).toISOString().slice(0, 10);
    const sessions = byDate.get(date) ?? 0;
    cells.push(sessions);
    totalSessions += sessions;
    if (sessions > maxSessions) {
      maxSessions = sessions;
    }
  }

  return { cells, maxSessions, totalSessions };
}

/**
 * Maps a day's session count onto the 5-step intensity scale. Empty days are
 * always level 0; every non-empty day gets at least level 1, so a day with a
 * single session never renders as blank — the whole point of the graph is to
 * show that something happened.
 */
export function activityLevel(sessions: number, maxSessions: number): 0 | 1 | 2 | 3 | 4 {
  if (sessions <= 0) {
    return 0;
  }
  if (maxSessions <= 0) {
    return 1;
  }
  const scaled = Math.ceil((sessions / maxSessions) * 4);
  return Math.min(4, Math.max(1, scaled)) as 1 | 2 | 3 | 4;
}

export const ACTIVITY_LEVEL_CLASS = [
  "bg-surface-02",
  "bg-bifrost/25",
  "bg-bifrost/45",
  "bg-bifrost/70",
  "bg-bifrost",
] as const;

/**
 * Where a session row links to, or null when there is nowhere useful to go.
 * Feature sessions point at the bare feature route, which redirects to that
 * feature's current stage — the same entry point every other surface uses.
 */
export function sessionHref(input: {
  projectId: string;
  featureId: string | null;
  testId: string | null;
}): string | null {
  if (input.featureId) {
    return `/projects/${input.projectId}/features/${input.featureId}`;
  }
  if (input.testId) {
    return `/projects/${input.projectId}/tests/${input.testId}`;
  }
  return null;
}

export function sessionStatusMeta(status: JobStatus | string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "running":
      return { label: "Running", className: "text-aurora" };
    case "pending":
      return { label: "Queued", className: "text-mist" };
    case "failed":
      return { label: "Failed", className: "text-status-rejected" };
    case "cancelled":
      return { label: "Cancelled", className: "text-mist" };
    case "completed":
      return { label: "Completed", className: "text-status-approved" };
    default:
      return { label: status, className: "text-mist" };
  }
}

/**
 * A label for a provider bucket. Custom-triplet tiers are pointed at a
 * bring-your-own endpoint that no catalog row describes, so the provider is
 * genuinely unknown there and is shown as such rather than as a blank cell.
 */
export function providerLabel(providerName: string | null): string {
  return providerName ?? "Custom endpoint";
}

/** A model bucket's label; `null` means the job ran without a resolved model. */
export function modelLabel(modelId: string | null, providerName: string | null): string {
  if (modelId && providerName) {
    return `${modelId} · ${providerName}`;
  }
  return modelId ?? providerName ?? "Unknown model";
}
