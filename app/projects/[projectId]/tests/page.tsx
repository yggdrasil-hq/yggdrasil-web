import { TestsPageClient } from "@/components/tests/tests-page-client";

interface TestsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function TestsPage({ params }: TestsPageProps) {
  const { projectId } = await params;
  return <TestsPageClient projectId={projectId} />;
}
