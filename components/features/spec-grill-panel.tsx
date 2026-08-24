"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/markdown";
import {
  cancelFeatureGrill,
  fetchFeature,
  fetchFeatureEvents,
  retryFeatureGrill,
  sendFeatureMessage,
} from "@/lib/api";
import type { Feature, FeatureEvent, JobStatus } from "@/lib/features/types";

const POLL_INTERVAL_MS = 2000;

interface SpecGrillPanelProps {
  projectId: string;
  featureId: string;
  feature: Feature;
  onFeatureChange: (feature: Feature) => void;
}

/**
 * Live view of a feature's spec_grill session (ADR 006 item 15): polls the
 * feature and its job events every POLL_INTERVAL_MS, rather than a
 * WebSocket relay, since that's still a tracked follow-up (item 8's scope
 * cut) — this is the only surface that learns about a running grill's
 * progress today. Only rendered by FeatureDetailClient while the feature is
 * still "draft"; once a submit_adr event flips it to spec_ready, the parent
 * stops rendering this component and polling stops with it.
 */
export function SpecGrillPanel({
  projectId,
  featureId,
  feature,
  onFeatureChange,
}: SpecGrillPanelProps) {
  const [events, setEvents] = useState<FeatureEvent[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [polled, setPolled] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
        setPolled(true);
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
      await cancelFeatureGrill(projectId, featureId);
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
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to retry grill session",
      );
    } finally {
      setRetrying(false);
    }
  }

  const stopped = jobStatus === "failed" || jobStatus === "cancelled";
  // No active job means there's nothing to poll/cancel — either it never
  // dispatched, or it stopped. Scoped to project_init (ADR 007): general
  // re-grilling of normal features is a separate, still-open question.
  // Gated on `polled` so the button doesn't flash in before the first poll
  // has had a chance to find a running job.
  const canRetry = polled && feature.featureType === "project_init" && jobStatus !== "running";

  return (
    <section className="rounded-card border border-rime bg-surface-01 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-frost">Spec grill in progress</h2>
        {jobStatus === "running" && (
          <Button
            variant="outline"
            size="sm"
            disabled={cancelling}
            onClick={() => void handleCancel()}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        )}
        {canRetry && (
          <Button
            variant="outline"
            size="sm"
            disabled={retrying}
            onClick={() => void handleRetry()}
          >
            {retrying ? "Retrying…" : "Retry grill"}
          </Button>
        )}
      </div>

      <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
        {events.length === 0 && jobStatus === null && (
          <p className="text-sm text-shadow">Starting the grill session…</p>
        )}
        {events.length === 0 && jobStatus !== null && jobStatus !== "running" && (
          <p className="text-sm text-shadow">Waiting for the agent to start…</p>
        )}
        {events.map((event) => (
          <GrillEvent key={event.id} event={event} />
        ))}
        {jobStatus === "running" && !feature.awaitingUserInput && <ProcessingBubble />}
      </div>

      {feature.awaitingUserInput && jobStatus === "running" && (
        <div className="mt-4 flex gap-2">
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
      )}

      {stopped && (
        <p className="mt-4 text-sm text-red-400">
          Grill session {jobStatus === "cancelled" ? "cancelled" : "failed"}.
        </p>
      )}

      {actionError && <p className="mt-2 text-sm text-red-400">{actionError}</p>}
    </section>
  );
}

function GrillEvent({ event }: { event: FeatureEvent }) {
  switch (event.type) {
    case "ask_user":
      return <GrillBubble label="Agent" content={event.question ?? ""} />;
    case "agent_text":
      return <GrillBubble label="Agent" content={event.message ?? ""} />;
    case "submit_adr":
      return <GrillBubble label="Agent" content="Submitted the ADR for review." />;
    case "run_failed":
      return (
        <GrillBubble
          label="System"
          tone="error"
          content={event.message ?? "The grill session failed."}
        />
      );
    case "run_cancelled":
      return (
        <GrillBubble
          label="System"
          tone="error"
          content={event.message ?? "The grill session was cancelled."}
        />
      );
    case "user_message":
      return <GrillBubble label="You" tone="user" content={event.message ?? ""} />;
    default:
      return null;
  }
}

function GrillBubble({
  label,
  tone = "default",
  content,
}: {
  label: string;
  tone?: "default" | "error" | "user";
  content: string;
}) {
  return (
    <div className={`flex ${tone === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`w-[90%] rounded-md border p-3 ${
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
      <div className="w-[90%] rounded-md border border-rime-soft bg-surface-02 p-3">
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
