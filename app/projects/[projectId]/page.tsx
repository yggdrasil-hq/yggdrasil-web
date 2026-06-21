import { ProjectHomeClient } from "@/components/projects/project-home-client";

interface ProjectHomePageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectHomePage({ params }: ProjectHomePageProps) {
  const { projectId } = await params;
  return <ProjectHomeClient projectId={projectId} />;
}
