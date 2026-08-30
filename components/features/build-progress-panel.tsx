"use client";

import { useEffect, useState } from "react";
import { fetchFeature, fetchFeatureEvents } from "@/lib/api";
import type { Feature, FeatureEvent, JobStatus } from "@/lib/features/types";

const POLL_INTERVAL_MS = 2000;

interface BuildProgressPanelProps {
  projectId: string;
  featureId: string;
  onFeatureChange: (feature: Feature) => void;
}

/**
 * Live view of a feature_build job's progress (mirrors SpecGrillPanel's
 * polling approach for spec_grill — a WebSocket relay is still not built,
 * ADR 006 item 8's scope cut). Only rendered by FeatureImplementationClient
 * (the Implementation stage page) while the feature is 'queued' or
 * 'running'; once the build finishes, fails, or is cancelled, the parent
 * stops rendering this component and polling stops with it.
 *
 * The Orchestrator doesn't relay the agent's turn-by-turn output today
 * (rpc.Translate intentionally leaves plain assistant text untranslated —
 * see internal/rpc/curated.go in the orchestrator repo) — the only signal
 * available while a build is running is run_started plus job status, so
 * this shows "build started at <time>, running for <elapsed>" rather than
 * a live transcript.
 */
export function BuildProgressPanel({
  projectId,
  featureId,
  onFeatureChange,
}: BuildProgressPanelProps) {
  const [events, setEvents] = useState<FeatureEvent[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [featureData, eventsData] = await Promise.all([
          fetchFeature(projectId, featureId),
          fetchFeatureEvents(projectId, featureId),
        ]);
        if (!active) return;
        onFeatureChange(featureData);
        setEvents(eventsData.events);
        setJobStatus(eventsData.jobStatus);
      } catch {
        // Transient poll failures are ignored: the next tick retries, and
        // the last known state stays on screen instead of flashing an error.
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
    // onFeatureChange intentionally excluded: it's re-created every parent
    // render, but its behavior doesn't vary across polls for a given
    // projectId/featureId, and including it would tear down/restart this
    // interval on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, featureId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const startedEvent = events.find((event) => event.type === "run_started");
  const startedAt = startedEvent ? new Date(startedEvent.createdAt).getTime() : null;
  const elapsedLabel = startedAt ? formatElapsed(now - startedAt) : null;

  return (
    <section className="rounded-card border border-rime bg-surface-01 p-6">
      <h2 className="text-base font-semibold text-frost">Build in progress</h2>

      <div className="mt-4 flex items-center gap-3 rounded-md border border-rime-soft bg-surface-02 p-4">
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist" />
        </span>
        <p className="text-sm text-mist">
          {jobStatus === "running" && startedAt
            ? `Agent is building… (${elapsedLabel} elapsed)`
            : jobStatus === "running"
              ? "Agent is building…"
              : "Waiting for the build to start…"}
        </p>
      </div>

      <p className="mt-3 text-xs text-shadow">
        Detailed step-by-step agent output isn&apos;t relayed yet — you&apos;ll see the
        result (success, failure, or a pull request) as soon as the run ends.
      </p>
    </section>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
