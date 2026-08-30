import { FeatureDetailLayout } from "@/components/features/feature-detail-layout";

interface FeatureDetailSegmentLayoutProps {
  params: Promise<{ projectId: string; featureId: string }>;
  children: React.ReactNode;
}

export default async function FeatureDetailSegmentLayout({
  params,
  children,
}: FeatureDetailSegmentLayoutProps) {
  const { projectId, featureId } = await params;
  return (
    <FeatureDetailLayout projectId={projectId} featureId={featureId}>
      {children}
    </FeatureDetailLayout>
  );
}
