"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
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
import {
  countAgentTextEvents,
  shouldDropStreamBuffer,
} from "@/lib/features/grill-stream";
import {
  NO_GRILL_WAIT,
  describeGrillWait,
  grillWaitMessage,
  resolveGrillWaitView,
  type GrillWaitView,
} from "@/lib/features/grill-wait";
import { appRoute } from "@/lib/config";
import { pollIntervalMsForRelay } from "@/lib/features/live-relay";
import { useLiveFeatureRelay } from "@/components/features/use-live-feature-relay";
import type { FeatureEvent, JobStatus } from "@/lib/features/types";
import type { FeatureStatus } from "@/lib/features/statuses";
import { GrillQuestionCard } from "@/components/features/grill-question-card";
import {
  askUserQuestionFor,
  formatQuestionAnswer,
  isQuestionAnswered,
  isQuestionInteractive,
  recordedAnswerFor,
} from "@/lib/features/grill-question";

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
  /**
   * Issue #92: how long this grill has been waiting on an unanswered question.
   *
   * Held as a *view* rather than as the API's `awaitingReply`, because
   * `resolveGrillWaitView` has to compare each read against the previous one to
   * survive the API's two-gates-disagree instant — see that function. The raw
   * field is an input to the transition, not the state.
   */
  const [grillWait, setGrillWait] = useState<GrillWaitView>(NO_GRILL_WAIT);
  /**
   * A ticking clock, so the age advances without a network read.
   *
   * Started only while there is a wait to show — a grill page can sit open for
   * hours, and a one-second timer that runs for the whole page's life to update
   * nothing would be a battery and render cost for no output. Keyed on the
   * boolean rather than the view object so a new view each poll does not tear the
   * timer down and recreate it.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [replyDraft, setReplyDraft] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  /**
   * Issue #38: the id of the question whose answer is being sent, so only that
   * card shows a busy state. A boolean would put "Sending…" on every question in
   * the transcript, which is the visual equivalent of claiming they are all being
   * answered.
   */
  const [answeringEventId, setAnsweringEventId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [confirmingRestartAt, setConfirmingRestartAt] = useState<string | null>(null);
  const [restartingAt, setRestartingAt] = useState<string | null>(null);
  const [polled, setPolled] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /**
   * Streaming assistant text that has arrived over the relay but is not yet in
   * the transcript (ADR 019 item 13).
   *
   * Provisional by definition — the deltas for one message concatenate to exactly
   * the text the authoritative `agent_text` event carries at `message_end` — so
   * lib/features/grill-stream.ts decides when it is superseded and this state is
   * only ever what that decision leaves behind.
   */
  const [streamingText, setStreamingText] = useState("");
  /** `agent_text` count at the last successful read, for the supersede rule. */
  const agentTextCountRef = useRef(0);

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
      // The buffer's supersede rules live in lib/features/grill-stream.ts so they
      // are unit-testable; see that module for why each one is needed.
      const agentTextCount = countAgentTextEvents(eventsData.events);
      if (
        shouldDropStreamBuffer({
          previousAgentTextCount: agentTextCountRef.current,
          agentTextCount,
          jobStatus: eventsData.jobStatus,
        })
      ) {
        setStreamingText("");
      }
      agentTextCountRef.current = agentTextCount;
      setFeature(featureData);
      setEvents(eventsData.events);
      setJobStatus(eventsData.jobStatus);
      setLastError(eventsData.lastError);
      setJobKind(eventsData.jobKind);
      setRestartedFrom(eventsData.restartedFromEventId);
      /*
       * Issue #92. The functional updater is load-bearing rather than stylistic:
       * the transition needs the previous view to decide whether a null
       * `awaitingReply` is a fresh wait or the API's two writes disagreeing, and
       * reading that from the closure would mean putting `grillWait` in the
       * dependency list — which rebuilds `poll` on every poll that changes it, and
       * `poll` is a dependency of the interval and of the relay's callback.
       */
      setGrillWait((previous) =>
        resolveGrillWaitView({
          awaitingReply: eventsData.awaitingReply,
          // Both halves are read together, and both from this read: the *whether*
          // comes from the feature (where the API keeps it) and the *when* from the
          // events, so the two cannot come from different generations of the pair.
          awaitingUserInput: featureData.awaitingUserInput,
          jobStatus: eventsData.jobStatus,
          previous,
        }),
      );
      setPolled(true);
    } catch {
      // Transient poll failures are ignored: the next tick retries, and the
      // last known state stays on screen instead of flashing an error.
    }
  }, [projectId, featureId, setFeature]);

  /*
   * Issue #25: this page was the first relay-driven surface, and it now shares
   * `useLiveFeatureRelay` with the build-progress panel and the Testing tab —
   * three copies of this wiring would have drifted, and the wiring is subtle
   * enough (the callback ref, the coalescer, "live" only on a confirmed
   * subscription) that drift would have been silent.
   */
  const { isLive } = useLiveFeatureRelay({
    projectId,
    featureId,
    onEvent: () => void poll(),
    // Deltas append directly rather than triggering a re-read: a delta is text,
    // not a state change, and the authoritative `agent_text` still arrives over
    // the REST path and supersedes the buffer.
    onDelta: (text) => setStreamingText((previous) => previous + text),
  });

  useEffect(() => {
    void poll();
    // Keyed on the boolean rather than on a status string: connecting → live is
    // the only transition that changes the interval, and keying on the boolean
    // means the initial off → connecting transition does not trigger a second
    // immediate read on mount.
    const interval = setInterval(
      () => void poll(),
      pollIntervalMsForRelay({ isLive, fallbackMs: GRILL_POLL_INTERVAL_MS }),
    );
    return () => clearInterval(interval);
  }, [poll, isLive]);

  /*
   * Issue #92: the clock the age is measured against.
   *
   * The API sends `since`, not an age, precisely so the client can do this — an
   * age computed server-side is already stale when it renders and does not move
   * while you watch it. One second is the resolution: it is what makes a fresh
   * wait visibly live rather than a number that looks frozen.
   *
   * Runs only while there is a wait to render, so a grill page left open for hours
   * is not costing a render every second to update nothing.
   */
  useEffect(() => {
    if (grillWait.kind === "none") return;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [grillWait.kind]);

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

  /**
   * Issue #38: submit a structured answer.
   *
   * **Through the same path as a typed reply** (ADR 006's mid-run reply), because
   * that is the only channel that reaches a running agent, and the answer is
   * prose on the wire — `formatQuestionAnswer` owns how a list becomes prose, and
   * its comment explains the newline separator.
   *
   * A failure leaves the selection in place (the card's own state is untouched)
   * and surfaces the API's message on the card, so the user can retry without
   * re-picking. That is why this does not clear anything on the error path.
   */
  async function handleAnswerQuestion(eventId: string, labels: string[]) {
    const content = formatQuestionAnswer(labels);
    if (!content) return;
    setAnsweringEventId(eventId);
    setActionError(null);
    try {
      await sendFeatureMessage(projectId, featureId, content);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to send your answer",
      );
    } finally {
      setAnsweringEventId(null);
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
      setStreamingText("");
      agentTextCountRef.current = 0;
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

  const processing = isGrillProcessing({
    awaitingUserInput: feature.awaitingUserInput,
    jobStatus,
  });
  /*
   * Issue #92: the wait banner's content, or null when there is nothing to say.
   * Recomputed on every tick, which is what makes the age live — no new data from
   * the server is involved.
   */
  const grillWaitDescribed = describeGrillWait(grillWait, nowMs);

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
          {events.map((event, index) => {
            /*
             * Issue #38: a structured question renders as a card instead of
             * `GrillEvent`'s bubble. `askUserQuestionFor` decides whether the
             * event *is* one — null covers both "prose question" (every pre-#38
             * row) and "structured but with nothing to pick", and the module's
             * comment explains why those must both fall back to text.
             *
             * Computed once into a local, rather than called in the condition and
             * again in the branch: a second call would be a second parse of the
             * same event, and the non-null assertion needed to satisfy the type
             * checker would be asserting something this code just proved.
             */
            const question = askUserQuestionFor(event);
            return (
              <div key={event.id} className="space-y-1">
                {question ? (
                  <GrillQuestionCard
                    question={question}
                    answer={
                      isQuestionAnswered(events, index)
                        ? recordedAnswerFor(events, index)
                        : null
                    }
                    interactive={isQuestionInteractive({
                      awaitingUserInput: feature.awaitingUserInput,
                      jobStatus,
                    })}
                    submitting={answeringEventId === event.id}
                    onAnswer={(labels) => handleAnswerQuestion(event.id, labels)}
                  />
                ) : (
                  <GrillEvent event={event} />
                )}
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
            );
          })}
          {processing && streamingText ? (
            // The growing bubble: the model's own words as they arrive. It is
            // replaced, not appended to, the moment the finished message is
            // persisted (see the supersede rule in `poll`), so the transcript
            // never shows the same text twice.
            <GrillBubble label="Agent" tone="default" content={streamingText} />
          ) : processing ? (
            <ProcessingBubble />
          ) : null}
        </div>

        {stoppedMessage ? (
          <ErrorMessage className="mt-4 text-sm text-red-400">{stoppedMessage}</ErrorMessage>
        ) : null}

        {/*
          Issue #92: how long this grill has been waiting on an answer.

          Placed immediately above the reply composer rather than in the
          transcript, because the two answer the same question — "someone needs to
          answer this" — and the useful thing about the age is being able to read
          it at the moment you decide whether to answer now or later. Putting it in
          the transcript would separate it from the box it is about, and the
          transcript also scrolls away in a long conversation.

          Rendered from the *view*, not from `feature.awaitingUserInput`: the view
          is what survives the API's two-writes-disagree instant, so the banner
          cannot blink off and back. It still disappears in the same poll as the
          composer, because `resolveGrillWaitView` clears on the flag the composer
          gates on.
        */}
        {grillWaitDescribed && canReplyToGrill({
          awaitingUserInput: feature.awaitingUserInput,
          jobStatus,
        }) ? (
          <p
            className={cn(
              "mt-4 rounded-md border px-3 py-2 text-sm",
              grillWaitDescribed.overdue
                ? "border-status-input/40 bg-status-input/10 text-mist"
                : "border-rime-soft bg-surface-02 text-mist",
            )}
            /* `role="status"` so a screen reader hears the age when it appears and
               when the countdown rolls over, rather than only when focus happens
               to land on it. Polite, not assertive: this is information, and
               interrupting whatever the user is doing to announce it would be
               disruptive for something that is not an error. */
            role="status"
          >
            <Clock className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" aria-hidden />
            {/* No "retry" advice here on purpose. When the bound is actually
                passed the Orchestrator fails the run, and `grillStoppedMessage`
                already appends its `lastError` verbatim — which names the
                question and says the feature can be retried. Repeating that here
                would be two places stating one fact, which is the drift this
                codebase keeps finding; this banner states only the one fact it
                owns (how long, and whether that is past the bound). */}
            {grillWaitMessage(grillWaitDescribed)}
          </p>
        ) : null}

        {actionError ? <ErrorMessage className="mt-2 text-sm text-red-400">{actionError}</ErrorMessage> : null}

        {canReplyToGrill({
          awaitingUserInput: feature.awaitingUserInput,
          jobStatus,
        }) ? (
          <div className="sticky bottom-3 z-10 mt-4 flex gap-2 rounded-md border border-rime-soft bg-surface-01/95 p-2 backdrop-blur-sm">
            <Input
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.target.value)}
              placeholder="Type your reply…"
              /* Placeholder only, so the name is assistive-only; a screen reader
                 user needs to know this is where the answer goes. */
              aria-label="Your reply to the agent"
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
