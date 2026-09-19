"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useFeatureDetail } from "@/components/features/feature-detail-context";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import {
  fetchFeature,
  fetchFeatureEvents,
  fetchFeatureGrillRuns,
  retryFeatureGrill,
  updateFeature,
} from "@/lib/api";
import {
  describeEarlierRun,
  earlierRunsSummary,
  grillRunPath,
} from "@/lib/features/grill-runs";
import { runStatusLabel } from "@/lib/features/test-runs";
import type { EarlierGrillRun } from "@/lib/features/types";
import { formatDistanceToNow } from "date-fns";
import { GRILL_POLL_INTERVAL_MS, grillRoutePath } from "@/lib/features/grill";
import { featureStagePath } from "@/lib/features/stage";
import { appRoute } from "@/lib/config";

/**
 * Spec stage (ADR 015: `draft`, plus the "Spec" half of `spec_ready` before
 * the ADR is approved). Ports the ADR edit/approve workflow straight out of
 * the old combined FeatureDetailClient — same handlers, same API calls, now
 * scoped to this route instead of one conditional block among six. "Start
 * build" moved to the Action Items page (feature-action-items-client.tsx)
 * since it's gated on action-item resolution, not ADR content.
 *
 * The live grill chat no longer renders here: it has its own full-page route
 * (yggdrasil-web#1, components/features/feature-grill-client.tsx), reached
 * from the CTA below while the feature is `draft`. This page keeps the ADR
 * workflow and the failed/cancelled banners.
 */
