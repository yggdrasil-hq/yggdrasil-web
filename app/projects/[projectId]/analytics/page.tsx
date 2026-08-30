import { ProjectAnalyticsClient } from "@/components/projects/project-analytics-client";

interface ProjectAnalyticsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectAnalyticsPage({ params }: ProjectAnalyticsPageProps) {
  const { projectId } = await params;
  return <ProjectAnalyticsClient projectId={projectId} />;
}
