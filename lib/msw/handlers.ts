import { http, HttpResponse } from "msw";
import { apiUrl } from "@/lib/config";
import {
  acceptMockOrgInvite,
  addMockFeature,
  addMockFeatureReply,
  addMockProjectRepository,
  autoResolveMockActionItems,
  cancelMockFeatureGrill,
  addMockDesignReply,
  changeMockOrgMemberRole,
  clearMockOrganizationCluster,
  createMockDesignSession,
  createMockOrgInvite,
  createMockProject,
  deleteMockOrganizationSecret,
  deleteMockSecret,
  deleteMockUserSecret,
  getMockActionItems,
  getMockAgenticReview,
  getMockDeployStatus,
  getMockFeature,
  getMockFeatureEvents,
  getMockDesignEvents,
  getMockFeatures,
  getMockOrgInvites,
  getMockOrgMembers,
  getMockOrganization,
  getMockOrganizationCluster,
  getMockOrganizationRoles,
  getMockOrganizationSecrets,
  getMockOrganizations,
  getMockProject,
  getMockProjects,
  getMockSecrets,
  getMockTest,
  getMockTestingResults,
  getMockTests,
  getMockUserSecrets,
  addMockTest,
  hasFullModelBundle,
  isMockModelConfigResolvable,
  mockCurrentUser,
  mockInstallationRepos,
  mockInstallations,
  mockNotifications,
  mockOverview,
  removeMockOrgMember,
  removeMockProjectRepository,
  resolveMockActionItem,
  resumeMockFeature,
  retryMockFeatureGrill,
  setMockOrganizationCluster,
  triggerMockDeploy,
  updateMockFeature,
  updateMockOrganization,
  updateMockTest,
  upsertMockOrganizationSecret,
  upsertMockSecret,
  upsertMockUserSecret,
} from "@/lib/msw/fixtures";
import type { Feature, OrgRole, Test } from "@/lib/features/types";

