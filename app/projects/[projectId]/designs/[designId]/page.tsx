import { DesignDetailClient } from "@/components/designs/design-detail-client";

interface DesignDetailPageProps {
  params: Promise<{ projectId: string; designId: string }>;
}

export default async function DesignDetailPage({ params }: DesignDetailPageProps) {
  const { projectId, designId } = await params;
  return <DesignDetailClient projectId={projectId} designId={designId} />;
}
