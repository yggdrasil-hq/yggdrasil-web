import type {
  ActionQueueItem,
  Feature,
  Notification,
  Project,
  ProjectOverview,
  Test,
} from "@/lib/features/types";
import { MOCK_PROJECT_ID } from "@/lib/config";

function computeRepositoryRemovalBlockedReason(project: Project): string | null {
  if (project.status === "initializing") {
    return "Finish project initialization before removing repositories.";
  }

  const features = mockFeatures.filter((feature) => feature.projectId === project.id);
  if (features.some((feature) => ["draft", "queued", "running"].includes(feature.status))) {
    return "Wait for active feature runs to finish before removing repositories.";
  }

  if (mockActiveTestRunProjectIds.has(project.id)) {
    return "Wait for active test runs to finish before removing repositories.";
  }

  return null;
}

function withRepositoryRemovalBlockedReason(project: Project): Project {
  return {
    ...project,
    repositoryRemovalBlockedReason: computeRepositoryRemovalBlockedReason(project),
  };
}

const mockActiveTestRunProjectIds = new Set<string>();

export const mockProject: Project = withRepositoryRemovalBlockedReason({
  id: MOCK_PROJECT_ID,
  name: "Acme Web App",
  slug: "acme-web-app",
  description: "Customer dashboard and billing portal for Acme Corp.",
  status: "ready",
  repositories: [
    {
      id: "repo_primary",
      githubOwner: "acme-corp",
      githubRepo: "acme-web",
      isPrimary: true,
    },
  ],
  repositoryRemovalBlockedReason: null,
});

export const mockProjects: Project[] = [mockProject];

const now = Date.now();
const hours = (n: number) => new Date(now - n * 60 * 60 * 1000).toISOString();
const days = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

export const mockFeatures: Feature[] = [
  {
    id: "feat_001",
    projectId: MOCK_PROJECT_ID,
    title: "OAuth login with GitHub",
    slug: "oauth-login-with-github",
    featureType: "normal",
    specExcerpt: "Spec in progress…",
    status: "draft",
    adrMarkdown: null,
    awaitingUserInput: true,
    adrApproved: false,
    branchName: null,
    prUrl: null,
    createdAt: days(5),
    updatedAt: hours(3),
  },
  {
    id: "feat_002",
    projectId: MOCK_PROJECT_ID,
    title: "Project settings page",
    slug: "project-settings-page",
    featureType: "normal",
    specExcerpt: "Settings screen for default model, timeout, and tool allowlist.",
    status: "spec_ready",
    adrMarkdown:
      "# ADR: Project settings page\n\n## Context\n\nProject admins need to configure agent defaults.\n",
    awaitingUserInput: false,
    adrApproved: false,
    branchName: null,
    prUrl: null,
    createdAt: days(2),
    updatedAt: hours(12),
  },
  {
    id: "feat_003",
    projectId: MOCK_PROJECT_ID,
    title: "Stripe webhook handler",
    slug: "stripe-webhook-handler",
    featureType: "normal",
    specExcerpt: "Handle invoice.paid and customer.subscription.updated events.",
    status: "spec_ready",
    adrMarkdown:
      "# ADR: Stripe webhook handler\n\n## Decision\n\nAdd signed webhook endpoint under /api/webhooks/stripe.\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: null,
    prUrl: null,
    createdAt: days(4),
    updatedAt: hours(6),
  },
  {
    id: "feat_004",
    projectId: MOCK_PROJECT_ID,
    title: "Usage metrics dashboard",
    slug: "usage-metrics-dashboard",
    featureType: "normal",
    specExcerpt: "Chart daily active users and API call volume for the last 30 days.",
    status: "running",
    adrMarkdown: "# ADR: Usage metrics dashboard\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/usage-metrics-dashboard-feat_004",
    prUrl: null,
    createdAt: days(1),
    updatedAt: hours(1),
  },
  {
    id: "feat_005",
    projectId: MOCK_PROJECT_ID,
    title: "Export invoices as PDF",
    slug: "export-invoices-as-pdf",
    featureType: "normal",
    specExcerpt: "Add a download button on the invoice detail page.",
    status: "in_review",
    adrMarkdown: "# ADR: Export invoices as PDF\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/export-invoices-as-pdf-feat_005",
    prUrl: "https://github.com/acme-corp/acme-web/pull/42",
    createdAt: days(6),
    updatedAt: hours(2),
  },
  {
    id: "feat_006",
    projectId: MOCK_PROJECT_ID,
    title: "Team invitation flow",
    slug: "team-invitation-flow",
    featureType: "normal",
    specExcerpt: "Invite teammates by email with role selection.",
    status: "changes_requested",
    adrMarkdown: "# ADR: Team invitation flow\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/team-invitation-flow-feat_006",
    prUrl: "https://github.com/acme-corp/acme-web/pull/38",
    createdAt: days(3),
    updatedAt: hours(4),
  },
  {
    id: "feat_007",
    projectId: MOCK_PROJECT_ID,
    title: "API rate limiting middleware",
    slug: "api-rate-limiting-middleware",
    featureType: "normal",
    specExcerpt: "Per-API-key rate limits with 429 responses.",
    status: "merged",
    adrMarkdown: "# ADR: API rate limiting middleware\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/api-rate-limiting-middleware-feat_007",
    prUrl: "https://github.com/acme-corp/acme-web/pull/30",
    createdAt: days(14),
    updatedAt: days(2),
  },
  {
    id: "feat_008",
    projectId: MOCK_PROJECT_ID,
    title: "Realtime log streaming",
    slug: "realtime-log-streaming",
    featureType: "normal",
    specExcerpt: "Stream agent run logs to the web UI over WebSocket.",
    status: "failed",
    adrMarkdown: "# ADR: Realtime log streaming\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/realtime-log-streaming-feat_008",
    prUrl: null,
    createdAt: days(9),
    updatedAt: days(4),
  },
];

