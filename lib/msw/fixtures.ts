import type {
  ActionQueueItem,
  AgenticReview,
  DeployStatus,
  DesignEventsResponse,
  DesignSession,
  Feature,
  FeatureEvent,
  FeatureEventsResponse,
  JobStatus,
  Notification,
  Project,
  ProjectOverview,
  ProjectSecretMetadata,
  TestingResults,
  Test,
} from "@/lib/features/types";
import type { ActionItem } from "@/lib/api";
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

const now = Date.now();
const hours = (n: number) => new Date(now - n * 60 * 60 * 1000).toISOString();
const days = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

// Declared before mockProject (not just before mockFeatures' own usages
// below): mockProject's initializer eagerly calls
// withRepositoryRemovalBlockedReason -> computeRepositoryRemovalBlockedReason,
// which reads mockFeatures at module-evaluation time, not lazily — so
// mockFeatures has to already be initialized by the time mockProject's
// `const` initializer runs, or that read hits the temporal dead zone.
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
    status: "returned",
    adrMarkdown: "# ADR: Team invitation flow\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/team-invitation-flow-feat_006",
    prUrl: "https://github.com/acme-corp/acme-web/pull/38",
    returnReason: "human_review",
    returnComment:
      "Please show the invited member's role in the invitation email subject line.",
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
  {
    id: "feat_009",
    projectId: MOCK_PROJECT_ID,
    title: "Webhook retry queue",
    slug: "webhook-retry-queue",
    featureType: "normal",
    specExcerpt: "Retry failed webhooks with exponential backoff.",
    status: "testing",
    adrMarkdown: "# ADR: Webhook retry queue\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/webhook-retry-queue-feat_009",
    prUrl: null,
    createdAt: hours(10),
    updatedAt: hours(1),
  },
  {
    id: "feat_010",
    projectId: MOCK_PROJECT_ID,
    title: "Customer CSV export",
    slug: "customer-csv-export",
    featureType: "normal",
    specExcerpt: "Export the customer list to CSV with column selection.",
    status: "agentic_review",
    adrMarkdown: "# ADR: Customer CSV export\n",
    awaitingUserInput: false,
    adrApproved: true,
    branchName: "yggdrasil/customer-csv-export-feat_010",
    prUrl: null,
    createdAt: hours(20),
    updatedAt: hours(2),
  },
];

