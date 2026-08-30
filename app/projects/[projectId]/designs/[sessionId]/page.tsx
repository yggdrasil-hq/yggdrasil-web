import { DesignSessionClient } from "@/components/designs/design-session-client";

interface DesignSessionPageProps {
  params: Promise<{ projectId: string; sessionId: string }>;
}

export default async function DesignSessionPage({ params }: DesignSessionPageProps) {
  const { projectId, sessionId } = await params;
  return <DesignSessionClient projectId={projectId} sessionId={sessionId} />;
}