export const mockTests: Test[] = [
  {
    id: "test_001",
    projectId: MOCK_PROJECT_ID,
    name: "Auth flow",
    specMarkdown:
      "# Auth flow\n\n## Create user\nSign up with a unique username.\n\n## Log in\nSign in with the new credentials.\n",
    scheduleCron: "0 9 * * *",
    enabled: true,
    lastRunAt: null,
    createdAt: days(3),
    updatedAt: days(1),
  },
];

export const mockOverview: ProjectOverview = {
  counts: {
    planned: 2,
    inProgress: 4,
    completed: 1,
  },
  actionQueue: [
    {
      type: "grill_response_needed",
      featureId: "feat_001",
      title: "OAuth login with GitHub",
      waitingSince: hours(3),
      linkPath: `/projects/${MOCK_PROJECT_ID}/features/feat_001`,
    },
    {
      type: "adr_review",
      featureId: "feat_002",
      title: "Project settings page",
      waitingSince: hours(12),
      linkPath: `/projects/${MOCK_PROJECT_ID}/features/feat_002`,
    },
    {
      type: "start_build",
      featureId: "feat_003",
      title: "Stripe webhook handler",
      waitingSince: hours(6),
      linkPath: `/projects/${MOCK_PROJECT_ID}/features/feat_003`,
    },
    {
      type: "failed_build",
      featureId: "feat_008",
      title: "Realtime log streaming",
      waitingSince: days(4),
      linkPath: `/projects/${MOCK_PROJECT_ID}/features/feat_008`,
    },
  ] satisfies ActionQueueItem[],
};

export const mockNotifications: Notification[] = [
  {
    id: "notif_001",
    projectId: MOCK_PROJECT_ID,
    kind: "build_completed",
    title: "Export invoices as PDF — PR ready for review",
    body: null,
    linkPath: `/projects/${MOCK_PROJECT_ID}/features/feat_005`,
    readAt: null,
    createdAt: hours(2),
  },
  {
    id: "notif_002",
    projectId: MOCK_PROJECT_ID,
    kind: "adr_approved",
    title: "ADR approved: Stripe webhook handler",
    body: "Start build when ready.",
    linkPath: `/projects/${MOCK_PROJECT_ID}/features/feat_003`,
    readAt: hours(1),
    createdAt: hours(6),
  },
];

export function getMockProjects(): Project[] {
  return mockProjects.map(withRepositoryRemovalBlockedReason);
}

export function getMockProject(projectId: string): Project | undefined {
  const project = mockProjects.find((item) => item.id === projectId);
  return project ? withRepositoryRemovalBlockedReason(project) : undefined;
}

export function addMockProject(project: Project): void {
  mockProjects.unshift(project);
}

