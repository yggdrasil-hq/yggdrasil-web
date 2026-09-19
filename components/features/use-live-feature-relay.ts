"use client";

import { useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "@/lib/config";
import {
  createLiveRelay,
  createRefreshCoalescer,
  featureSubscription,
  liveSocketUrl,
  type LiveRelayStatus,
} from "@/lib/features/live-relay";

/**
 * Subscribes a feature-scoped surface to the live job-event relay (ADR 019) and
 * calls `onEvent` when something changed.
 *
 * **Why this is a hook rather than wiring copied into each panel.** Three
 * surfaces now need the same thing — the grill transcript, the build-progress
 * panel, and the feature Testing tab — and the wiring is subtle enough that
 * three copies would drift: build the socket URL, coalesce bursts, keep REST as
 * the only state path, tear the socket down on unmount. Only the *interval* each
 * caller polls at differs, so that stays with the caller and this owns
 * "subscribe and tell me when to re-read".
 *
 * **What this deliberately does not do: hold state.** ADR 019 item 7 is explicit
 * that the socket is a *change signal*, not a state channel, and the reason is
 * that a second implementation of state in the browser can disagree with the API.
 * So a frame here means "re-read", never "here is the new value", and the caller
 * keeps its existing REST fetch untouched. A consequence worth stating: a socket
 * that never connects degrades to exactly the caller's non-relay behaviour,
 * because `isLive` is false and the caller polls as it always did.
 *
 * **The callback is held in a ref, and that is load-bearing.** Every caller wants
 * to pass an inline arrow (`onEvent: () => void poll()`), which is a new function
 * on every render. If the socket effect depended on it, the socket would be torn
 * down and reopened on every parent render — the page would appear to work while
 * reconnecting constantly, and the relay would be *worse* than polling. Holding
 * the latest callback in a ref means the socket opens once per
 * `(projectId, featureId)` and callers need no `useCallback` or
 * `eslint-disable-next-line`.
 *
 * Returns `isLive`, which is true only once the server has *confirmed* the
 * subscription for this feature. Not on `open`: an open socket that has not been
 * accepted receives nothing, so treating it as live would strand the caller on
 * the slow safety interval with no fast fallback.
 */
export function useLiveFeatureRelay(input: {
  projectId: string;
  featureId: string;
  /** A relay frame arrived for this feature. Coalesced across bursts. */
  onEvent: () => void;
  /**
   * One streaming chunk of assistant text arrived (ADR 019 item 13).
   *
   * Optional, and *not* coalesced: a delta is text to append, not a signal to
   * re-read, so it is delivered as it arrives. Only the grill transcript uses
   * this today — the surface whose content *is* the agent's prose.
   */
  onDelta?: (text: string) => void;
}): { isLive: boolean; status: LiveRelayStatus } {
  const { projectId, featureId } = input;
  const [status, setStatus] = useState<LiveRelayStatus>("off");

  // See the doc comment: the refs are what keep the socket open across renders.
  const onEventRef = useRef(input.onEvent);
  onEventRef.current = input.onEvent;
  const onDeltaRef = useRef(input.onDelta);
  onDeltaRef.current = input.onDelta;

  useEffect(() => {
    const url = liveSocketUrl(apiBaseUrl(), window.location.origin);
    // An unparsable API base (a misconfigured NEXT_PUBLIC_API_BASE_URL) means no
    // socket. That is not an error path: the caller's own fetch and poll are
    // already the fallback, so this returns silently and `isLive` stays false.
    if (!url) return;

    // Coalesced because one agent turn can append several events within a few
    // milliseconds, and a re-read per frame would issue as many requests as
    // polling did — just in bursts.
    const refresh = createRefreshCoalescer({
      run: () => onEventRef.current(),
    });
    const relay = createLiveRelay({
      url,
      /*
       * The feature protocol, from its one home in `lib/` so a test can exercise the
       * real thing rather than a copy of it — see the note on `LiveRelayDeps.protocol`.
       */
      protocol: featureSubscription({ projectId, featureId }),
      onEvent: () => refresh.trigger(),
      onDelta: (text) => onDeltaRef.current?.(text),
      onStatusChange: setStatus,
    });

    return () => {
      refresh.cancel();
      relay.stop();
    };
    // `onEvent` is intentionally absent: it is reached through the ref above, so
    // a caller that passes a new function every render must not reopen the socket.
  }, [projectId, featureId]);

  return { isLive: status === "live", status };
}
