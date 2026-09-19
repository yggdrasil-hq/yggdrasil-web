"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useFeatureDetail } from "@/components/features/feature-detail-context";
import { GrillEvent } from "@/components/features/grill-transcript";
import { Button } from "@/components/ui/button";
import { appRoute } from "@/lib/config";
import { fetchFeatureJobEvents } from "@/lib/api";
import { grillBubbleFor, grillRoutePath } from "@/lib/features/grill";
import { runStatusLabel } from "@/lib/features/test-runs";
import { featureStagePath } from "@/lib/features/stage";
import type { FeatureEvent, FeatureEventsResponse } from "@/lib/features/types";

/**
 * Issue #28 part 2: **one specific run's transcript**, read-only.
 *
 * **Why its own route rather than a mode on the grill page.** The grill page is a
 * live surface — it polls on an interval, holds a relay subscription, offers a
 * reply box and a per-turn rewind. Rendering a terminal run through it would mean
 * disabling four behaviours by flag, and a flag someone forgets is how a
 * superseded run would become replyable. Here, read-only is structural: there is
 * no reply box, no rewind control and no relay in this file, so there is nothing to
 * disable.
 *
 * It reuses `GrillEvent` (the same component the live page renders each turn with)
 * and `grillBubbleFor` behind it, so an earlier run reads exactly like the current
 * one. The route is reached from the Spec page's "Earlier runs" list.
 *
 * **No `awaitingReply` handling on purpose.** The API's job-scoped read does not
 * return it — "is a human being waited on right now" is a property of the *current*
 * run, and this page exists for runs that were left behind.
 */
export function FeatureRunTranscriptClient({ jobId }: { jobId: string }) {
  const { projectId, featureId, feature } = useFeatureDetail();
  const [data, setData] = useState<FeatureEventsResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    fetchFeatureJobEvents(projectId, featureId, jobId)
      .then((response) => {
        if (!active) return;
        setData(response);
        setError(null);
      })
      .catch((fetchError) => {
        if (!active) return;
        setError(
          fetchError instanceof Error ? fetchError.message : "Unable to load this run.",
        );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [projectId, featureId, jobId]);

  // Turns the API returned into rendered bubbles. Filtering here rather than
  // rendering everything keeps a run whose events are all non-conversational (a
  // job that failed before saying anything) from rendering as an empty box with no
  // explanation — see the empty case below.
  const conversational = (data?.events ?? []).filter(
    (event: FeatureEvent) => grillBubbleFor(event) !== null,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-rime bg-surface-01 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-frost">Earlier grill run</h2>
            <p className="mt-1 text-sm text-mist">
              This conversation was replaced when the grill was restarted from a
              later turn. It is kept here so you can read what was discarded. It is
              read-only — the run has finished and cannot be replied to or resumed
              from.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={appRoute(grillRoutePath(projectId, featureId))}>
              Current grill →
            </Link>
          </Button>
        </div>

        {data ? (
          <p className="mt-3 text-xs text-shadow">
            {runStatusLabel(data.jobStatus ?? "completed")}
            {data.jobKind ? ` · ${data.jobKind}` : ""}
          </p>
        ) : null}

        {/* A failed run's reason is the most useful thing on this page, so it is
            surfaced rather than left to the events. */}
        {data?.lastError ? (
          <ErrorMessage className="mt-3 rounded-md bg-surface-02 p-3 font-mono text-xs text-red-400">
            {data.lastError}
          </ErrorMessage>
        ) : null}
      </section>

      <section className="rounded-card border border-rime bg-surface-01 p-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!loaded && !error ? <p className="text-sm text-mist">Loading transcript…</p> : null}

        {loaded && !error && conversational.length === 0 ? (
          <p className="text-sm text-shadow">
            This run ended before the agent said anything, so there is no
            conversation to show.
          </p>
        ) : null}

        {/* Newest-last, matching the live transcript's top-to-bottom reading order
            — a reversed history would be the one thing that made an earlier run
            harder to read than the current one. */}
        <div className="space-y-3">
          {conversational.map((event: FeatureEvent) => (
            <GrillEvent key={event.id} event={event} />
          ))}
        </div>
      </section>

      <Link
        href={appRoute(featureStagePath(projectId, featureId, "spec"))}
        className="inline-block text-sm text-shadow hover:text-frost"
      >
        ← Back to {feature.title}&apos;s Spec stage
      </Link>
    </div>
  );
}