export const mockProject: Project = withRepositoryRemovalBlockedReason({
  id: MOCK_PROJECT_ID,
  name: "Acme Web App",
  slug: "acme-web-app",
  description: "Customer dashboard and billing portal for Acme Corp.",
  status: "ready",
  installationId: "inst_mock_acme",
  githubAccessWarning: false,
  modelConfigWarning: false,
  agenticReviewEnabled: true,
  hasDesignSurface: true,
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

export const mockInstallations = [
  {
    id: "inst_mock_acme",
    accountType: "Organization" as const,
    accountLogin: "acme-corp",
    githubInstallationId: 12345,
  },
];

export const mockInstallationRepos = [
  {
    fullName: "acme-corp/acme-web",
    githubOwner: "acme-corp",
    githubRepo: "acme-web",
  },
  {
    fullName: "acme-corp/acme-api",
    githubOwner: "acme-corp",
    githubRepo: "acme-api",
  },
];

// feat_001 is the only "draft" feature in mockFeatures — a running grill
// with one pending ask_user question, matching its awaitingUserInput: true.
export const mockJobEvents: Record<string, FeatureEvent[]> = {
  feat_001: [
    {
      id: "jobevent_001",
      type: "ask_user",
      question:
        "Should GitHub OAuth support linking to an existing email/password account, or always create a new user?",
      markdown: null,
      message: null,
      status: null,
      prUrl: null,
      summary: null,
      snapshot: null,
      createdAt: hours(3),
    },
  ],
};

export const mockJobStatuses: Record<string, JobStatus> = {
  feat_001: "running",
};

export const mockLastErrors: Record<string, string> = {};

export const mockDesignSessions: Record<string, DesignSession> = {};
export const mockDesignEvents: Record<string, FeatureEvent[]> = {};

export function createMockDesignSession(
  projectId: string,
  input: { name: string; description: string; slug?: string },
): DesignSession | null {
  if (!getMockProject(projectId)?.hasDesignSurface) return null;
  const id = `design_${Date.now()}`;
  const slug = input.slug ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const session: DesignSession = {
    id,
    name: input.name,
    slug,
    description: input.description,
    status: "running",
    createdAt: new Date().toISOString(),
  };
  mockDesignSessions[id] = session;
  mockDesignEvents[id] = [{
    id: `design_event_${Date.now()}`,
    type: "ask_user",
    question: "What should the primary interaction feel like?",
    markdown: null,
    message: null,
    status: null,
    prUrl: null,
    summary: null,
    snapshot: null,
    createdAt: new Date().toISOString(),
  }];
  return session;
}

export function getMockDesignEvents(
  projectId: string,
  sessionId: string,
): DesignEventsResponse | null {
  const project = getMockProject(projectId);
  const session = mockDesignSessions[sessionId];
  if (!project || !session) return null;
  return {
    session,
    jobStatus: session.status,
    lastError: null,
    events: mockDesignEvents[sessionId] ?? [],
  };
}

export function addMockDesignReply(sessionId: string, content: string): void {
  const session = mockDesignSessions[sessionId];
  if (!session) return;
  const now = new Date().toISOString();
  mockDesignEvents[sessionId]?.push(
    {
      id: `design_event_${Date.now()}`,
      type: "user_message",
      question: null,
      markdown: null,
      message: content,
      status: null,
      prUrl: null,
      summary: null,
      snapshot: null,
      createdAt: now,
    },
    {
      id: `design_event_${Date.now() + 1}`,
      type: "update_design_preview",
      question: null,
      markdown: null,
      message: null,
      status: null,
      prUrl: null,
      summary: null,
      snapshot: {
        "page.html": `<main style="font: 18px system-ui; padding: 3rem"><h1>${content}</h1><button>Continue</button></main>`,
      },
      createdAt: now,
    },
  );
}

// Keyed by projectId (deploy jobs carry no featureId — they're project-level).
export const mockDeployStatuses: Record<string, DeployStatus> = {};

// Mirrors config.appsBaseDomain's dev default (api/src/config.ts) — this
// mock never talks to a real API, so it's hardcoded rather than read from
// an env var.
const MOCK_APPS_BASE_DOMAIN = "yggdrasil.local";

function mockDeployUrl(projectId: string): string {
  const slug = getMockProject(projectId)?.slug ?? projectId;
  return `https://${slug}.apps.${MOCK_APPS_BASE_DOMAIN}`;
}

export function getMockDeployStatus(projectId: string): DeployStatus {
  return (
    mockDeployStatuses[projectId] ?? {
      status: null,
      lastError: null,
      startedAt: null,
      completedAt: null,
      url: mockDeployUrl(projectId),
    }
  );
}

export type TriggerMockDeployResult = "ok" | "not_found" | "not_ready" | "in_progress";

/** Mirrors the real POST /:projectId/deploy's preconditions, and — like addMockFeatureReply — simulates the deploy completing right away, good enough for exercising the UI without a real Orchestrator. */
export function triggerMockDeploy(projectId: string): TriggerMockDeployResult {
  const project = getMockProject(projectId);
  if (!project) return "not_found";
  if (project.status !== "ready") return "not_ready";
  const current = mockDeployStatuses[projectId];
  if (current?.status === "pending" || current?.status === "running") return "in_progress";

  const now = new Date().toISOString();
  mockDeployStatuses[projectId] = {
    status: "completed",
    lastError: null,
    startedAt: now,
    completedAt: now,
    url: mockDeployUrl(projectId),
  };
  return "ok";
}

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
    planned: 3,
    inProgress: 6,
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
  modelConfig?: { modelBaseUrl: string; modelApiKey: string; modelId: string };
  saveModelConfigAsDefault?: boolean;
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
    installationId: "inst_mock_acme",
    githubAccessWarning: false,
    modelConfigWarning: false,
    agenticReviewEnabled: true,
    hasDesignSurface: true,
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

  if (input.modelConfig) {
    upsertMockSecret(project.id, "MODEL_BASE_URL", input.modelConfig.modelBaseUrl);
    upsertMockSecret(project.id, "MODEL_API_KEY", input.modelConfig.modelApiKey);
    upsertMockSecret(project.id, "MODEL_ID", input.modelConfig.modelId);

    if (input.saveModelConfigAsDefault) {
      upsertMockUserSecret("MODEL_BASE_URL", input.modelConfig.modelBaseUrl);
      upsertMockUserSecret("MODEL_API_KEY", input.modelConfig.modelApiKey);
      upsertMockUserSecret("MODEL_ID", input.modelConfig.modelId);
    }
  }

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

// --- Feature Action Items (ADR 015 item 4-6 / Track B2) ---

const mockActionItems: Record<string, ActionItem[]> = {
  // feat_003 is spec_ready + adrApproved — keep an open secret_request and a
  // manually-resolvable test_request so the "Start build" gate is visible.
  feat_003: [
    {
      id: "ai_001",
      type: "secret_request",
      description: "Add STRIPE_SECRET_KEY to the project secrets.",
      status: "open",
      resolvedAt: null,
      secretKey: "STRIPE_SECRET_KEY",
      subtaskFeatureId: null,
      draftTestMarkdown: null,
      createdAt: hours(6),
    },
    {
      id: "ai_002",
      type: "test_request",
      description: "Add a webhook-handling test for signed payloads.",
      status: "open",
      resolvedAt: null,
      secretKey: null,
      subtaskFeatureId: null,
      draftTestMarkdown:
        "# Webhook signing\n\n\n## Signed payload\n\n\nPOST /api/webhooks/stripe rejects unsigned payloads.",
      createdAt: hours(6),
    },
    {
      id: "ai_003",
      type: "design_grill",
      description: "Move the webhook retry UI into a design session.",
      status: "resolved",
      resolvedAt: hours(2),
      secretKey: null,
      subtaskFeatureId: null,
      draftTestMarkdown: null,
      createdAt: hours(6),
    },
  ],
};

export function getMockActionItems(
  projectId: string,
  featureId: string,
): ActionItem[] {
  void projectId;
  return mockActionItems[featureId] ?? [];
}

export function resolveMockActionItem(
  projectId: string,
  featureId: string,
  itemId: string,
): boolean {
  void projectId;
  const item = mockActionItems[featureId]?.find((it) => it.id === itemId);
  if (!item || item.status !== "open") return false;
  item.status = "resolved";
  item.resolvedAt = new Date().toISOString();
  return true;
}

export function autoResolveMockActionItems(
  projectId: string,
  featureId: string,
): { resolved: number; remainingOpen: number } {
  void projectId;
  const items = mockActionItems[featureId] ?? [];
  let resolved = 0;
  for (const item of items) {
    if (item.status !== "open") continue;
    if (item.type === "secret_request") {
      item.status = "resolved";
      item.resolvedAt = new Date().toISOString();
      resolved += 1;
    }
  }
  const remainingOpen = items.filter((it) => it.status === "open").length;
  return { resolved, remainingOpen };
}

// --- Testing stage results (ADR 015 items 9-11 / B4-B5) ---

const mockTestReports: Record<string, TestingResults> = {
  // feat_009 (status: testing) has a passing report by default.
  feat_009: {
    featureId: "feat_009",
    status: "testing",
    runs: [{
      jobId: "job_test_009",
      testId: "test_009",
      testGroup: null,
      status: "completed",
      report: {
        passed: 2,
        failed: 0,
        skipped: 0,
        total: 2,
        coveragePercent: 78,
        failingTests: [],
        summary: "All test scenarios passed.",
        recordingPath: null,
        createdAt: new Date().toISOString(),
      },
      steps: [
        {
          name: "Retry delivery regression suite",
          status: "pass",
          details: null,
          screenshotPath: null,
          createdAt: new Date().toISOString(),
        },
        {
          name: "Signed payload acceptance",
          status: "pass",
          details: null,
          screenshotPath: null,
          createdAt: new Date().toISOString(),
        },
      ],
    }],
  },
};

export function getMockTestingResults(
  projectId: string,
  featureId: string,
): TestingResults | null {
  void projectId;
  return mockTestReports[featureId] ?? null;
}

// --- Agentic Review results (ADR 015 items 13-16 / B6) ---

const mockAgenticReviews: Record<string, AgenticReview> = {
  // feat_010 (status: agentic_review) defaults to a changes_requested verdict.
  feat_010: {
    featureId: "feat_010",
    verdict: "changes_requested",
    comment: "1 blocking finding — sent back to implementation.",
    findings: [
      {
        location: "lib/export-csv.ts:18",
        note:
          "Column selection doesn't validate against the customer schema before emitting the header row — will produce malformed CSV for unknown columns.",
        blocking: true,
      },
      {
        location: "app/customers/export.tsx:42",
        note: "Nit: consider memoizing the column picker — not blocking.",
        blocking: false,
      },
    ],
  },
};

export function getMockAgenticReview(
  projectId: string,
  featureId: string,
): AgenticReview | null {
  void projectId;
  return mockAgenticReviews[featureId] ?? null;
}

// --- Resume implementation (ADR 015 item 18 / B7) ---

export function resumeMockFeature(
  projectId: string,
  featureId: string,
): boolean {
  const feature = getMockFeature(projectId, featureId);
  if (!feature || feature.status !== "returned") return false;
  updateMockFeature(projectId, featureId, { status: "queued" });
  return true;
}

export function getMockFeatureEvents(featureId: string): FeatureEventsResponse {
  return {
    jobStatus: mockJobStatuses[featureId] ?? null,
    lastError: mockLastErrors[featureId] ?? null,
    events: mockJobEvents[featureId] ?? [],
  };
}

/** Simulates a grill session completing right after a reply — good enough for exercising the UI end-to-end without a real Orchestrator. */
export function addMockFeatureReply(projectId: string, featureId: string, content: string): void {
  const events = mockJobEvents[featureId] ?? (mockJobEvents[featureId] = []);
  const adrMarkdown = `# ADR: mock reply\n\nGenerated after your reply: "${content}"\n`;
  events.push({
    id: `jobevent_${Date.now()}`,
    type: "submit_adr",
    question: null,
    markdown: adrMarkdown,
    message: null,
    status: null,
    prUrl: null,
    summary: null,
    snapshot: null,
    createdAt: new Date().toISOString(),
  });
  mockJobStatuses[featureId] = "completed";
  updateMockFeature(projectId, featureId, {
    status: "spec_ready",
    adrMarkdown,
    awaitingUserInput: false,
  });
}

export function cancelMockFeatureGrill(projectId: string, featureId: string): boolean {
  if (mockJobStatuses[featureId] !== "running") {
    return false;
  }
  const events = mockJobEvents[featureId] ?? (mockJobEvents[featureId] = []);
  events.push({
    id: `jobevent_${Date.now()}`,
    type: "run_cancelled",
    question: null,
    markdown: null,
    message: "job cancelled",
    status: null,
    prUrl: null,
    summary: null,
    snapshot: null,
    createdAt: new Date().toISOString(),
  });
  mockJobStatuses[featureId] = "cancelled";
  updateMockFeature(projectId, featureId, { awaitingUserInput: false });
  return true;
}

export type RetryMockFeatureGrillResult =
  | "ok"
  | "not_found"
  | "not_retryable"
  | "active_job"
  | "no_model_config";

/** Mirrors the real retry-grill endpoint's preconditions (ADR 007, ADR 012). */
export function retryMockFeatureGrill(
  projectId: string,
  featureId: string,
): RetryMockFeatureGrillResult {
  const feature = getMockFeature(projectId, featureId);
  if (!feature) return "not_found";
  if (feature.status !== "draft" && feature.status !== "failed") return "not_retryable";
  if (mockJobStatuses[featureId] === "running") return "active_job";
  if (!isMockModelConfigResolvable(projectId)) return "no_model_config";

  delete mockJobEvents[featureId];
  delete mockLastErrors[featureId];
  mockJobStatuses[featureId] = "pending";
  updateMockFeature(projectId, featureId, { status: "draft", awaitingUserInput: false });
  return "ok";
}

interface MockSecret {
  id: string;
  projectId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

// Plaintext `value` never leaves this module — handlers only ever return the
// metadata shape, matching the real API's project_secrets encryption boundary.
export const mockSecrets: MockSecret[] = [];

function toSecretMetadata(secret: MockSecret): ProjectSecretMetadata {
  return {
    id: secret.id,
    key: secret.key,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}

export function getMockSecrets(projectId: string): ProjectSecretMetadata[] {
  return mockSecrets
    .filter((secret) => secret.projectId === projectId)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(toSecretMetadata);
}

export function upsertMockSecret(
  projectId: string,
  key: string,
  value: string,
): ProjectSecretMetadata {
  const existing = mockSecrets.find(
    (secret) => secret.projectId === projectId && secret.key === key,
  );
  if (existing) {
    existing.value = value;
    existing.updatedAt = new Date().toISOString();
    return toSecretMetadata(existing);
  }

  const created: MockSecret = {
    id: `secret_${projectId}_${key}_${Date.now()}`,
    projectId,
    key,
    value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockSecrets.push(created);
  return toSecretMetadata(created);
}

export function deleteMockSecret(projectId: string, secretId: string): boolean {
  const index = mockSecrets.findIndex(
    (secret) => secret.projectId === projectId && secret.id === secretId,
  );
  if (index === -1) {
    return false;
  }
  mockSecrets.splice(index, 1);
  return true;
}

const MODEL_CONFIG_KEYS = ["MODEL_BASE_URL", "MODEL_API_KEY", "MODEL_ID"];

export function hasFullModelBundle(secrets: ProjectSecretMetadata[]): boolean {
  return MODEL_CONFIG_KEYS.every((key) => secrets.some((secret) => secret.key === key));
}

/** Mirrors the API's resolution (ADR 007): project bundle first, else the account default. */
export function isMockModelConfigResolvable(projectId: string): boolean {
  const projectSecrets = getMockSecrets(projectId);
  if (hasFullModelBundle(projectSecrets)) {
    return true;
  }
  if (projectSecrets.length > 0) {
    // Partial project override — inconsistent state, not a fallback trigger.
    return false;
  }
  return hasFullModelBundle(getMockUserSecrets());
}

interface MockUserSecret {
  id: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

// Single mock account's default model configuration (ADR 007) — plaintext
// `value` never leaves this module, same boundary as mockSecrets above.
export const mockUserSecrets: MockUserSecret[] = [];

function toUserSecretMetadata(secret: MockUserSecret): ProjectSecretMetadata {
  return {
    id: secret.id,
    key: secret.key,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}

export function getMockUserSecrets(): ProjectSecretMetadata[] {
  return [...mockUserSecrets].sort((a, b) => a.key.localeCompare(b.key)).map(toUserSecretMetadata);
}

export function upsertMockUserSecret(key: string, value: string): ProjectSecretMetadata {
  const existing = mockUserSecrets.find((secret) => secret.key === key);
  if (existing) {
    existing.value = value;
    existing.updatedAt = new Date().toISOString();
    return toUserSecretMetadata(existing);
  }

  const created: MockUserSecret = {
    id: `usersecret_${key}_${Date.now()}`,
    key,
    value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockUserSecrets.push(created);
  return toUserSecretMetadata(created);
}

export function deleteMockUserSecret(secretId: string): boolean {
  const index = mockUserSecrets.findIndex((secret) => secret.id === secretId);
  if (index === -1) {
    return false;
  }
  mockUserSecrets.splice(index, 1);
  return true;
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
