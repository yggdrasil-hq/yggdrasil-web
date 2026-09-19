"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeature, fetchFeatureEvents } from "@/lib/api";
import { pollIntervalMsForRelay } from "@/lib/features/live-relay";
import { useLiveFeatureRelay } from "@/components/features/use-live-feature-relay";
import type { Feature, FeatureEvent, JobStatus } from "@/lib/features/types";

/**
 * The pre-relay poll interval, and the interval while the relay is live is
 * `LIVE_SAFETY_POLL_INTERVAL_MS`. Named rather than inlined because the pair is
 * the whole point of the conversion and a reader should see both together.
 */
const BUILD_POLL_INTERVAL_MS = 2000;

interface BuildProgressPanelProps {
  projectId: string;
  featureId: string;
  onFeatureChange: (feature: Feature) => void;
}

/**
 * Live view of a feature_build job's progress. Only rendered by
 * FeatureImplementationClient (the Implementation stage page) while the feature
 * is 'queued' or 'running'; once the build finishes, fails, or is cancelled, the
 * parent stops rendering this component and polling stops with it.
 *
 * **Issue #25: this surface is relay-driven, and it is the one where the 2s poll
 * was most visible.** A build's `run_started` and its terminal event now arrive
 * within the observer's latency rather than up to two seconds later — which
 * matters most at the *start*, where the panel previously sat on "Waiting for the
 * build to start…" while the agent was already working.
 *
 * The conversion is deliberately the narrow one ADR 019 item 7 describes:
 * subscribe, re-read on signal, drop the poll to the safety floor. REST stays the
 * only *state* path — nothing here renders a value out of a socket frame, so the
 * socket cannot disagree with the API. A relay that never connects leaves the 2s
 * poll exactly as it was.
 *
 * **What this still does not show: the agent's prose.** It shows elapsed time and
 * the two events a build produces that a human needs immediately (a conflict
 * resolution, and the outcome). A streaming transcript is issue #39's scope, and
 * it is a genuinely different change — it needs a place to put text, not just a
 * signal to re-read.
 */
export function BuildProgressPanel({
  projectId,
  featureId,
  onFeatureChange,
}: BuildProgressPanelProps) {
  const [events, setEvents] = useState<FeatureEvent[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /*
   * Both the interval and the relay's refresh call this, so the guard has to
   * live outside either one — a ref rather than the previous effect-local
   * `active` flag, which could only protect the interval's own path. The parent
   * callback is the reason it matters: calling `onFeatureChange` after unmount
   * would be a state update on a torn-down parent.
   */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /*
   * `onFeatureChange` is in the deps below rather than excluded with an
   * `eslint-disable` (which is what this component used to do). It is safe to
   * depend on: the prop is `FeatureDetailLayout`'s `useState` setter, which is
   * stable for the life of the provider.
   *
   * It is worth naming *why* that matters here, because this component re-renders
   * on a 1s clock (the elapsed-time ticker below). If `poll`'s identity changed on
   * each of those renders, the interval effect would tear down and recreate its
   * timer every second and — with a 2s period — never fire at all. Stable deps
   * are what keep the interval intact, so a future change that wraps
   * `onFeatureChange` in an inline arrow would silently stop the panel updating
   * rather than break it visibly.
   */
  const poll = useCallback(async () => {
    try {
      const [featureData, eventsData] = await Promise.all([
        fetchFeature(projectId, featureId),
        fetchFeatureEvents(projectId, featureId),
      ]);
      if (!mountedRef.current) return;
      onFeatureChange(featureData);
      setEvents(eventsData.events);
      setJobStatus(eventsData.jobStatus);
    } catch {
      // Transient poll failures are ignored: the next tick retries, and the
      // last known state stays on screen instead of flashing an error.
    }
  }, [projectId, featureId, onFeatureChange]);

  const { isLive } = useLiveFeatureRelay({
    projectId,
    featureId,
    onEvent: () => void poll(),
  });

  useEffect(() => {
    void poll();
    const interval = setInterval(
      () => void poll(),
      pollIntervalMsForRelay({ isLive, fallbackMs: BUILD_POLL_INTERVAL_MS }),
    );
    return () => clearInterval(interval);
  }, [poll, isLive]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const startedEvent = events.find((event) => event.type === "run_started");
  const startedAt = startedEvent ? new Date(startedEvent.createdAt).getTime() : null;
  const elapsedLabel = startedAt ? formatElapsed(now - startedAt) : null;
  /*
   * Issue #27: this build's entrypoint resolved conflicts between the feature
   * branch and its base before the agent started. Surfaced prominently rather
   * than in a log line, because a conflict resolution is the highest-risk part
   * of a build's diff — it is where the agent guessed at how two changes should
   * coexist — and nothing in the product said it had happened at all.
   */
  const conflictEvent = events.find((event) => event.type === "merge_conflicts");

  return (
    <section className="rounded-card border border-rime bg-surface-01 p-6">
      <h2 className="text-base font-semibold text-frost">Build in progress</h2>

      {conflictEvent?.message ? (
        <div className="mt-4 rounded-md border border-status-input/40 bg-status-input/10 px-4 py-3">
          <p className="text-sm font-medium text-frost">
            This build resolved merge conflicts with the base branch
          </p>
          <p className="mt-1 text-sm text-mist">{conflictEvent.message}</p>
          <p className="mt-1 text-xs text-shadow">
            Worth a closer look when it reaches review: a conflict resolution is where the agent
            decided how two sets of changes should coexist.
          </p>
        </div>
      ) : null}

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
        This panel updates live while the build runs. A streaming transcript of the
        agent&apos;s output isn&apos;t shown here — you&apos;ll see the result (success,
        failure, or a pull request) as soon as the run ends.
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
