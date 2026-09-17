"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import { useFeatureDetail } from "@/components/features/feature-detail-context";
import {
  cancelFeature,
  fetchFeature,
  fetchFeatureEvents,
  restartFeatureFromMessage,
  retryFeatureGrill,
  sendFeatureMessage,
} from "@/lib/api";
import {
  canReplyToGrill,
  canRetryGrill,
  grillBubbleFor,
  grillPlaceholder,
  grillStoppedMessage,
  GRILL_POLL_INTERVAL_MS,
  isGrillLive,
  isGrillProcessing,
  isGrillStopped,
  type GrillBubbleTone,
} from "@/lib/features/grill";
import { featureStagePath } from "@/lib/features/stage";
import {
  canRestartFromMessage,
  isRestartableTurn,
  restartConfirmCopy,
  restartedNotice,
} from "@/lib/features/grill-restart";
import { apiBaseUrl, appRoute } from "@/lib/config";
import {
  createLiveRelay,
  createRefreshCoalescer,
  LIVE_SAFETY_POLL_INTERVAL_MS,
  liveSocketUrl,
  type LiveRelayStatus,
} from "@/lib/features/live-relay";
import type { FeatureEvent, JobStatus } from "@/lib/features/types";
import type { FeatureStatus } from "@/lib/features/statuses";

/**
 * Full-page `spec_grill` chat (yggdrasil-web#1), reached from the Spec stage
 * page's CTA while a feature is still `draft`. This is the successor to the
 * embedded SpecGrillPanel, which crammed the same transcript into a ~350px
 * fixed-height scroll box above the ADR preview and made a long grill hard
 * to follow.
 *
 * Two things changed and nothing else: the transcript no longer has a
 * max-height/overflow container, so it scrolls with the page; and the reply
 * composer is sticky to the viewport bottom so it stays reachable in a long
 * conversation. Every behaviour — the poll of both the feature and its job
 * events, the reply/cancel/retry gating, the stopped banner, the deliberate
 * swallow of transient poll failures — is carried over verbatim (see
 * lib/features/grill.ts, where the predicates now live and are unit-tested).
 *
 * ADR 019 adds the live relay on top without changing that shape. The REST read
 * stays the *only* state path — the socket never sets page state itself, it
 * only signals that a re-read is due — so this page cannot render a state the
 * API would not return, and a socket that never connects is indistinguishable
 * from the pre-relay page. While the relay is live the poll drops to a slow
 * safety interval; otherwise it is the original 2s poll. The poll effect also
 * re-runs on connect, which is the whole of the missed-event story: the re-read
 * is the catch-up.
 *
 * The route is NOT a seventh lifecycle stage: lib/features/stage.ts's
 * FEATURE_STAGES drives the six-stage tab nav and its done/active/upcoming
 * math (ADR 015), so a seventh entry would corrupt it. This is a detail view
 * of the Spec stage.
 *
 * Opening it for a feature that is no longer `draft` is not a dead end: the
 * finalized transcript still renders read-only, with a link back to the Spec
 * stage page (where the ADR and any retry affordance live).
 */
