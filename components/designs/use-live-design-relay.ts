"use client";

import { useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "@/lib/config";
import {
  createLiveRelay,
  createRefreshCoalescer,
  designSessionEventFromFrame,
  liveSocketUrl,
  type LiveRelayStatus,
} from "@/lib/features/live-relay";

/**
 * Subscribes a **design-session**-scoped surface to the live relay (ADR 019, issue
 * #25) and calls `onEvent` when something changed.
 *
 * **A sibling of `useLiveFeatureRelay` rather than one hook doing both.** The two
 * differ in their protocol — `subscribe`/`subscribed`/`job_event` against
 * `subscribe_design`/`subscribed_design`/`design_session_event` — and the relay
 * itself was made protocol-blind so this choice is available: each hook names
 * exactly one scope's frames, and neither contains a branch that could mix them.
 * The shared part that genuinely must not be duplicated (the socket lifecycle:
 * detach-before-close, reconnect-from-close-only, backoff reset on success, the
 * app close codes, giving up) lives in `createLiveRelay` and is the same code for
 * both.
 *
 * **Why they are not one hook parameterised by a `kind`.** A single hook would put
 * both protocols in one file with a discriminant, which is the arrangement that
 * makes "treat the two frame shapes interchangeably" a plausible future edit. The
 * API chose a distinct `design_session_event` frame precisely so a session id is
 * never carried in a field named `featureId`; keeping the client sides physically
 * apart is the same decision, one layer up.
 *
 * **No `onDelta`, deliberately, and it is a real asymmetry rather than an
 * omission.** Streaming deltas are feature-scoped end to end: the Orchestrator's
 * publisher refuses a delta for a job with no `feature_id`
 * (`api/src/jobs/internal-routes.ts`, `publishDelta`), and the payload's topic is
 * derived from `featureId`. A `design_grill` job has no feature, so its prose
 * arrives as stored `agent_text` events — one per message, not one per token. The
 * page therefore updates per message rather than per token; see issue #93 for
 * whether that should change, since it is an API-side decision.
 *
 * **What this deliberately does not do: hold state.** ADR 019 item 7 — the socket
 * is a change signal, not a state channel, so a frame here means "re-read" and the
 * caller keeps its existing `fetchDesignEvents` untouched. A socket that never
 * connects degrades to exactly the caller's pre-relay behaviour, because `isLive`
 * is false and the caller polls as it always did.
 *
 * **The callback is held in a ref, and that is load-bearing** — the same reason as
 * the feature hook: `DesignSessionClient` passes an inline arrow, which is a new
 * function every render, and depending on it would reopen the socket constantly
 * while the page appeared to work.
 *
 * Returns `isLive`, true only once the server has *confirmed* this session. Not on
 * `open`: an open socket that has not been accepted receives nothing, so treating
 * it as live would strand the page on the slow safety interval with no fast
 * fallback.
 */
export function useLiveDesignRelay(input: {
  projectId: string;
  sessionId: string;
  /** A relay frame arrived for this session. Coalesced across bursts. */
  onEvent: () => void;
}): { isLive: boolean; status: LiveRelayStatus } {
  const { projectId, sessionId } = input;
  const [status, setStatus] = useState<LiveRelayStatus>("off");

  // See the doc comment: the ref is what keeps the socket open across renders.
  const onEventRef = useRef(input.onEvent);
  onEventRef.current = input.onEvent;

  useEffect(() => {
    const url = liveSocketUrl(apiBaseUrl(), window.location.origin);
    // An unparsable API base (a misconfigured NEXT_PUBLIC_API_BASE_URL) means no
    // socket. Not an error path: the caller's own fetch and poll are the fallback,
    // so this returns silently and `isLive` stays false.
    if (!url) return;

    // Coalesced because one agent turn appends several events within a few
    // milliseconds — a preview update plus its prose — and a re-read per frame
    // would issue as many requests as polling did, just in bursts.
    const refresh = createRefreshCoalescer({
      run: () => onEventRef.current(),
    });

    const relay = createLiveRelay({
      url,
      /*
       * The design protocol, named here so the relay never has to know which scope
       * it serves. The session id is echoed in `subscribed_design`, so it is
       * checked: a confirmation for another session cannot mark this socket live.
       */
      subscribeFrame: { type: "subscribe_design", projectId, sessionId },
      isSubscribed: (frame) =>
        frame.type === "subscribed_design" && frame.sessionId === sessionId,
      isEventFrame: (frame) => designSessionEventFromFrame(frame) !== null,
      onEvent: () => refresh.trigger(),
      onStatusChange: setStatus,
    });

    return () => {
      refresh.cancel();
      relay.stop();
    };
    // `onEvent` is intentionally absent: it is reached through the ref above, so a
    // caller that passes a new function every render must not reopen the socket.
  }, [projectId, sessionId]);

  return { isLive: status === "live", status };
}
