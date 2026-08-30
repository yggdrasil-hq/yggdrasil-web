import { ProjectDeploymentsClient } from "@/components/projects/project-deployments-client";

interface ProjectDeploymentsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDeploymentsPage({ params }: ProjectDeploymentsPageProps) {
  const { projectId } = await params;
  return <ProjectDeploymentsClient projectId={projectId} />;
}