export function FeatureGrillClient() {
  const { projectId, featureId, feature, setFeature } = useFeatureDetail();
  const [events, setEvents] = useState<FeatureEvent[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<string | null>(null);
  const [restartedFrom, setRestartedFrom] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [confirmingRestartAt, setConfirmingRestartAt] = useState<string | null>(null);
  const [restartingAt, setRestartingAt] = useState<string | null>(null);
  const [polled, setPolled] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveRelayStatus>("off");

  // Flips on unmount so an in-flight poll (or a relay frame that lands just as
  // the page is left) cannot setState after teardown.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const poll = useCallback(async () => {
    try {
      const [featureData, eventsData] = await Promise.all([
        fetchFeature(projectId, featureId),
        fetchFeatureEvents(projectId, featureId),
      ]);
      if (!mountedRef.current) return;
      setFeature(featureData);
      setEvents(eventsData.events);
      setJobStatus(eventsData.jobStatus);
      setLastError(eventsData.lastError);
      setJobKind(eventsData.jobKind);
      setRestartedFrom(eventsData.restartedFromEventId);
      setPolled(true);
    } catch {
      // Transient poll failures are ignored: the next tick retries, and the
      // last known state stays on screen instead of flashing an error.
    }
  }, [projectId, featureId, setFeature]);

  const relayLive = liveStatus === "live";

  useEffect(() => {
    void poll();
    // Depends on `relayLive`, not on the status itself: connecting → live is the
    // only transition that changes the interval, and keying on the boolean means
    // the initial off → connecting transition does not trigger a second
    // immediate read on mount.
    const interval = setInterval(
      () => void poll(),
      relayLive ? LIVE_SAFETY_POLL_INTERVAL_MS : GRILL_POLL_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [poll, relayLive]);

  useEffect(() => {
    const url = liveSocketUrl(apiBaseUrl(), window.location.origin);
    // Unparsable API base: no socket, and the poll effect above is already the
    // fallback rather than an error path.
    if (!url) return;

    // Coalesced because one agent turn can append several events at once, and a
    // re-read per frame would be as many requests as polling, just burstier.
    const refresh = createRefreshCoalescer({ run: () => void poll() });
    const relay = createLiveRelay({
      url,
      projectId,
      featureId,
      onEvent: () => refresh.trigger(),
      onStatusChange: setLiveStatus,
    });

    return () => {
      refresh.cancel();
      relay.stop();
    };
  }, [projectId, featureId, poll]);

  async function handleSendReply() {
    const content = replyDraft.trim();
    if (!content) return;
    setSendingReply(true);
    setActionError(null);
    try {
      await sendFeatureMessage(projectId, featureId, content);
      setReplyDraft("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setActionError(null);
    try {
      const updated = await cancelFeature(projectId, featureId);
      setFeature(updated);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to cancel grill session",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    setActionError(null);
    try {
      await retryFeatureGrill(projectId, featureId);
      setEvents([]);
      setJobStatus(null);
      setLastError(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to retry grill session",
      );
    } finally {
      setRetrying(false);
    }
  }

  /**
   * ADR 024: rewind to the chosen turn. Only ever called from the confirm step
   * (the control asks first), because this discards every turn after the chosen
   * message and, with it, whatever the run concluded.
   */
  async function handleRestartFrom(eventId: string) {
    setRestartingAt(eventId);
    setActionError(null);
    try {
      const updated = await restartFeatureFromMessage(projectId, featureId, eventId);
      setFeature(updated);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to restart the grill from that message",
      );
    } finally {
      setRestartingAt(null);
      setConfirmingRestartAt(null);
    }
  }

  const live = isGrillLive(feature);
  const stoppedMessage = grillStoppedMessage(jobStatus, lastError);
  const placeholder = live
    ? grillPlaceholder({ eventCount: events.length, jobStatus })
    : events.length === 0
      ? "No transcript was recorded for this session."
      : null;
  // ADR 024. Gated on exactly what the API accepts, so the control never
  // offers something that would come back a 409.
  const restartable = canRestartFromMessage({
    status: feature.status,
    jobKind,
    jobStatus,
    hasTranscript: events.length > 0,
  });
  const rewoundNotice = restartedNotice(restartedFrom);

  return (
    <div className="space-y-6">
      {!live ? (
        <section className="rounded-card border border-rime bg-surface-01 p-6">
          <h2 className="text-base font-semibold text-frost">This grill session is finished</h2>
          <p className="mt-1 text-sm text-mist">{finishedCopy(feature.status)}</p>
          <Button className="mt-4" variant="outline" asChild>
            <Link href={appRoute(featureStagePath(projectId, featureId, "spec"))}>
              ← Back to Spec
            </Link>
          </Button>
        </section>
      ) : null}

      <section className="rounded-card border border-rime bg-surface-01 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-frost">
            {live ? "Spec grill in progress" : "Spec grill transcript"}
          </h2>
          <div className="flex flex-wrap gap-2">
            {jobStatus === "running" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={cancelling}
                onClick={() => void handleCancel()}
              >
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            ) : null}
            {canRetryGrill({
              polled,
              featureType: feature.featureType,
              jobStatus,
            }) ? (
              <Button
                variant="outline"
                size="sm"
                disabled={retrying}
                onClick={() => void handleRetry()}
              >
                {retrying ? "Retrying…" : "Retry grill"}
              </Button>
            ) : null}
          </div>
        </div>

        {/* No max-height and no overflow container here on purpose: the
            transcript scrolls with the page (yggdrasil-web#1). */}
        <div className="mt-4 space-y-3">
          {placeholder ? <p className="text-sm text-shadow">{placeholder}</p> : null}
          {rewoundNotice ? (
            <p className="rounded-md border border-rime-soft bg-surface-02 p-2 text-xs text-mist">
              {rewoundNotice}
            </p>
          ) : null}
          {events.map((event) => (
            <div key={event.id} className="space-y-1">
              <GrillEvent event={event} />
              {restartable && isRestartableTurn(event) ? (
                <TurnRestartControl
                  confirming={confirmingRestartAt === event.id}
                  busy={restartingAt === event.id}
                  isAdrApproved={feature.adrApproved}
                  onAsk={() => setConfirmingRestartAt(event.id)}
                  onCancel={() => setConfirmingRestartAt(null)}
                  onConfirm={() => void handleRestartFrom(event.id)}
                />
              ) : null}
            </div>
          ))}
          {isGrillProcessing({ awaitingUserInput: feature.awaitingUserInput, jobStatus }) ? (
            <ProcessingBubble />
          ) : null}
        </div>

        {stoppedMessage ? (
          <p className="mt-4 text-sm text-red-400">{stoppedMessage}</p>
        ) : null}

        {actionError ? <p className="mt-2 text-sm text-red-400">{actionError}</p> : null}

        {canReplyToGrill({
          awaitingUserInput: feature.awaitingUserInput,
          jobStatus,
        }) ? (
          <div className="sticky bottom-3 z-10 mt-4 flex gap-2 rounded-md border border-rime-soft bg-surface-01/95 p-2 backdrop-blur-sm">
            <Input
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              placeholder="Type your reply…"
              disabled={sendingReply}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendReply();
                }
              }}
            />
            <Button
              disabled={sendingReply || !replyDraft.trim()}
              onClick={() => void handleSendReply()}
            >
              {sendingReply ? "Sending…" : "Send"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Copy for the read-only banner. Only reached when the feature is not
 * `draft` — `draft` is exactly the live case — so there is no draft branch.
 */
function finishedCopy(status: FeatureStatus): string {
  switch (status) {
    case "cancelled":
      return "This grill session was stopped. Use “Restart feature” on the Spec page to start a fresh session.";
    case "failed":
      return "This grill session failed. Retry it from the Spec page.";
    default:
      return "The ADR is ready — the transcript below is kept for reference.";
  }
}

function GrillEvent({ event }: { event: FeatureEvent }) {
  const bubble = grillBubbleFor(event);
  if (!bubble) return null;
  return <GrillBubble label={bubble.label} tone={bubble.tone} content={bubble.content} />;
}

/**
 * ADR 024's per-turn "restart from here" control.
 *
 * Two steps on purpose. Rewinding is destructive and irreversible from the
 * user's side — every turn after this one is discarded, along with whatever
 * the run concluded — so the first click only opens an explanation of what is
 * about to be lost; nothing is sent until the second.
 *
 * The control is rendered only where the API would accept it (see
 * lib/features/grill-restart.ts), which is a deliberate narrowing of the
 * `design/` wireframe: that mock shows "Resume from here" / "Restart from
 * here" on every turn unconditionally. "Resume from here" is not built at all
 * (ADR 024 scopes it out), and a rewind is not offered on a turn the API would
 * reject or on a feature that has moved past Spec.
 */
function TurnRestartControl({
  confirming,
  busy,
  isAdrApproved,
  onAsk,
  onCancel,
  onConfirm,
}: {
  confirming: boolean;
  busy: boolean;
  isAdrApproved: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <div className="ml-1 flex justify-start">
        <button
          type="button"
          onClick={onAsk}
          className="text-xs text-shadow underline-offset-2 hover:text-frost hover:underline"
          title="Discard the conversation after this message and re-run the grill from here"
        >
          ↺ Restart from here
        </button>
      </div>
    );
  }

  return (
    <div className="ml-1 rounded-md border border-rime-soft bg-surface-02 p-3">
      <p className="text-xs text-mist">{restartConfirmCopy({ isAdrApproved })}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onConfirm}>
          {busy ? "Restarting…" : "Yes, restart from here"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function GrillBubble({
  label,
  tone = "default",
  content,
}: {
  label: string;
  tone?: GrillBubbleTone;
  content: string;
}) {
  return (
    <div className={`flex ${tone === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`w-[90%] max-w-3xl rounded-md border p-3 ${
          tone === "user" ? "border-rime bg-surface-03" : "border-rime-soft bg-surface-02"
        }`}
      >
        <p
          className={`text-xs font-medium ${tone === "error" ? "text-red-400" : "text-shadow"}`}
        >
          {label}
        </p>
        <Markdown content={content} className="mt-1" />
      </div>
    </div>
  );
}

function ProcessingBubble() {
  return (
    <div className="flex justify-start">
      <div className="w-[90%] max-w-3xl rounded-md border border-rime-soft bg-surface-02 p-3">
        <p className="text-xs font-medium text-shadow">Agent</p>
        <span className="mt-1 inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist" />
        </span>
      </div>
    </div>
  );
}
