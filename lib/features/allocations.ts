import type { ProjectResourceQuota, TokenCapState } from "./types";

/**
 * ADR 030's presentation logic, kept pure and out of the components.
 *
 * This repo's vitest runs in node with no React testing library (by design), so
 * every decision a component makes has to live somewhere testable — here. What
 * remains in the components is JSX wiring.
 */

/** How close a project is to its cap, as a state a page can render. */
export type CapStatus = "uncapped" | "ok" | "approaching" | "exceeded";

/**
 * The share of a cap that counts as "approaching". Deliberately a plain
 * constant rather than a per-cap setting: it is a presentation threshold, not an
 * enforcement mode, and ADR 030 §7 explains why no warn-vs-block setting exists
 * to go with it.
 */
export const APPROACHING_THRESHOLD_PERCENT = 80;

/**
 * Percent of the cap consumed, or null when there is no cap to measure against.
 *
 * Not clamped at 100: an overshoot is a real and interesting state (it means
 * work ran past the cap before enforcement could stop the next job), and hiding
 * it behind "100%" would make the page look tidier than the truth.
 */
export function capPercent(state: TokenCapState): number | null {
  if (state.cap === null || state.cap === 0) {
    // A zero cap has no meaningful percentage — everything is over it, always.
    return state.cap === 0 ? 100 : null;
  }
  return (state.usedTokens / state.cap) * 100;
}

export function capStatus(state: TokenCapState): CapStatus {
  if (state.exceeded) return "exceeded";
  if (state.cap === null) return "uncapped";
  const percent = capPercent(state) ?? 0;
  return percent >= APPROACHING_THRESHOLD_PERCENT ? "approaching" : "ok";
}

/** Short label for a project's cap column, in the shape the design mock shows ("4M tokens"). */
export function formatTokenCap(cap: number | null): string {
  if (cap === null) return "Uncapped";
  if (cap === 0) return "No further work";
  if (cap >= 1_000_000) {
    const millions = cap / 1_000_000;
    // Trim a trailing .0 so "4M tokens" reads like the mock rather than "4.0M".
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M tokens`;
  }
  if (cap >= 1_000) {
    const thousands = cap / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K tokens`;
  }
  return `${cap} tokens`;
}

/** e.g. "September 2026" — the period a cap is enforced over, in UTC. */
export function formatPeriod(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A one-line explanation of a project's standing, used as the row's hint. This
 * is the text a blocked developer reads, so it says what happened and what to
 * do about it rather than restating the numbers.
 */
export function capSummary(state: TokenCapState): string {
  switch (capStatus(state)) {
    case "uncapped":
      return "No monthly cap — this project may draw freely from the organization's providers.";
    case "exceeded":
      return `At the cap: ${formatTokensCompact(state.usedTokens)} of ${formatTokensCompact(
        state.cap ?? 0,
      )} used. New agent work is blocked until the cap is raised, cleared, or the period rolls over.`;
    case "approaching":
      return `${formatTokensCompact(state.usedTokens)} of ${formatTokensCompact(
        state.cap ?? 0,
      )} used — approaching the cap.`;
    default:
      return `${formatTokensCompact(state.usedTokens)} of ${formatTokensCompact(
        state.cap ?? 0,
      )} used this period.`;
  }
}

/** Compact token counts for dense table cells. */
export function formatTokensCompact(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 100_000 ? 0 : 1)}K`;
  return String(tokens);
}

// --- Resource quota: human units <-> the API's normalized units ---
//
// The API stores millicores and MiB so the wire format is exact and type-safe.
// Admins, though, think in vCPU and GiB, and the design mock shows exactly that
// ("2 vCPU", "4 GB"). These conversions are the seam, and they round rather
// than truncate so an entered value never comes back smaller than it looked.

export function vcpuToMillicores(vcpu: number): number {
  return Math.round(vcpu * 1000);
}

export function millicoresToVcpu(millicores: number): number {
  return millicores / 1000;
}

export function gibToMib(gib: number): number {
  return Math.round(gib * 1024);
}

export function mibToGib(mib: number): number {
  return mib / 1024;
}

/** e.g. "2 vCPU", "0.5 vCPU" — trimming a trailing .0 so whole values read cleanly. */
export function formatCpu(millicores: number): string {
  const vcpu = millicoresToVcpu(millicores);
  return `${Number.isInteger(vcpu) ? vcpu : Number(vcpu.toFixed(2))} vCPU`;
}

/** e.g. "4 GiB". GiB rather than the mock's looser "GB" because that is the unit actually stored. */
export function formatMemory(mib: number): string {
  const gib = mibToGib(mib);
  return `${Number.isInteger(gib) ? gib : Number(gib.toFixed(2))} GiB`;
}

/** "2 vCPU · 4 GiB · 6 pods" — the quota in one cell. */
export function formatQuotaSummary(quota: ProjectResourceQuota): string {
  return `${formatCpu(quota.cpuMillicores)} · ${formatMemory(quota.memoryMib)} · ${quota.pods} pods`;
}

/**
 * Whether these values are worth sending. Mirrors the API's own schema bounds so
 * an obviously-invalid edit is caught in the form rather than as a 400.
 *
 * The floor is not arbitrary: a namespace that cannot hold the project's own
 * primary deployment would fail every job in it at admission, with nothing on
 * screen linking that failure back to this input.
 */
export function validateQuotaInput(input: {
  vcpu: number;
  gib: number;
  pods: number;
}): string | null {
  if (!Number.isFinite(input.vcpu) || input.vcpu <= 0) {
    return "CPU limit must be greater than zero.";
  }
  if (!Number.isFinite(input.gib) || input.gib <= 0) {
    return "Memory limit must be greater than zero.";
  }
  if (!Number.isInteger(input.pods) || input.pods < 1) {
    return "Max pods must be a whole number of at least 1.";
  }
  const millicores = vcpuToMillicores(input.vcpu);
  if (millicores < 100 || millicores > 1_000_000) {
    return "CPU limit must be between 0.1 and 1000 vCPU.";
  }
  const mib = gibToMib(input.gib);
  if (mib < 128 || mib > 1_048_576) {
    return "Memory limit must be between 0.125 and 1024 GiB.";
  }
  if (input.pods > 1000) {
    return "Max pods must be 1000 or fewer.";
  }
  return null;
}

/**
 * Whether a project's quota is an override or the platform default, phrased for
 * the table — the mock's copy promises this distinction ("Projects without an
 * explicit override fall back to..."), so the page has to actually show it.
 */
export function quotaSourceLabel(quota: ProjectResourceQuota): string {
  return quota.fromOverride ? "Project override" : "Platform default";
}
