import { http, HttpResponse } from "msw";
import { apiUrl } from "@/lib/config";
import {
  addMockFeature,
  addMockFeatureReply,
  addMockProjectRepository,
  cancelMockFeatureGrill,
  createMockProject,
  getMockFeature,
  getMockFeatureEvents,
  getMockFeatures,
  getMockProject,
  getMockProjects,
  getMockTest,
  getMockTests,
  addMockTest,
  mockInstallationRepos,
  mockInstallations,
  mockNotifications,
  mockOverview,
  removeMockProjectRepository,
  updateMockFeature,
  updateMockTest,
} from "@/lib/msw/fixtures";
import type { Feature, Test } from "@/lib/features/types";

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

    const { project } = createMockProject({
      name,
      description: body.description?.trim() ?? "",
      repositories,
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

  http.get(apiUrl("/projects/:projectId"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(project);
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

  http.get(apiUrl("/projects/:projectId/tests"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(getMockTests(project.id));
  }),

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
];