export function FeatureSpecClient() {
  const { projectId, featureId, feature, setFeature } = useFeatureDetail();
  const [adrDraft, setAdrDraft] = useState(feature.adrMarkdown ?? "");
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  /**
   * Issue #28 part 2: grill runs this feature has already been through, so a user
   * who rewound by mistake can read what they lost.
   *
   * Fetched once rather than polled. The list changes only when a *new* run is
   * dispatched, which navigates away from this page — so a poll would cost a
   * request every tick to learn nothing.
   */
  const [earlierRuns, setEarlierRuns] = useState<EarlierGrillRun[]>([]);

  // Keep the draft textarea in sync with live updates from elsewhere (e.g.
  // the grill page's own polling populating adrMarkdown for the first time).
  useEffect(() => {
    setAdrDraft(feature.adrMarkdown ?? "");
  }, [feature.adrMarkdown]);

  // The grill chat moved to its own route, which is what used to poll the
  // feature here. This page still needs to notice the draft -> spec_ready
  // flip that `submit_adr` causes, so the CTA is replaced by the ADR editor
  // without a manual refresh — hence a feature-only poll while draft (no
  // events: this page renders no transcript).
  useEffect(() => {
    if (feature.status !== "draft") return;
    let active = true;
    const interval = setInterval(() => {
      fetchFeature(projectId, featureId)
        .then((updated) => {
          if (active) setFeature(updated);
        })
        .catch(() => {
          // Transient poll failures are ignored: the next tick retries, and
          // the last known state stays on screen.
        });
    }, GRILL_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [projectId, featureId, feature.status, setFeature]);

  // Surfaces the actual failure reason on the failed banner (jobs.last_error,
  // ADR 012) — only relevant here for a grill that failed before approval;
  // a build failure after approval is the Implementation page's concern.
  useEffect(() => {
    if (feature.status !== "failed" || feature.adrApproved) {
      setLastError(null);
      return;
    }
    let active = true;
    fetchFeatureEvents(projectId, featureId)
      .then((data) => {
        if (active) setLastError(data.lastError);
      })
      .catch(() => {
        // Best-effort: the generic banner copy still renders without this.
      });
    return () => {
      active = false;
    };
  }, [projectId, featureId, feature.status, feature.adrApproved]);

  useEffect(() => {
    let active = true;
    fetchFeatureGrillRuns(projectId, featureId)
      .then((data) => {
        if (active) setEarlierRuns(data.earlierRuns);
      })
      .catch(() => {
        // Best-effort: the rest of the Spec stage is unaffected by this list
        // failing, so it degrades to absent rather than to an error banner. The
        // link to the current transcript is rendered unconditionally below.
      });
    return () => {
      active = false;
    };
  }, [projectId, featureId]);

  async function handleSaveAdr() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFeature(projectId, featureId, { adrMarkdown: adrDraft });
      setFeature(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save ADR");
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveAdr() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFeature(projectId, featureId, { approveAdr: true });
      setFeature(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to approve ADR");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetryGrill() {
    setRetrying(true);
    setError(null);
    try {
      await retryFeatureGrill(projectId, featureId);
      const updated = await fetchFeature(projectId, featureId);
      setFeature(updated);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Failed to retry grill");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-6">
      {feature.status === "failed" && !feature.adrApproved && (
        <section className="rounded-card border border-red-500/30 bg-red-500/10 p-6">
          <h2 className="text-base font-semibold text-frost">This feature failed</h2>
          <p className="mt-1 text-sm text-mist">
            {feature.featureType === "project_init"
              ? "Project initialization didn't complete. Check the project's model configuration, then retry."
              : "The spec grill session didn't complete successfully."}
          </p>
          {lastError && (
            <ErrorMessage className="mt-2 rounded-md bg-surface-02 p-3 font-mono text-xs text-red-400">
              {lastError}
            </ErrorMessage>
          )}
          <Button className="mt-4" disabled={retrying} onClick={() => void handleRetryGrill()}>
            {retrying ? "Retrying…" : "Retry grill"}
          </Button>
        </section>
      )}

      {feature.status === "cancelled" && !feature.adrApproved && (
        <section className="rounded-card border border-rime bg-surface-01 p-6">
          <h2 className="text-base font-semibold text-frost">This feature was cancelled</h2>
          <p className="mt-1 text-sm text-mist">
            The spec grill session was stopped. Use "Restart feature" above to start a fresh
            grill session.
          </p>
        </section>
      )}

      {feature.status === "draft" ? (
        <section className="rounded-card border border-rime bg-surface-01 p-6">
          <h2 className="text-base font-semibold text-frost">Spec grill in progress</h2>
          <p className="mt-1 text-sm text-mist">
            The grilling conversation has its own full-page chat, so a long transcript reads
            top to bottom instead of scrolling inside a panel. Reply to the agent and watch
            the ADR take shape there.
          </p>
          <Button className="mt-4" asChild>
            <Link href={appRoute(grillRoutePath(projectId, featureId))}>
              Open grill chat →
            </Link>
          </Button>
        </section>
      ) : (
        // Once `submit_adr` has landed the feature is no longer `draft`, so
        // the CTA into the (now finished) chat is replaced by a quiet link
        // back to the read-only transcript.
        <Link
          href={appRoute(grillRoutePath(projectId, featureId))}
          className="inline-block text-sm text-shadow hover:text-frost"
        >
          View grill transcript →
        </Link>
      )}

      {error ? <ErrorMessage className="text-sm text-red-400">{error}</ErrorMessage> : null}

      {/*
        * Issue #28 part 2: what a rewind discarded.
        *
        * Rendered only when the API says there is something to show —
        * `earlierRunsSummary` returns null for an empty list, so a feature on its
        * first grill gets no section rather than a heading reading "0 earlier
        * runs". The list itself is the API's, unsliced: which runs count as
        * earlier is a rule it owns, and a client that filtered the array would be
        * re-implementing it (#35/#89's mistake).
        */}
      {earlierRunsSummary(earlierRuns) ? (
        <section className="rounded-card border border-rime bg-surface-01 p-6">
          <h2 className="text-base font-semibold text-frost">
            {earlierRunsSummary(earlierRuns)}
          </h2>
          <p className="mt-1 text-sm text-mist">
            Each time the grill was restarted from a later turn, the conversation it
            replaced was kept. These are read-only.
          </p>
          <ul className="mt-4 space-y-2">
            {earlierRuns.map((entry) => (
              <li key={entry.jobId}>
                <Link
                  href={appRoute(grillRunPath(projectId, featureId, entry.jobId))}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rime px-3 py-2 text-sm hover:border-bifrost"
                >
                  <span className="text-frost">
                    {describeEarlierRun(entry, runStatusLabel(entry.status))}
                  </span>
                  <span className="text-xs text-shadow">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feature.status === "spec_ready" && (
        <section className="flex h-[calc(100vh-16rem)] min-h-[30rem] flex-col overflow-hidden rounded-card border border-rime bg-surface-01">
          <div className="flex flex-col gap-3 border-b border-rime-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-frost">Feature ADR</h2>
              {feature.adrApproved ? (
                <span className="rounded-full bg-status-approved/20 px-2 py-0.5 text-[11px] font-medium text-status-approved">
                  Approved
                </span>
              ) : null}
            </div>
            {!feature.adrApproved ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={saving} onClick={() => void handleSaveAdr()}>
                  Save edits
                </Button>
                <Button disabled={saving} onClick={() => void handleApproveAdr()}>
                  Approve ADR
                </Button>
              </div>
            ) : (
              <Button variant="outline" asChild>
                <Link href={appRoute(featureStagePath(projectId, featureId, "action-items"))}>
                  Continue to Action Items →
                </Link>
              </Button>
            )}
          </div>

          <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
            <textarea
              className="h-full w-full resize-none overflow-y-auto border-b border-rime-soft bg-surface-02 p-4 font-mono text-sm text-frost focus:outline-none md:border-b-0 md:border-r"
              value={adrDraft}
              onChange={(event) => setAdrDraft(event.target.value)}
              readOnly={feature.adrApproved}
              spellCheck={false}
              /* The stage heading names this region visually but is not
                 associated with it, so the editor — the main control on the
                 page — would otherwise be announced as an unnamed text box. */
              aria-label="ADR markdown"
            />
            <Markdown
              content={adrDraft}
              className="h-full overflow-y-auto bg-surface-02 p-4 text-mist"
            />
          </div>
        </section>
      )}

      {feature.status !== "spec_ready" && (feature.adrMarkdown || feature.status === "draft") ? (
        <section className="rounded-card border border-rime bg-surface-01 p-6">
          <h2 className="text-base font-semibold text-frost">Feature ADR</h2>
          {feature.adrMarkdown ? (
            <Markdown
              content={feature.adrMarkdown}
              className="mt-4 rounded-md bg-surface-02 p-4 text-mist"
            />
          ) : (
            <p className="mt-4 text-sm text-shadow">ADR not generated yet.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
