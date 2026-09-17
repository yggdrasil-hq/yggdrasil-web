/**
 * Static placeholder data for the pages that are still mock-only under ADR 017
 * (deployments, infrastructure, allocations) — visual parity with `design/`,
 * no backend concept behind them yet.
 *
 * The usage/analytics placeholders that used to live here are gone: those pages
 * now render real per-job token accounting (ADR 023). Anything the provider
 * itself owns — a quota limit, a billing-cycle reset — is deliberately not
 * faked anywhere, because Yggdrasil cannot observe it.
 */

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
