import { NewDesignClient } from "@/components/designs/new-design-client";

interface NewDesignPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ featureId?: string; actionItemId?: string; reopen?: string }>;
}

export default async function NewDesignPage({ params, searchParams }: NewDesignPageProps) {
  const { projectId } = await params;
  const query = await searchParams;
  return (
    <NewDesignClient
      projectId={projectId}
      featureId={query.featureId}
      actionItemId={query.actionItemId}
      reopenDesignId={query.reopen}
    />
  );
}
