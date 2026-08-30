import { FeatureTestingClient } from "@/components/features/feature-testing-client";

interface FeatureTestingPageProps {
  params: Promise<{ projectId: string; featureId: string }>;
}

export default async function FeatureTestingPage({ params }: FeatureTestingPageProps) {
  const { projectId, featureId } = await params;
  return <FeatureTestingClient projectId={projectId} featureId={featureId} />;
}
