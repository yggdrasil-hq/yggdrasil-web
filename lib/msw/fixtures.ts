import type { Feature, Project } from "@/lib/features/types";
import { MOCK_PROJECT_ID } from "@/lib/config";

export const mockProject: Project = {
  id: MOCK_PROJECT_ID,
  name: "Acme Web App",
  slug: "acme-web-app",
  description: "Customer dashboard and billing portal for Acme Corp.",
};

const now = Date.now();
const hours = (n: number) => new Date(now - n * 60 * 60 * 1000).toISOString();
const days = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

export const mockFeatures: Feature[] = [
  {
    id: "feat_001",
    projectId: MOCK_PROJECT_ID,
    title: "OAuth login with GitHub",
    specExcerpt:
      "Add GitHub OAuth to the login page. Users should land on the project dashboard after auth. Store tokens server-side only.",
    status: "draft",
    createdAt: days(5),
    updatedAt: hours(3),
  },
  {
    id: "feat_002",
    projectId: MOCK_PROJECT_ID,
    title: "Project settings page",
    specExcerpt:
      "Settings screen for default model, timeout, and tool allowlist. Project admins can edit; members read-only.",
    status: "draft",
    createdAt: days(2),
    updatedAt: hours(12),
  },
  {
    id: "feat_003",
    projectId: MOCK_PROJECT_ID,
    title: "Stripe webhook handler",
    specExcerpt:
      "Handle invoice.paid and customer.subscription.updated events. Update billing status in Postgres and send a Slack notification.",
    status: "ready",
    createdAt: days(4),
    updatedAt: hours(6),
  },
  {
    id: "feat_004",
    projectId: MOCK_PROJECT_ID,
    title: "Usage metrics dashboard",
    specExcerpt:
      "Chart daily active users and API call volume for the last 30 days. Use existing analytics tables; no new ingestion pipeline.",
    status: "ready",
    createdAt: days(1),
    updatedAt: hours(1),
  },
  {
    id: "feat_005",
    projectId: MOCK_PROJECT_ID,
    title: "Export invoices as PDF",
    specExcerpt:
      "Add a download button on the invoice detail page. PDF should match the on-screen layout and include company branding.",
    status: "progress",
    createdAt: days(6),
    updatedAt: hours(2),
  },
  {
    id: "feat_006",
    projectId: MOCK_PROJECT_ID,
    title: "Team invitation flow",
    specExcerpt:
      "Invite teammates by email with role selection (admin / member). Invites expire after 7 days; resend supported.",
    status: "input",
    createdAt: days(3),
    updatedAt: hours(4),
  },
  {
    id: "feat_007",
    projectId: MOCK_PROJECT_ID,
    title: "Dark mode toggle",
    specExcerpt:
      "Persist theme preference per user. Respect system default on first visit. Toggle in the account menu.",
    status: "review-agent",
    createdAt: days(7),
    updatedAt: hours(8),
  },
  {
    id: "feat_008",
    projectId: MOCK_PROJECT_ID,
    title: "Notification preferences",
    specExcerpt:
      "Let users choose email vs in-app for run completion, failures, and review requests. Defaults: all in-app, failures email.",
    status: "review",
    createdAt: days(8),
    updatedAt: days(1),
  },
  {
    id: "feat_009",
    projectId: MOCK_PROJECT_ID,
    title: "API rate limiting middleware",
    specExcerpt:
      "Per-API-key rate limits with 429 responses and Retry-After header. Document limits in the public API reference.",
    status: "approved",
    createdAt: days(14),
    updatedAt: days(2),
  },
  {
    id: "feat_010",
    projectId: MOCK_PROJECT_ID,
    title: "Legacy CSV import",
    specExcerpt:
      "One-time import from the old billing CSV format. Validate rows and surface row-level errors before commit.",
    status: "rejected",
    createdAt: days(10),
    updatedAt: days(3),
  },
  {
    id: "feat_011",
    projectId: MOCK_PROJECT_ID,
    title: "Realtime log streaming",
    specExcerpt:
      "Stream agent run logs to the web UI over WebSocket. Buffer last 500 lines for late joiners.",
    status: "failed",
    createdAt: days(9),
    updatedAt: days(4),
  },
];

export function getMockProject(projectId: string): Project | undefined {
  if (projectId === mockProject.id) {
    return mockProject;
  }
  return undefined;
}

export function getMockFeatures(projectId: string): Feature[] {
  return mockFeatures.filter((feature) => feature.projectId === projectId);
}

export function getMockFeature(
  projectId: string,
  featureId: string,
): Feature | undefined {
  return mockFeatures.find(
    (feature) => feature.projectId === projectId && feature.id === featureId,
  );
}
