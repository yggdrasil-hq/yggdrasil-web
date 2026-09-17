import { DesignsIndexClient } from "@/components/designs/designs-index-client";

interface DesignsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function DesignsPage({ params }: DesignsPageProps) {
  const { projectId } = await params;
  return <DesignsIndexClient projectId={projectId} />;
}
