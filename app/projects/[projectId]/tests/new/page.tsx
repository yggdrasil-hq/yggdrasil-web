import { CreateTestPageClient } from "@/components/tests/create-test-page-client";

interface CreateTestPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function CreateTestPage({ params }: CreateTestPageProps) {
  const { projectId } = await params;
  return <CreateTestPageClient projectId={projectId} />;
}
