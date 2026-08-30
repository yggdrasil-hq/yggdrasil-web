import { NewDesignClient } from "@/components/designs/new-design-client";

interface NewDesignPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function NewDesignPage({ params }: NewDesignPageProps) {
  const { projectId } = await params;
  return <NewDesignClient projectId={projectId} />;
}
