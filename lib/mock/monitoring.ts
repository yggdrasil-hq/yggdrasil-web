/**
 * Static placeholder data for the pages that are still mock-only under ADR 017
 * (the organization-level deployments view, and infrastructure) — visual parity
 * with `design/`, no backend concept behind them yet.
 *
 * The usage/analytics placeholders that used to live here are gone: those pages
 * now render real per-job token accounting (ADR 023). The allocation
 * placeholders are gone for the same reason: /allocations/api and
 * /allocations/infra now render and edit real per-project caps (ADR 030).
 * Anything the provider or the cluster itself owns — a provider's billing-cycle
 * reset, live cluster capacity and utilisation — is deliberately not faked
 * anywhere, because nothing in the system observes it.
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
