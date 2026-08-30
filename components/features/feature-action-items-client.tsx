"use client";

import { useCallback, useState } from "react";
import { ActionItemsPanel } from "@/components/features/action-items-panel";
import { useFeatureDetail } from "@/components/features/feature-detail-context";
import { Button } from "@/components/ui/button";
import { updateFeature } from "@/lib/api";

/**
 * Action Items stage (ADR 015 item 2: a UI view of `spec_ready`, not a
 * distinct DB state). "Start build" is ported straight out of the old
 * combined page's ADR block, where it lived next to Save/Approve only
 * because both shared the same `spec_ready` conditional — it moves here
 * because it's gated on action-item resolution (ADR 015 item 2), not ADR
 * content, and this is now the dedicated Action Items route.
 */
export function FeatureActionItemsClient() {
  const { projectId, featureId, feature, setFeature } = useFeatureDetail();
  // null = not loaded yet → Start build stays disabled until the panel
  // reports the real open count (preempts the backend's 409, ADR 015 item 2).
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenCountChange = useCallback((count: number) => {
    setOpenCount(count);
  }, []);

  async function handleStartBuild() {
    setStarting(true);
    setError(null);
    try {
      const updated = await updateFeature(projectId, featureId, { startBuild: true });
      setFeature(updated);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Failed to start build");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      {feature.status === "spec_ready" && feature.adrApproved ? (
        <div className="flex flex-col items-end gap-1.5">
          <Button disabled={starting || openCount !== 0} onClick={() => void handleStartBuild()}>
            {starting ? "Starting…" : "Start build"}
          </Button>
          {(openCount ?? 0) > 0 ? (
            <p className="text-xs text-shadow">Resolve open action items to enable build</p>
          ) : null}
        </div>
      ) : null}

      {feature.status === "spec_ready" && !feature.adrApproved ? (
        <p className="text-sm text-shadow">Approve the ADR on the Spec page to start the build.</p>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <ActionItemsPanel
        projectId={projectId}
        featureId={featureId}
        status={feature.status}
        onOpenCountChange={handleOpenCountChange}
      />
    </div>
  );
}
