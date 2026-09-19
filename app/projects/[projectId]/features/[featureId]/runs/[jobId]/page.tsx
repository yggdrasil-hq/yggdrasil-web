import { FeatureRunTranscriptClient } from "@/components/features/feature-run-transcript-client";

interface FeatureRunTranscriptPageProps {
  params: Promise<{ projectId: string; featureId: string; jobId: string }>;
}

/**
 * Issue #28 part 2: a superseded run's read-only transcript.
 *
 * A route of its own rather than a query param on the grill page — see
 * `FeatureRunTranscriptClient` for why read-only is structural here rather than a
 * flag. `jobId` comes from the path and is passed through; the API is what decides
 * whether the caller may read it, and it refuses a job belonging to another
 * feature in the same project.
 */
export default async function FeatureRunTranscriptPage({
  params,
}: FeatureRunTranscriptPageProps) {
  const { jobId } = await params;
  return <FeatureRunTranscriptClient jobId={jobId} />;
}
