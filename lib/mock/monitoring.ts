/**
 * Static placeholder data for the deployments/usage/analytics/infrastructure/
 * allocations pages (ADR 017 — visual parity with design/, static/mock only).
 *
 * These pages have no real backend concept to query yet — see each page's
 * source wireframe design-note under design/ for what's grounded vs. invented
 * (token-usage tracking, session analytics, and live cluster telemetry don't
 * exist anywhere in the API/Orchestrator today). Everything here is fixed,
 * deterministic placeholder content, not fetched from any endpoint — do not
 * wire this up to `lib/api.ts` without first building the real capability.
 *
 * Heatmap cell arrays are generated once via a seeded PRNG (not Math.random
 * at render time) so server and client render identically and hydration
 * never mismatches.
 */

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateHeatmap(seed: number, cells: number): ActivityLevel[] {
  const rand = mulberry32(seed);
  const out: ActivityLevel[] = [];
  for (let i = 0; i < cells; i++) {
    const r = rand();
    if (r < 0.42) out.push(0);
    else if (r < 0.66) out.push(1);
    else if (r < 0.83) out.push(2);
    else if (r < 0.94) out.push(3);
    else out.push(4);
  }
  return out;
}

/** 52 weeks x 7 days, org-level activity (/analytics). */
export const orgActivityHeatmap: ActivityLevel[] = generateHeatmap(42, 364);

/** 52 weeks x 7 days, project-level activity (/projects/:id/analytics). */
export const projectActivityHeatmap: ActivityLevel[] = generateHeatmap(917, 364);

export type JobKind = "feature_build" | "spec_grill" | "test_run" | "design_grill";

export const jobKindMeta: Record<
  JobKind,
  { label: string; colorClass: string; bgClass: string; dotClass: string }
> = {
  feature_build: {
    label: "feature_build",
    colorClass: "text-bifrost",
    bgClass: "bg-bifrost/15",
    dotClass: "bg-bifrost",
  },
  spec_grill: {
    label: "spec_grill",
    colorClass: "text-aurora",
    bgClass: "bg-aurora/15",
    dotClass: "bg-aurora",
  },
  test_run: {
    label: "test_run",
    colorClass: "text-status-input",
    bgClass: "bg-status-input/15",
    dotClass: "bg-status-input",
  },
  design_grill: {
    label: "design_grill",
    colorClass: "text-status-review-agent",
    bgClass: "bg-status-review-agent/15",
    dotClass: "bg-status-review-agent",
  },
};

export interface MockProviderUsage {
  provider: string;
  usedTokens: string;
  limitTokens: string;
  pct: number;
  warn?: boolean;
  projectCount: number;
  resetsInDays: number;
}

export const orgProviderUsage: MockProviderUsage[] = [
  { provider: "OpenRouter", usedTokens: "3.9M", limitTokens: "10M", pct: 39, projectCount: 3, resetsInDays: 22 },
  {
    provider: "Anthropic",
    usedTokens: "2.0M",
    limitTokens: "2.5M",
    pct: 81,
    warn: true,
    projectCount: 2,
    resetsInDays: 18,
  },
  { provider: "OpenAI", usedTokens: "120K", limitTokens: "2M", pct: 6, projectCount: 1, resetsInDays: 9 },
  { provider: "Together AI", usedTokens: "780K", limitTokens: "5.5M", pct: 14, projectCount: 1, resetsInDays: 25 },
];

export const orgDeploymentGroups = [
  {
    projectName: "Marketing Site",
    letter: "M",
    linked: false,
    rows: [
      {
        env: "Production" as const,
        status: "ready" as const,
        url: "marketing-site.apps.acmeretail.com",
        source: "Branch main",
        deployedAt: "Deployed yesterday",
      },
    ],
  },
  {
    projectName: "Internal Ops Console",
    letter: "I",
    linked: false,
    emptyMessage: "Still initializing — no deployments until project_init merges.",
  },
  {
    projectName: "Data Pipeline",
    letter: "D",
    linked: false,
    emptyMessage: "No production deployment configured for this project.",
  },
];

export const orgAnalyticsByProject = [
  { name: "Acme Web App", tokens: "2.1M", pct: 100 },
  { name: "Marketing Site", tokens: "650K", pct: 31 },
  { name: "Data Pipeline", tokens: "380K", pct: 18 },
  { name: "Internal Ops Console", tokens: "120K", pct: 6 },
];

export const orgAnalyticsByUser = [
  { initials: "SC", name: "Sarat Chandra", tokens: "2.4M", pct: 100 },
  { initials: "JE", name: "Jordan Ellis", tokens: "1.8M", pct: 76 },
  { initials: "PN", name: "Priya Nair", tokens: "1.0M", pct: 42 },
  { initials: "MW", name: "Marcus Webb", tokens: "590K", pct: 24 },
  { initials: "AR", name: "Aisha Rahman", tokens: "410K", pct: 17 },
];

export const projectAnalyticsByUser = [
  { initials: "SC", name: "Sarat Chandra", tokens: "1.1M", pct: 100 },
  { initials: "JE", name: "Jordan Ellis", tokens: "700K", pct: 64 },
  { initials: "AR", name: "Aisha Rahman", tokens: "300K", pct: 27 },
];

export const allocationsInfraRows = [
  { letter: "A", name: "Acme Web App", cpu: "2 vCPU", memory: "4 GB", maxConcurrent: "3" },
  { letter: "I", name: "Internal Ops Console", cpu: "1 vCPU", memory: "2 GB", maxConcurrent: "2" },
  { letter: "M", name: "Marketing Site", cpu: "1 vCPU", memory: "2 GB", maxConcurrent: "1" },
  { letter: "D", name: "Data Pipeline", cpu: "2 vCPU", memory: "4 GB", maxConcurrent: "2" },
];

export const allocationsApiRows = [
  {
    letter: "A",
    name: "Acme Web App",
    providers: [
      { name: "OpenRouter", on: true },
      { name: "Anthropic", on: true },
      { name: "OpenAI", on: false },
      { name: "Together AI", on: false },
    ],
    cap: "4M tokens",
  },
  {
    letter: "I",
    name: "Internal Ops Console",
    providers: [
      { name: "OpenRouter", on: true },
      { name: "Anthropic", on: false },
      { name: "OpenAI", on: false },
      { name: "Together AI", on: false },
    ],
    cap: "No cap",
  },
  {
    letter: "M",
    name: "Marketing Site",
    providers: [
      { name: "OpenRouter", on: true },
      { name: "Anthropic", on: true },
      { name: "OpenAI", on: false },
      { name: "Together AI", on: false },
    ],
    cap: "1M tokens",
  },
  {
    letter: "D",
    name: "Data Pipeline",
    providers: [
      { name: "OpenRouter", on: true },
      { name: "Anthropic", on: false },
      { name: "OpenAI", on: false },
      { name: "Together AI", on: true },
    ],
    cap: "No cap",
  },
];
