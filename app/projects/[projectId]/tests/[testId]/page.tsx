import { TestDetailClient } from "@/components/tests/test-detail-client";

interface TestDetailPageProps {
  params: Promise<{ projectId: string; testId: string }>;
}

export default async function TestDetailPage({ params }: TestDetailPageProps) {
  const { projectId, testId } = await params;
  return <TestDetailClient projectId={projectId} testId={testId} />;
}
