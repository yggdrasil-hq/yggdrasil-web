"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelDesignSession,
  fetchDesignEvents,
  fetchProject,
  sendDesignMessage,
} from "@/lib/api";
import { appRoute } from "@/lib/config";
import {
  DESIGN_POLL_INTERVAL_MS,
  getLatestDesignSnapshot,
  isDesignReplyPending,
} from "@/lib/features/design";
import { pollIntervalMsForRelay } from "@/lib/features/live-relay";
import {
  countAgentTextEvents,
  shouldDropStreamBuffer,
} from "@/lib/features/grill-stream";
import type { DesignSession, FeatureEvent, Project } from "@/lib/features/types";
import { LoadFailure } from "@/components/ui/load-failure";
import { useLiveRelay } from "@/components/features/use-live-relay";

export function DesignSessionClient({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [session, setSession] = useState<DesignSession | null>(null);
  const [events, setEvents] = useState<FeatureEvent[]>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * Issue #95: the agent's prose arrives per *token* now, not per message.
   *
   * The buffer holds text that has arrived over the relay and is not yet in the
   * transcript. It is provisional by construction: the deltas for one message
   * concatenate to exactly the `agent_text` that supersedes them, so it is a preview
   * of a record that is about to exist rather than a record in its own right. The
   * rules that keep that true are **shared with the grill transcript** rather than
   * copied — `lib/features/grill-stream.ts` is generic over "an agent's prose,
   * streamed then persisted", and a second copy of the supersede rule is a second
   * thing to get subtly wrong.
   */
  const [streamingText, setStreamingText] = useState("");
  const agentTextCountRef = useRef(0);

  /*
   * A ref rather than the old effect-local `active` flag: `poll` is now shared by
   * two effects and by the relay's callback, so "is this component still mounted"
   * has to be readable from all of them. Without it a poll that resolves after
   * unmount sets state on a dead component.
   */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const poll = useCallback(async () => {
    try {
      const [projectData, eventData] = await Promise.all([
        fetchProject(projectId),
        fetchDesignEvents(projectId, sessionId),
      ]);
      if (!mountedRef.current) return;
      // The buffer's supersede rules live in `lib/features/grill-stream.ts` so they
      // are unit-testable; see that module for why each one is needed. Shared with
      // the grill rather than reimplemented — the same two ways of going stale apply
      // to any streamed-then-persisted message.
      const agentTextCount = countAgentTextEvents(eventData.events);
      if (
        shouldDropStreamBuffer({
          previousAgentTextCount: agentTextCountRef.current,
          agentTextCount,
          jobStatus: eventData.session.status,
        })
      ) {
        setStreamingText("");
      }
      agentTextCountRef.current = agentTextCount;
      setProject(projectData);
      setSession(eventData.session);
      setEvents(eventData.events);
      setError(null);
    } catch (pollError) {
      if (mountedRef.current) {
        setError(pollError instanceof Error ? pollError.message : "Failed to load design session");
      }
    }
  }, [projectId, sessionId]);

  /*
   * Issue #25: the design-session view moves from a 2s poll to the relay. The
   * frame is a *change signal* and nothing more (ADR 019 item 7) — `poll` above
   * stays the only state path, so a re-read is exactly what the interval used to
   * trigger, just at the moment something changed.
   *
   * ADR 033 §3: the hook takes a **scope** rather than a session id, so this page
   * and the grill differ by one argument and share one hook. The scope's id is the
   * session id, which is also the job id — that is how the REST route resolves it.
   *
   * Issue #95: `onDelta` is new here, and it is what makes this surface stream. A
   * design session's prose used to arrive per *message*, because the delta path was
   * feature-scoped end to end and a `design_grill` job has no feature — so it was
   * dropped at the publisher. Deltas now carry a scope like every other frame, so
   * there is nothing design-specific about this callback; it appends, exactly as the
   * grill's does.
   */
  const { isLive } = useLiveRelay({
    projectId,
    scope: { kind: "design_session", id: sessionId },
    onEvent: () => void poll(),
    onDelta: (text) => setStreamingText((previous) => previous + text),
  });

  /*
   * One effect, keyed on both the identity and the relay's status, so it restarts
   * — reading immediately — when either changes.
   *
   * Issue #98: this used to be two, with the immediate read in an effect keyed on
   * `[poll]` alone, and the justification given for the split was a **miscount**. It
   * said combining them would re-run the immediate read "two or three extra fetches
   * on mount, from `off` to `connecting` to `live`" — but `isLive` is a boolean
   * (`status === "live"`), so `off` and `connecting` are both false and the flag
   * flips **once** per successful connect. The cost is one fetch, and that fetch is
   * the point of it rather than the price of it: the server registers this
   * subscription only once the `subscribe` frame has been authorised, and the hub
   * keeps no backlog, so events published between the mount read and that
   * registration reach nobody. Reading again on the transition closes that window;
   * leaving it to the interval holds it open for up to `LIVE_SAFETY_POLL_INTERVAL_MS`.
   *
   * The Testing panel still keeps two effects, because there the loading state must
   * stay clear of the status change. This surface has no loading state, so there is
   * nothing to keep clear and one effect is the whole rule.
   * `src/features/relay-surfaces.test.ts` checks both shapes against it.
   */
  useEffect(() => {
    void poll();
    const interval = setInterval(
      () => void poll(),
      pollIntervalMsForRelay({ isLive, fallbackMs: DESIGN_POLL_INTERVAL_MS }),
    );
    return () => clearInterval(interval);
  }, [poll, isLive]);

  const snapshot = useMemo(() => {
    return getLatestDesignSnapshot(events);
  }, [events]);
  const paths = Object.keys(snapshot).sort();
  const activePath = selectedPath && snapshot[selectedPath] !== undefined ? selectedPath : paths[0] ?? null;
  const activeEvent = isDesignReplyPending(events)
    ? events[events.map((event) => event.type === "ask_user" && Boolean(event.question)).lastIndexOf(true)]
    : null;
  const running = session?.status === "pending" || session?.status === "running";

  async function handleSendReply() {
    const content = replyDraft.trim();
    if (!content) return;
    setSending(true);
    try {
      await sendDesignMessage(projectId, sessionId, content);
      setReplyDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelDesignSession(projectId, sessionId);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Failed to cancel session");
    } finally {
      setCancelling(false);
    }
  }

  if (error) {
    return <LoadFailure message={error} subject="design" />;
  }

  if (!project || !session) {
    return <div className="flex min-h-screen items-center justify-center text-mist">Loading design session…</div>;
  }

  return (
    <AppShell project={project}>
      <main className="flex min-h-[calc(100vh-1px)] flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rime-soft pb-5">
          <div>
            <Link href={appRoute(`/projects/${projectId}`)} className="text-sm text-shadow hover:text-frost">
              ← Back to project
            </Link>
            <h1 className="mt-3 text-2xl font-semibold text-frost">{session.name}</h1>
            <p className="mt-1 text-sm text-mist">{session.description}</p>
          </div>
          {running && (
            <Button variant="outline" size="sm" disabled={cancelling} onClick={() => void handleCancel()}>
              {cancelling ? "Cancelling…" : "Cancel"}
            </Button>
          )}
        </header>

        <div className="grid min-h-0 flex-1 gap-6 py-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.4fr)]">
          <section className="flex min-h-96 flex-col rounded-card border border-rime bg-surface-01 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-frost">Design conversation</h2>
              <span className="text-xs uppercase tracking-wider text-shadow">{session.status}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {events.map((event) => <DesignEvent key={event.id} event={event} />)}
              {running && streamingText ? (
                /*
                 * The growing bubble: the model's own words as they arrive. It is
                 * replaced, not appended to, the moment the finished message is
                 * persisted (see the supersede rule in `poll`), so the conversation
                 * never shows the same text twice. Mirrors the grill transcript's
                 * bubble, deliberately — the two surfaces now read the same way.
                 */
                <Bubble label="Agent" content={streamingText} />
              ) : null}
              {events.length === 0 && !streamingText && (
                <p className="text-sm text-shadow">Starting the design session…</p>
              )}
            </div>
            {activeEvent && running && (
              <div className="mt-4 flex gap-2">
                <Input
                  value={replyDraft}
                  onChange={(event) => setReplyDraft(event.target.value)}
                  placeholder="Reply to the agent…"
                  /* The placeholder is a hint, not a name — it disappears as soon
                     as the user types. Assistive-only, like the grill inputs. */
                  aria-label="Reply to the agent"
                  disabled={sending}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendReply();
                    }
                  }}
                />
                <Button disabled={sending || !replyDraft.trim()} onClick={() => void handleSendReply()}>
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            )}
            {error && <ErrorMessage className="mt-3 text-sm text-red-400">{error}</ErrorMessage>}
          </section>

          <section className="flex min-h-96 min-w-0 flex-col rounded-card border border-rime bg-surface-01 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-frost">Live preview</h2>
              {activePath && <span className="text-xs text-shadow">{activePath}</span>}
            </div>
            {paths.length > 0 ? (
              <>
                <div className="mb-3 flex gap-1 overflow-x-auto border-b border-rime-soft">
                  {paths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      className={`whitespace-nowrap px-3 py-2 text-xs ${path === activePath ? "border-b-2 border-mist text-frost" : "text-shadow hover:text-mist"}`}
                      onClick={() => setSelectedPath(path)}
                    >
                      {path}
                    </button>
                  ))}
                </div>
                <iframe
                  title={activePath ?? "Design preview"}
                  sandbox="allow-scripts"
                  srcDoc={activePath ? snapshot[activePath] : ""}
                  className="min-h-[32rem] flex-1 rounded-md border border-rime-soft bg-white"
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-rime-soft text-sm text-shadow">
                The agent’s first mockup will appear here.
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}

function DesignEvent({ event }: { event: FeatureEvent }) {
  if (event.type === "agent_text") return <Bubble label="Agent" content={event.message ?? ""} />;
  if (event.type === "ask_user") return <Bubble label="Agent" content={event.question ?? ""} />;
  if (event.type === "user_message") return <Bubble label="You" content={event.message ?? ""} user />;
  if (event.type === "update_design_preview") return <p className="text-xs text-shadow">Preview updated.</p>;
  if (event.type === "submit_design") return <p className="text-xs text-emerald-300">Design submitted for review.</p>;
  if (event.type === "run_failed" || event.type === "run_cancelled") {
    return <Bubble label="System" content={event.message ?? "The design session stopped."} error />;
  }
  return null;
}

function Bubble({ label, content, user = false, error = false }: {
  label: string;
  content: string;
  user?: boolean;
  error?: boolean;
}) {
  return (
    <div className={`flex ${user ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[92%] rounded-md border p-3 ${user ? "border-rime bg-surface-03" : "border-rime-soft bg-surface-02"}`}>
        <p className={`text-xs font-medium ${error ? "text-red-400" : "text-shadow"}`}>{label}</p>
        <Markdown content={content} className="mt-1" />
      </div>
    </div>
  );
}
