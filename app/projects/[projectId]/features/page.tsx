import { FeaturesPageClient } from "@/components/features/features-page-client";

interface FeaturesPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function FeaturesPage({ params }: FeaturesPageProps) {
  const { projectId } = await params;
  return <FeaturesPageClient projectId={projectId} />;
}