export const handlers = [
  http.get(apiUrl("/github/installations"), () => {
    return HttpResponse.json(mockInstallations);
  }),

  http.get(apiUrl("/github/installations/:installationId/repos"), () => {
    return HttpResponse.json(mockInstallationRepos);
  }),

  http.get(apiUrl("/github/installations/:installationId/configure-url"), ({ params }) => {
    return HttpResponse.json({
      url: `https://github.com/apps/yggdrasil-mock/installations/${String(params.installationId)}`,
    });
  }),

  http.post(apiUrl("/github/installations/:installationId/sync"), () => {
    return HttpResponse.json(mockInstallationRepos);
  }),

  http.get(apiUrl("/projects"), () => {
    return HttpResponse.json(getMockProjects());
  }),

  http.post(apiUrl("/projects"), async ({ request }) => {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      installationId?: string;
      repositories?: Array<{
        githubOwner: string;
        githubRepo: string;
        isPrimary: boolean;
      }>;
      modelConfig?: { modelBaseUrl: string; modelApiKey: string; modelId: string };
      saveModelConfigAsDefault?: boolean;
    };

    const name = body.name?.trim();
    const installationId = body.installationId?.trim();
    const repositories = body.repositories ?? [];
    const primaryCount = repositories.filter((repo) => repo.isPrimary).length;

    if (!name) {
      return HttpResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!installationId) {
      return HttpResponse.json({ error: "installationId is required" }, { status: 400 });
    }
    if (repositories.length === 0 || primaryCount !== 1) {
      return HttpResponse.json(
        { error: "Exactly one repository must be marked as primary" },
        { status: 400 },
      );
    }

    // ADR 007: a request bundle always resolves; otherwise the account
    // default has to be complete.
    if (!body.modelConfig && !hasFullModelBundle(getMockUserSecrets())) {
      return HttpResponse.json(
        {
          error:
            "Set a default model configuration in Account settings, or provide one for this project.",
        },
        { status: 400 },
      );
    }

    const { project } = createMockProject({
      name,
      description: body.description?.trim() ?? "",
      repositories,
      modelConfig: body.modelConfig,
      saveModelConfigAsDefault: body.saveModelConfigAsDefault,
    });

    return HttpResponse.json(project, { status: 201 });
  }),

  http.post(apiUrl("/projects/:projectId/complete-init"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.status !== "initializing") {
      return HttpResponse.json(
        { error: "Project initialization is already complete" },
        { status: 409 },
      );
    }
    project.status = "ready";
    const initFeature = getMockFeatures(project.id).find(
      (feature) => feature.featureType === "project_init",
    );
    if (initFeature) {
      updateMockFeature(project.id, initFeature.id, { status: "merged" });
    }
    return HttpResponse.json(getMockProject(project.id)!);
  }),

  http.get(apiUrl("/projects/:projectId/deploy"), ({ params }) => {
    return HttpResponse.json(getMockDeployStatus(String(params.projectId)));
  }),

  http.post(apiUrl("/projects/:projectId/deploy"), ({ params }) => {
    const result = triggerMockDeploy(String(params.projectId));
    if (result === "not_found") {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (result === "not_ready") {
      return HttpResponse.json({ error: "Project is not ready to deploy yet" }, { status: 409 });
    }
    if (result === "in_progress") {
      return HttpResponse.json(
        { error: "A deploy is already in progress for this project" },
        { status: 409 },
      );
    }
    return HttpResponse.json({}, { status: 201 });
  }),

  http.get(apiUrl("/projects/:projectId"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(project);
  }),

  // ADR 015 item 12: toggles the per-project Agentic Review gate.
  http.patch(apiUrl("/projects/:projectId"), async ({ params, request }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = (await request.json()) as { agenticReviewEnabled?: boolean };
    if (typeof body.agenticReviewEnabled !== "boolean") {
      return HttpResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    project.agenticReviewEnabled = body.agenticReviewEnabled;
    return HttpResponse.json(getMockProject(project.id)!);
  }),

  http.post(apiUrl("/projects/:projectId/repositories"), async ({ params, request }) => {
    const projectId = String(params.projectId);
    const project = getMockProject(projectId);
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      githubOwner?: string;
      githubRepo?: string;
    };
    const githubOwner = body.githubOwner?.trim();
    const githubRepo = body.githubRepo?.trim();

    if (!githubOwner || !githubRepo) {
      return HttpResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    try {
      const updated = addMockProjectRepository(projectId, { githubOwner, githubRepo });
      if (!updated) {
        return HttpResponse.json({ error: "Project not found" }, { status: 404 });
      }
      return HttpResponse.json(updated, { status: 201 });
    } catch (error) {
      return HttpResponse.json(
        { error: error instanceof Error ? error.message : "Unable to add repository" },
        { status: 409 },
      );
    }
  }),

  http.delete(
    apiUrl("/projects/:projectId/repositories/:repositoryId"),
    ({ params }) => {
      const projectId = String(params.projectId);
      const repositoryId = String(params.repositoryId);
      const project = getMockProject(projectId);
      if (!project) {
        return HttpResponse.json({ error: "Project not found" }, { status: 404 });
      }

      const result = removeMockProjectRepository(projectId, repositoryId);
      if (result === "not_found") {
        return HttpResponse.json({ error: "Repository not found" }, { status: 404 });
      }
      if (result === "primary") {
        return HttpResponse.json({ error: "Primary repository cannot be removed" }, { status: 409 });
      }
      if (result === "blocked") {
        return HttpResponse.json(
          {
            error:
              project.repositoryRemovalBlockedReason ??
              "Repository removal is currently blocked",
          },
          { status: 409 },
        );
      }

      return HttpResponse.json(result);
    },
  ),

  http.get(apiUrl("/projects/:projectId/secrets"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(getMockSecrets(project.id));
  }),

  http.put(apiUrl("/projects/:projectId/secrets"), async ({ params, request }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = (await request.json()) as { key?: string; value?: string };
    const key = body.key?.trim();
    if (!key || body.value === undefined) {
      return HttpResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const secret = upsertMockSecret(project.id, key, body.value);
    return HttpResponse.json(secret);
  }),

  http.delete(apiUrl("/projects/:projectId/secrets/:secretId"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const deleted = deleteMockSecret(project.id, String(params.secretId));
    if (!deleted) {
      return HttpResponse.json({ error: "Secret not found" }, { status: 404 });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(apiUrl("/settings/secrets"), () => {
    return HttpResponse.json(getMockUserSecrets());
  }),

  http.put(apiUrl("/settings/secrets"), async ({ request }) => {
    const body = (await request.json()) as { key?: string; value?: string };
    const key = body.key?.trim();
    if (!key || body.value === undefined) {
      return HttpResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const secret = upsertMockUserSecret(key, body.value);
    return HttpResponse.json(secret);
  }),

  http.delete(apiUrl("/settings/secrets/:secretId"), ({ params }) => {
    const deleted = deleteMockUserSecret(String(params.secretId));
    if (!deleted) {
      return HttpResponse.json({ error: "Secret not found" }, { status: 404 });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(apiUrl("/projects/:projectId/overview"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(mockOverview);
  }),

  http.get(apiUrl("/projects/:projectId/features"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(getMockFeatures(project.id));
  }),

  http.post(apiUrl("/projects/:projectId/features"), async ({ params, request }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.status === "initializing") {
      return HttpResponse.json(
        { error: "Project initialization must complete before creating features" },
        { status: 409 },
      );
    }

    if (!isMockModelConfigResolvable(project.id)) {
      return HttpResponse.json(
        {
          error:
            "No model configuration is set for this project or your account default. Set one in Account settings, or configure this project directly on its settings page.",
        },
        { status: 400 },
      );
    }

    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim();
    if (!title) {
      return HttpResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const feature: Feature = {
      id: `feat_${Date.now()}`,
      projectId: project.id,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      featureType: "normal",
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

    addMockFeature(feature);
    return HttpResponse.json(feature, { status: 201 });
  }),

  http.get(apiUrl("/projects/:projectId/features/:featureId"), ({ params }) => {
    const feature = getMockFeature(
      String(params.projectId),
      String(params.featureId),
    );
    if (!feature) {
      return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
    }
    return HttpResponse.json(feature);
  }),

  http.patch(
    apiUrl("/projects/:projectId/features/:featureId"),
    async ({ params, request }) => {
      const feature = getMockFeature(
        String(params.projectId),
        String(params.featureId),
      );
      if (!feature) {
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      }

      const body = (await request.json()) as {
        adrMarkdown?: string;
        approveAdr?: boolean;
        startBuild?: boolean;
      };

      const patch: Partial<Feature> = {};

      if (body.adrMarkdown !== undefined) {
        patch.adrMarkdown = body.adrMarkdown;
        patch.specExcerpt = body.adrMarkdown.split("\n").find((line) => line.trim()) ?? feature.title;
      }

      if (body.approveAdr) {
        patch.adrApproved = true;
      }

      if (body.startBuild) {
        // ADR 015 item 2: the API refuses to queue a build while any Action
        // Item on the feature is still open — mirrors the real 409.
        const openCount = getMockActionItems(
          String(params.projectId),
          String(params.featureId),
        ).filter((item) => item.status === "open").length;
        if (openCount > 0) {
          return HttpResponse.json(
            {
              error: `Resolve ${openCount} open action item${openCount === 1 ? "" : "s"} before starting the build`,
            },
            { status: 409 },
          );
        }
        patch.status = "queued";
      }

      const updated = updateMockFeature(
        String(params.projectId),
        String(params.featureId),
        patch,
      );

      return HttpResponse.json(updated);
    },
  ),

  http.get(apiUrl("/projects/:projectId/features/:featureId/events"), ({ params }) => {
    const feature = getMockFeature(String(params.projectId), String(params.featureId));
    if (!feature) {
      return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
    }
    return HttpResponse.json(getMockFeatureEvents(String(params.featureId)));
  }),

  http.post(apiUrl("/projects/:projectId/designs"), async ({ params, request }) => {
    const session = createMockDesignSession(String(params.projectId), await request.json() as {
      name: string;
      description: string;
      slug?: string;
    });
    if (!session) return HttpResponse.json({ error: "Design sessions are not enabled for this project" }, { status: 409 });
    return HttpResponse.json(session, { status: 201 });
  }),

  http.get(apiUrl("/projects/:projectId/designs/:sessionId/events"), ({ params }) => {
    const result = getMockDesignEvents(String(params.projectId), String(params.sessionId));
    if (!result) return HttpResponse.json({ error: "Design session not found" }, { status: 404 });
    return HttpResponse.json(result);
  }),

  http.post(apiUrl("/projects/:projectId/designs/:sessionId/messages"), async ({ params, request }) => {
    const body = await request.json() as { content?: string };
    if (!body.content?.trim()) return HttpResponse.json({ error: "content is required" }, { status: 400 });
    const result = getMockDesignEvents(String(params.projectId), String(params.sessionId));
    if (!result || result.jobStatus !== "running") {
      return HttpResponse.json({ error: "No active design session is waiting for a reply" }, { status: 409 });
    }
    addMockDesignReply(String(params.sessionId), body.content.trim());
    return HttpResponse.json({}, { status: 201 });
  }),

  http.post(apiUrl("/projects/:projectId/designs/:sessionId/cancel"), ({ params }) => {
    const sessionId = String(params.sessionId);
    const result = getMockDesignEvents(String(params.projectId), sessionId);
    if (!result) return HttpResponse.json({ error: "Design session not found" }, { status: 404 });
    result.session.status = "cancelled";
    return HttpResponse.json({});
  }),

  http.post(
    apiUrl("/projects/:projectId/features/:featureId/messages"),
    async ({ params, request }) => {
      const projectId = String(params.projectId);
      const featureId = String(params.featureId);
      const feature = getMockFeature(projectId, featureId);
      if (!feature) {
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      }

      const body = (await request.json()) as { content?: string };
      const content = body.content?.trim();
      if (!content) {
        return HttpResponse.json({ error: "content is required" }, { status: 400 });
      }

      if (getMockFeatureEvents(featureId).jobStatus !== "running") {
        return HttpResponse.json(
          { error: "No active grill session is waiting for a reply" },
          { status: 409 },
        );
      }

      addMockFeatureReply(projectId, featureId, content);
      return HttpResponse.json({}, { status: 201 });
    },
  ),

  http.post(apiUrl("/projects/:projectId/features/:featureId/cancel"), ({ params }) => {
    const projectId = String(params.projectId);
    const featureId = String(params.featureId);
    const feature = getMockFeature(projectId, featureId);
    if (!feature) {
      return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
    }

    const cancelled = cancelMockFeatureGrill(projectId, featureId);
    if (!cancelled) {
      return HttpResponse.json({ error: "No active grill session to cancel" }, { status: 409 });
    }
    return HttpResponse.json({});
  }),

  http.post(apiUrl("/projects/:projectId/features/:featureId/retry-grill"), ({ params }) => {
    const projectId = String(params.projectId);
    const featureId = String(params.featureId);

    const result = retryMockFeatureGrill(projectId, featureId);
    switch (result) {
      case "not_found":
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      case "not_retryable":
        return HttpResponse.json(
          { error: "Feature is not in a retryable state" },
          { status: 409 },
        );
      case "active_job":
        return HttpResponse.json(
          { error: "A grill session is already running for this feature" },
          { status: 409 },
        );
      case "no_model_config":
        return HttpResponse.json(
          {
            error:
              "No model configuration is set for this project or your account default. Set one in Account settings, or configure this project directly on its settings page.",
          },
          { status: 400 },
        );
      case "ok":
        return HttpResponse.json({}, { status: 201 });
    }
  }),

  http.get(apiUrl("/projects/:projectId/tests"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(getMockTests(project.id));
  }),

  // --- Feature lifecycle gates (ADR 015 / Track B) ---

  http.get(
    apiUrl("/projects/:projectId/features/:featureId/action-items"),
    ({ params }) => {
      const feature = getMockFeature(
        String(params.projectId),
        String(params.featureId),
      );
      if (!feature) {
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      }
      return HttpResponse.json(
        getMockActionItems(String(params.projectId), String(params.featureId)),
      );
    },
  ),

  http.post(
    apiUrl(
      "/projects/:projectId/features/:featureId/action-items/:itemId/resolve",
    ),
    ({ params }) => {
      const projectId = String(params.projectId);
      const featureId = String(params.featureId);
      const feature = getMockFeature(projectId, featureId);
      if (!feature) {
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      }
      const resolved = resolveMockActionItem(
        projectId,
        featureId,
        String(params.itemId),
      );
      if (!resolved) {
        return HttpResponse.json(
          { error: "Action item not found or already resolved" },
          { status: 404 },
        );
      }
      return HttpResponse.json(getMockActionItems(projectId, featureId));
    },
  ),

  http.post(
    apiUrl("/projects/:projectId/features/:featureId/action-items/auto-resolve"),
    ({ params }) => {
      const projectId = String(params.projectId);
      const featureId = String(params.featureId);
      const feature = getMockFeature(projectId, featureId);
      if (!feature) {
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      }
      return HttpResponse.json(
        autoResolveMockActionItems(projectId, featureId),
      );
    },
  ),

  // ADR 015 item 18: returned -> [human clicks] -> queued.
  http.post(
    apiUrl("/projects/:projectId/features/:featureId/resume"),
    ({ params }) => {
      const projectId = String(params.projectId);
      const featureId = String(params.featureId);
      const feature = getMockFeature(projectId, featureId);
      if (!feature) {
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      }
      if (!resumeMockFeature(projectId, featureId)) {
        return HttpResponse.json(
          { error: "Only a returned feature can be resumed" },
          { status: 409 },
        );
      }
      return HttpResponse.json({}, { status: 201 });
    },
  ),

  http.get(
    apiUrl("/projects/:projectId/features/:featureId/testing"),
    ({ params }) => {
      const feature = getMockFeature(
        String(params.projectId),
        String(params.featureId),
      );
      if (!feature) {
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      }
      return HttpResponse.json(
        getMockTestingResults(String(params.projectId), String(params.featureId)),
      );
    },
  ),

  http.get(
    apiUrl("/projects/:projectId/features/:featureId/agentic-review"),
    ({ params }) => {
      const feature = getMockFeature(
        String(params.projectId),
        String(params.featureId),
      );
      if (!feature) {
        return HttpResponse.json({ error: "Feature not found" }, { status: 404 });
      }
      return HttpResponse.json(
        getMockAgenticReview(String(params.projectId), String(params.featureId)),
      );
    },
  ),

  http.post(apiUrl("/projects/:projectId/tests"), async ({ params, request }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.status !== "ready") {
      return HttpResponse.json(
        { error: "Project initialization must complete before defining tests" },
        { status: 409 },
      );
    }

    const body = (await request.json()) as {
      name?: string;
      specMarkdown?: string;
      scheduleCron?: string;
      enabled?: boolean;
    };

    if (!body.name?.trim() || !body.specMarkdown?.trim() || !body.scheduleCron?.trim()) {
      return HttpResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const test: Test = {
      id: `test_${Date.now()}`,
      projectId: project.id,
      name: body.name.trim(),
      specMarkdown: body.specMarkdown,
      scheduleCron: body.scheduleCron.trim(),
      enabled: body.enabled ?? true,
      lastRunAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addMockTest(test);
    return HttpResponse.json(test, { status: 201 });
  }),

  http.get(apiUrl("/projects/:projectId/tests/:testId"), ({ params }) => {
    const test = getMockTest(String(params.projectId), String(params.testId));
    if (!test) {
      return HttpResponse.json({ error: "Test not found" }, { status: 404 });
    }
    return HttpResponse.json(test);
  }),

  http.patch(
    apiUrl("/projects/:projectId/tests/:testId"),
    async ({ params, request }) => {
      const test = getMockTest(String(params.projectId), String(params.testId));
      if (!test) {
        return HttpResponse.json({ error: "Test not found" }, { status: 404 });
      }

      const body = (await request.json()) as Partial<Test>;
      const updated = updateMockTest(String(params.projectId), String(params.testId), body);
      return HttpResponse.json(updated);
    },
  ),

  http.get(apiUrl("/notifications"), () => {
    const unreadCount = mockNotifications.filter((item) => !item.readAt).length;
    return HttpResponse.json({ notifications: mockNotifications, unreadCount });
  }),

  http.patch(apiUrl("/notifications/:notificationId/read"), ({ params }) => {
    const notification = mockNotifications.find((item) => item.id === params.notificationId);
    if (!notification) {
      return HttpResponse.json({ error: "Notification not found" }, { status: 404 });
    }
    notification.readAt = new Date().toISOString();
    return HttpResponse.json(notification);
  }),

  http.post(apiUrl("/notifications/read-all"), () => {
    for (const notification of mockNotifications) {
      notification.readAt = new Date().toISOString();
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // --- Auth session (dev-only mock identity) ---

  http.get(apiUrl("/auth/me"), () => {
    return HttpResponse.json({ user: mockCurrentUser });
  }),

  // --- Organization / RBAC (ADR 016) ---

  http.get(apiUrl("/organizations"), () => {
    return HttpResponse.json(getMockOrganizations());
  }),

  http.get(apiUrl("/organizations/roles"), () => {
    return HttpResponse.json(getMockOrganizationRoles());
  }),

  http.post(apiUrl("/organizations/invites/:token/accept"), ({ params }) => {
    const organization = acceptMockOrgInvite(String(params.token));
    if (!organization) {
      return HttpResponse.json({ error: "Invite not found or already used" }, { status: 404 });
    }
    return HttpResponse.json({ organization });
  }),

  http.get(apiUrl("/organizations/:organizationId"), ({ params }) => {
    const org = getMockOrganization(String(params.organizationId));
    if (!org) {
      return HttpResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    return HttpResponse.json(org);
  }),

  http.patch(apiUrl("/organizations/:organizationId"), async ({ params, request }) => {
    const body = (await request.json()) as { name?: string; description?: string };
    const org = updateMockOrganization(String(params.organizationId), body);
    if (!org) {
      return HttpResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    return HttpResponse.json(org);
  }),

  http.get(apiUrl("/organizations/:organizationId/members"), ({ params }) => {
    return HttpResponse.json({ members: getMockOrgMembers(String(params.organizationId)) });
  }),

  http.patch(
    apiUrl("/organizations/:organizationId/members/:userId"),
    async ({ params, request }) => {
      const body = (await request.json()) as { role?: OrgRole };
      if (!body.role) {
        return HttpResponse.json({ error: "role is required" }, { status: 400 });
      }
      const ok = changeMockOrgMemberRole(
        String(params.organizationId),
        String(params.userId),
        body.role,
      );
      if (!ok) {
        return HttpResponse.json({ error: "Member not found" }, { status: 404 });
      }
      return HttpResponse.json({});
    },
  ),

  http.delete(apiUrl("/organizations/:organizationId/members/:userId"), ({ params }) => {
    const ok = removeMockOrgMember(String(params.organizationId), String(params.userId));
    if (!ok) {
      return HttpResponse.json({ error: "Member not found" }, { status: 404 });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(apiUrl("/organizations/:organizationId/invites"), ({ params }) => {
    return HttpResponse.json({ invites: getMockOrgInvites(String(params.organizationId)) });
  }),

  http.post(apiUrl("/organizations/:organizationId/invites"), async ({ params, request }) => {
    const body = (await request.json()) as { role?: OrgRole };
    if (!body.role) {
      return HttpResponse.json({ error: "role is required" }, { status: 400 });
    }
    const invite = createMockOrgInvite(String(params.organizationId), body.role);
    return HttpResponse.json(invite, { status: 201 });
  }),

  http.get(apiUrl("/organizations/:organizationId/secrets"), ({ params }) => {
    return HttpResponse.json(getMockOrganizationSecrets(String(params.organizationId)));
  }),

  http.put(apiUrl("/organizations/:organizationId/secrets"), async ({ params, request }) => {
    const body = (await request.json()) as { key?: string; value?: string };
    const key = body.key?.trim();
    if (!key || body.value === undefined) {
      return HttpResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const secret = upsertMockOrganizationSecret(String(params.organizationId), key, body.value);
    return HttpResponse.json(secret);
  }),

  http.delete(
    apiUrl("/organizations/:organizationId/secrets/:secretId"),
    ({ params }) => {
      const deleted = deleteMockOrganizationSecret(
        String(params.organizationId),
        String(params.secretId),
      );
      if (!deleted) {
        return HttpResponse.json({ error: "Secret not found" }, { status: 404 });
      }
      return new HttpResponse(null, { status: 204 });
    },
  ),

  http.get(apiUrl("/organizations/:organizationId/cluster"), ({ params }) => {
    return HttpResponse.json({ cluster: getMockOrganizationCluster(String(params.organizationId)) });
  }),

  http.put(apiUrl("/organizations/:organizationId/cluster"), ({ params }) => {
    const cluster = setMockOrganizationCluster(String(params.organizationId));
    return HttpResponse.json({ cluster });
  }),

  http.delete(apiUrl("/organizations/:organizationId/cluster"), ({ params }) => {
    clearMockOrganizationCluster(String(params.organizationId));
    return new HttpResponse(null, { status: 204 });
  }),
];
