import type { TestingResults } from "./types";

/** Whether a completed report has any failures. */
export function hasTestingFailures(results: TestingResults): boolean {
  return results.runs.some((run) => (run.report?.failed ?? 0) > 0);
}

export function formatDuration(durationMs: number): string {
  if (durationMs >= 60_000) {
    return `${Math.round(durationMs / 60_000)}m`;
  }
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  return `${durationMs}ms`;
}