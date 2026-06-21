import { FeatureDetailClient } from "@/components/features/feature-detail-client";

interface FeatureDetailPageProps {
  params: Promise<{ projectId: string; featureId: string }>;
}

export default async function FeatureDetailPage({ params }: FeatureDetailPageProps) {
  const { projectId, featureId } = await params;
  return <FeatureDetailClient projectId={projectId} featureId={featureId} />;
}
