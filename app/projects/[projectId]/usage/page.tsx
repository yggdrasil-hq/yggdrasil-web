import { ProjectUsageClient } from "@/components/projects/project-usage-client";

interface ProjectUsagePageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectUsagePage({ params }: ProjectUsagePageProps) {
  const { projectId } = await params;
  return <ProjectUsageClient projectId={projectId} />;
}
