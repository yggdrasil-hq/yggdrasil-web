import { ProjectSettingsClient } from "@/components/settings/project-settings-client";

interface ProjectSettingsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { projectId } = await params;
  return <ProjectSettingsClient projectId={projectId} />;
}
