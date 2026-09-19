"use client";

import { useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "@/lib/config";
import {
  createLiveRelay,
  createRefreshCoalescer,
  liveSocketUrl,
  scopeSubscription,
  type LiveRelayStatus,
  type LiveScope,
} from "@/lib/features/live-relay";

/**
 * Subscribes a surface to the live relay for one scope and calls `onEvent` when
 * something changed (ADR 019; generalised by ADR 033 §3).
 *
 * **One hook where version 1 had two.** `useLiveFeatureRelay` and
 * `useLiveDesignRelay` were siblings, and the argument for keeping them apart was
 * that each named exactly one scope's frames with no branch that could mix them. That
 * reasoning was right about the danger and wrong about the remedy: the two hooks
 * differed only in which frames they sent and read, and under ADR 033 those frames
 * carry a *scope* rather than a scope in their name — so the difference is an
 * argument, and a shared hook parameterised by a scope value cannot conflate two
 * scopes any more than two functions could. What it does remove is the thing that
 * made the second scope expensive: a fourth surface needs no new hook, and
 * `relay-surfaces.ts` discovers surfaces by this one import.
 *
 * **What this deliberately does not do: hold state.** ADR 019 item 7 is explicit that
 * the socket is a *change signal*, not a state channel, and the reason is that a
 * second implementation of state in the browser can disagree with the API. So a frame
 * here means "re-read", never "here is the new value", and the caller keeps its
 * existing REST fetch untouched. A consequence worth stating: a socket that never
 * connects degrades to exactly the caller's non-relay behaviour, because `isLive` is
 * false and the caller polls as it always did.
 *
 * **The callbacks are held in refs, and that is load-bearing.** Every caller wants to
 * pass an inline arrow (`onEvent: () => void poll()`), which is a new function on
 * every render. If the socket effect depended on one, the socket would be torn down
 * and reopened on every parent render — the page would appear to work while
 * reconnecting constantly, and the relay would be *worse* than polling. Holding the
 * latest callbacks in refs means the socket opens once per `(projectId, scope)` and
 * callers need no `useCallback` or `eslint-disable-next-line`.
 *
 * Returns `isLive`, which is true only once the server has *confirmed* this
 * subscription. Not on `open`: an open socket that has not been accepted receives
 * nothing, so treating it as live would strand the caller on the slow safety interval
 * with no fast fallback.
 */
export function useLiveRelay(input: {
  projectId: string;
  /**
   * What to subscribe to. A value rather than flags, so this hook stays scope-blind
   * and a caller cannot pass a session id in a field named for a feature — the scope
   * carries its own kind.
   */
  scope: LiveScope;
  /** A relay frame arrived for this scope. Coalesced across bursts. */
  onEvent: () => void;
  /**
   * One streaming chunk of assistant text arrived (ADR 019 item 13).
   *
   * Optional, and *not* coalesced: a delta is text to append, not a signal to
   * re-read, so it is delivered as it arrives. Used by the grill transcript and, as
   * of issue #95, by the design-session view — the two surfaces whose content *is*
   * the agent's prose.
   */
  onDelta?: (text: string) => void;
}): { isLive: boolean; status: LiveRelayStatus } {
  const { projectId, scope } = input;
  const [status, setStatus] = useState<LiveRelayStatus>("off");

  // See the doc comment: the refs are what keep the socket open across renders.
  const onEventRef = useRef(input.onEvent);
  onEventRef.current = input.onEvent;
  const onDeltaRef = useRef(input.onDelta);
  onDeltaRef.current = input.onDelta;

  /*
   * The dependency list is the *identity* of the subscription, and both halves of it
   * are primitives so the effect does not re-run for a new object with the same
   * contents. `scope.kind` and `scope.id` rather than `scope`: a caller that builds
   * the scope inline (`scope={{ kind: "feature", id: featureId }}`) hands over a new
   * object every render, which would reopen the socket constantly.
   */
  const scopeKind = scope.kind;
  const scopeId = scope.id;

  useEffect(() => {
    const url = liveSocketUrl(apiBaseUrl(), window.location.origin);
    // An unparsable API base (a misconfigured NEXT_PUBLIC_API_BASE_URL) means no
    // socket. That is not an error path: the caller's own fetch and poll are already
    // the fallback, so this returns silently and `isLive` stays false.
    if (!url) return;

    // Coalesced because one agent turn can append several events within a few
    // milliseconds, and a re-read per frame would issue as many requests as polling
    // did — just in bursts.
    const refresh = createRefreshCoalescer({
      run: () => onEventRef.current(),
    });
    const relay = createLiveRelay({
      url,
      /*
       * The scope's protocol, from its one home in `lib/` so a test can exercise the
       * real thing rather than a copy of it — see the note on `LiveRelayDeps.protocol`.
       */
      protocol: scopeSubscription({ projectId, scope: { kind: scopeKind, id: scopeId } }),
      onEvent: () => refresh.trigger(),
      onDelta: (text) => onDeltaRef.current?.(text),
      onStatusChange: setStatus,
    });

    return () => {
      refresh.cancel();
      relay.stop();
    };
    // `onEvent`/`onDelta` are intentionally absent: they are reached through the refs
    // above, so a caller that passes a new function every render must not reopen the
    // socket.
  }, [projectId, scopeKind, scopeId]);

  return { isLive: status === "live", status };
}