export function createMockProject(input: {
  name: string;
  description: string;
  repositories: Array<{
    githubOwner: string;
    githubRepo: string;
    isPrimary: boolean;
  }>;
}): { project: Project; initFeature: Feature } {
  const id = `proj_${Date.now()}`;
  const slug = input.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const project: Project = {
    id,
    name: input.name,
    slug,
    description: input.description,
    status: "initializing",
    repositories: input.repositories.map((repo, index) => ({
      id: `repo_${id}_${index}`,
      githubOwner: repo.githubOwner,
      githubRepo: repo.githubRepo,
      isPrimary: repo.isPrimary,
    })),
    repositoryRemovalBlockedReason: null,
  };

  const initFeature: Feature = {
    id: `feat_init_${Date.now()}`,
    projectId: id,
    title: "Project initialization",
    slug: "project-initialization",
    featureType: "project_init",
    specExcerpt: "Spec in progress…",
    status: "draft",
    adrMarkdown: null,
    awaitingUserInput: false,
    adrApproved: false,
    branchName: null,
    prUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  addMockProject(project);
  addMockFeature(initFeature);

  return { project: withRepositoryRemovalBlockedReason(project), initFeature };
}

export function addMockProjectRepository(
  projectId: string,
  input: { githubOwner: string; githubRepo: string },
): Project | undefined {
  const project = mockProjects.find((item) => item.id === projectId);
  if (!project) {
    return undefined;
  }

  const owner = input.githubOwner.trim();
  const repo = input.githubRepo.trim();
  const normalizedOwner = owner.toLowerCase();
  const normalizedRepo = repo.toLowerCase();

  const primary = project.repositories.find((item) => item.isPrimary);
  if (
    primary &&
    primary.githubOwner.toLowerCase() === normalizedOwner &&
    primary.githubRepo.toLowerCase() === normalizedRepo
  ) {
    throw new Error("Primary repository is already linked to this project");
  }

  if (
    project.repositories.some(
      (item) =>
        item.githubOwner.toLowerCase() === normalizedOwner &&
        item.githubRepo.toLowerCase() === normalizedRepo,
    )
  ) {
    throw new Error("Repository is already linked to this project");
  }

  project.repositories.push({
    id: `repo_${projectId}_${Date.now()}`,
    githubOwner: owner,
    githubRepo: repo,
    isPrimary: false,
  });

  return withRepositoryRemovalBlockedReason(project);
}

export function removeMockProjectRepository(
  projectId: string,
  repositoryId: string,
): Project | "not_found" | "primary" | "blocked" {
  const project = mockProjects.find((item) => item.id === projectId);
  if (!project) {
    return "not_found";
  }

  const blockedReason = computeRepositoryRemovalBlockedReason(project);
  if (blockedReason) {
    return "blocked";
  }

  const index = project.repositories.findIndex((item) => item.id === repositoryId);
  if (index === -1) {
    return "not_found";
  }

  if (project.repositories[index]?.isPrimary) {
    return "primary";
  }

  project.repositories.splice(index, 1);
  return withRepositoryRemovalBlockedReason(project);
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

export function addMockFeature(feature: Feature): void {
  mockFeatures.unshift(feature);
  recalculateMockOverview();
}

function recalculateMockOverview(): void {
  mockOverview.counts = { planned: 0, inProgress: 0, completed: 0 };
  for (const feature of mockFeatures) {
    if (feature.status === "draft" || feature.status === "spec_ready") {
      mockOverview.counts.planned += 1;
    } else if (feature.status === "merged" || feature.status === "cancelled") {
      mockOverview.counts.completed += 1;
    } else {
      mockOverview.counts.inProgress += 1;
    }
  }
}

export function updateMockFeature(
  projectId: string,
  featureId: string,
  patch: Partial<Feature>,
): Feature | undefined {
  const index = mockFeatures.findIndex(
    (feature) => feature.projectId === projectId && feature.id === featureId,
  );
  if (index === -1) return undefined;

  mockFeatures[index] = {
    ...mockFeatures[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  recalculateMockOverview();
  return mockFeatures[index];
}

export function getMockTests(projectId: string): Test[] {
  return mockTests.filter((test) => test.projectId === projectId);
}

export function getMockTest(projectId: string, testId: string): Test | undefined {
  return mockTests.find(
    (test) => test.projectId === projectId && test.id === testId,
  );
}

export function addMockTest(test: Test): void {
  mockTests.unshift(test);
}

export function updateMockTest(
  projectId: string,
  testId: string,
  patch: Partial<Test>,
): Test | undefined {
  const index = mockTests.findIndex(
    (test) => test.projectId === projectId && test.id === testId,
  );
  if (index === -1) return undefined;

  mockTests[index] = {
    ...mockTests[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return mockTests[index];
}
