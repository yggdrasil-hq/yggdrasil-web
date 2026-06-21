import { http, HttpResponse } from "msw";
import { apiUrl } from "@/lib/config";
import {
  getMockFeature,
  getMockFeatures,
  getMockProject,
} from "@/lib/msw/fixtures";

export const handlers = [
  http.get(apiUrl("/projects/:projectId"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(project);
  }),

  http.get(apiUrl("/projects/:projectId/features"), ({ params }) => {
    const project = getMockProject(String(params.projectId));
    if (!project) {
      return HttpResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return HttpResponse.json(getMockFeatures(project.id));
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
];
