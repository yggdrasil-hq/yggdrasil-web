import type { FeatureEvent } from "./types";

/**
 * The Web app's side of the live job-event relay (ADR 019).
 *
 * The relay is deliberately an *accelerator over the REST read*, not a second
 * source of truth. Frames carry an event and nothing else; derived state
 * (the feature's status, `awaitingUserInput`, `jobs.last_error`) is only ever
 * read from `fetchFeatureEvents`. Two consequences, both intended:
 *
 *  - A socket that never connects degrades to exactly the previous behaviour,
 *    because the poll loop is the same code path either way (the grill page
 *    polls at 2s when the relay is not live, and at a slow safety interval when
 *    it is).
 *  - Reconnecting needs no missed-event bookkeeping: **every** surface re-reads
 *    when the relay becomes live, so the REST read *is* the catch-up. That re-read
 *    is a dependency of each surface's poll effect on the live status, which is
 *    what makes the claim true here rather than only in the module that makes it:
 *    the subscription is registered server-side only once the `subscribe` frame
 *    has been authorised and the hub keeps no backlog, so the read at that moment
 *    is the only thing covering the window in between. The safety interval is the
 *    bound for a relay that never connects at all.
 *
 *    Issue #98: this said "the page re-reads on connect" when two of the four
 *    surfaces did not — they restarted the interval and read nothing — so the
 *    re-read is now the thing
 *    `src/features/relay-surfaces.test.ts` checks every subscribed surface for,
 *    rather than a property asserted from one place about four others.
 *
 * **Protocol version 2 (ADR 033).** Version 1 named the scope in the frame type —
 * `job_event`, `design_session_event`, `subscribe_design` — so every new scope cost
 * a frame name and a second reader on this side too. Every scope-bearing frame now
 * carries a `scope` value, one reader serves all of them, and the API replaced
 * version 1 rather than keeping both (ADR 033 §4). A version-1 client meeting a
 * version-2 API is answered with an `error` frame, which this module treats as
 * terminal and answers by falling back to the poll — proved by running, not assumed:
 * `api/scripts/verify-live-relay/verify.cjs` drives a version-1 frame at the real
 * socket and watches a real client degrade.
 */

/**
 * Must match the API's `LIVE_SOCKET_PATH`. A cross-repo contract with no shared
 * module (the two repos share no code), so it is named here and asserted in the
 * ADR rather than duplicated in more than one place per repo.
 */
export const LIVE_SOCKET_PATH = "/ws";

/**
 * How often the grill page re-reads while the relay is live. Not zero: a slow
 * safety net means a relay that silently stops delivering degrades to "a bit
 * stale" rather than "wrong forever", at a cost of one request per 30s.
 */
export const LIVE_SAFETY_POLL_INTERVAL_MS = 30_000;

/** Reconnect backoff: 1s, 2s, 4s … capped at 30s. */
export const LIVE_RECONNECT_BASE_MS = 1_000;
export const LIVE_RECONNECT_MAX_MS = 30_000;

/**
 * After this many consecutive failed attempts the client stops retrying and
 * leaves the page on the fast poll. The relay is optional, so a deployment that
 * never accepts the upgrade (or has it switched off) must not leave every tab
 * reconnecting forever.
 */
export const LIVE_MAX_RECONNECT_ATTEMPTS = 10;

/** Coalesces a burst of events into one REST re-read. */
export const LIVE_REFRESH_COALESCE_MS = 150;

/**
 * How often a relay-driven surface re-reads, given whether the relay is live.
 *
 * Issue #25 converted three surfaces (the grill transcript, the build-progress
 * panel, the feature Testing tab) and each one needs the same decision, so it
 * lives here rather than as an inline ternary repeated per component.
 *
 * **The direction is the whole point, and it is worth a test.** `isLive` must
 * select the *slower* interval: the socket is what removes the latency, and the
 * poll is only the safety net that keeps a silently-dead relay at "a bit stale"
 * instead of "wrong forever". Getting this backwards would leave a connected
 * surface polling every two seconds *on top of* the socket — strictly worse than
 * before the relay existed, and invisible in any test that only checked that the
 * page renders. `pollIntervalMsForRelay` asserts the ordering rather than
 * restating it.
 */
export function pollIntervalMsForRelay(input: {
  isLive: boolean;
  fallbackMs: number;
  safetyMs?: number;
}): number {
  return input.isLive ? (input.safetyMs ?? LIVE_SAFETY_POLL_INTERVAL_MS) : input.fallbackMs;
}

/**
 * Application close codes the API sends. Both mean "do not retry": a rejected
 * credential or a protocol mismatch will not fix itself by reconnecting, and
 * retrying would turn a single failure into a permanent loop.
 */
export const LIVE_APP_CLOSE_UNAUTHORIZED = 4401;
export const LIVE_APP_CLOSE_PROTOCOL = 4400;

/**
 * `"live"` means connected *and* subscribed to this socket's scope — the only
 * state in which the page can trust instant updates. `"off"` covers both "never
 * started" and "gave up", because the page treats them identically: poll normally.
 */
export type LiveRelayStatus = "off" | "connecting" | "live";

export interface LiveFrame {
  type: string;
  [key: string]: unknown;
}

/**
 * The subset of `WebSocket` this module uses, as plain handler properties so a
 * fake for tests is a few lines. `readyState`/`OPEN` are read from the real
 * constants via the `openState` option rather than assumed, since a fake will
 * not have them.
 */
export interface LiveSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number }) => void) | null;
  onerror: (() => void) | null;
}

/**
 * Builds the absolute `ws(s)://` URL for the relay from the API base the REST
 * calls already use, so the socket follows the same host, path prefix and
 * scheme as everything else — including a subdomain deploy, where the API is a
 * different origin than the app.
 *
 * Returns null when the base cannot be parsed. That is a real case (a
 * misconfigured `NEXT_PUBLIC_API_BASE_URL`) and the caller's correct response is
 * to skip the socket entirely and keep polling, not to throw inside a page.
 */
export function liveSocketUrl(apiBase: string, origin: string): string | null {
  try {
    const url = new URL(apiBase, origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/+$/, "")}${LIVE_SOCKET_PATH}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Backoff for reconnect attempt `attempt` (0-based), capped. */
export function reconnectDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(LIVE_RECONNECT_MAX_MS, LIVE_RECONNECT_BASE_MS * 2 ** safeAttempt);
}

/** Parses one server frame, returning null for anything unrecognisable. */
export function parseLiveFrame(raw: unknown): LiveFrame | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const frame = parsed as Record<string, unknown>;
  if (typeof frame.type !== "string") return null;
  return frame as LiveFrame;
}

/**
 * The kinds of thing a socket can subscribe to — **a closed union**, mirroring the
 * API's `LiveScopeKind` (`api/src/live/types.ts`), which is the authority (ADR 033).
 *
 * Duplicated across the two repos because they share no code, which is the same
 * situation `LIVE_SOCKET_PATH` is in, so it is named and documented rather than
 * inlined twice. A kind the API does not know cannot be sent from here: the union
 * has three members and there is no string path into `subscribe`.
 */
export type LiveScopeKind = "feature" | "design_session" | "test";

/**
 * One subscription: what kind of thing, and which one (ADR 033 §1).
 *
 * **The tag travels with the id, and that is what replaced version 1's frame
 * names.** Version 1 had `subscribe`/`subscribe_design`/`subscribe_test` and three
 * matching event frames, so each new scope cost a frame name and a second reader on
 * both sides. Here the id's meaning is carried by `kind`, so one frame shape serves
 * all three — and the reader can *check* that a frame belongs to the subscription it
 * made, which version 1's separate types could only imply.
 */
export interface LiveScope {
  kind: LiveScopeKind;
  id: string;
}

/** Whether two scopes name the same subscription. Mirrors the API's `scopesEqual`. */
export function scopesEqual(a: LiveScope, b: LiveScope): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * The event an `event` frame carries for **this** scope, or null.
 *
 * **One reader for every scope, with the scope checked rather than assumed.** Two
 * things are different from version 1, and both are deliberate:
 *
 *  - There is one reader where there were two (`jobEventFromFrame` and
 *    `designSessionEventFromFrame`), because there is now one frame. The old split
 *    existed to stop a session id flowing into something expecting a feature id; that
 *    protection is now the `scope` check below, which is stronger, because it rejects
 *    a *correctly-typed* frame for the wrong resource rather than only a wrong type.
 *  - **The scope is checked even though the server already routes per topic.** A
 *    socket is subscribed to one scope per hook instance, so a mismatched frame
 *    should be impossible — but "should be impossible" is what the frame's own tag
 *    lets us verify cheaply, and a dropped frame costs a re-read that will happen
 *    anyway on the next tick. Version 1 checked the echoed id on `subscribed` and
 *    nothing else; this checks every scope-bearing frame.
 *
 * Casting the payload rather than deep-validating it, as before: the frame comes from
 * the API over an authenticated socket and is treated exactly as trustingly as the
 * REST payload it approximates.
 */
export function eventFromFrame(frame: LiveFrame, scope: LiveScope): FeatureEvent | null {
  if (frame.type !== "event") return null;
  const frameScope = frame.scope;
  if (!isScopeFor(frameScope, scope)) return null;
  const event = frame.event;
  if (typeof event !== "object" || event === null) return null;
  return event as FeatureEvent;
}

/**
 * Whether a frame's `scope` field names exactly `scope`.
 *
 * Structural rather than a cast: a frame carrying `{kind: "test", id: …}` must not
 * satisfy a feature subscription, and comparing the whole pair is what makes that so.
 * The `id` comparison is not redundant with the `kind` one — the same uuid is a
 * feature id in one scope and a job id in another, which is the confusion the tagged
 * scope exists to remove.
 */
export function isScopeFor(value: unknown, scope: LiveScope): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === scope.kind && candidate.id === scope.id;
}

/**
 * The text a `delta` frame carries for this scope, or null.
 *
 * The frame name is `delta` in version 2 (it was `job_event_delta`), and it carries
 * the scope like every other scope-bearing frame — the API keeps `jobId` in the
 * *payload* for its byte ceiling, but the frame has only `{scope, text}`, because a
 * delta is text to append and the authoritative `agent_text` that supersedes it
 * carries the job.
 *
 * Returns null for an empty string as well as for a mismatch, matching version 1:
 * appending nothing is indistinguishable from a bug, and the frame is a preview of a
 * record that is about to exist.
 */
export function deltaTextFromFrame(frame: LiveFrame, scope: LiveScope): string | null {
  if (frame.type !== "delta") return null;
  if (!isScopeFor(frame.scope, scope)) return null;
  const text = frame.text;
  return typeof text === "string" && text !== "" ? text : null;
}

/**
 * What one socket's lifecycle needs to know about the scope it serves.
 *
 * Two facts now, where version 1 needed three: what frame subscribes, and which
 * frames belong to this socket. The separate "what frame confirms the subscription"
 * predicate is gone because the confirmation is not a different frame per scope — it
 * is `subscribed` carrying this scope, so the same predicate answers it.
 *
 * Keeping the protocol a *value* is what lets `createLiveRelay` stay protocol-blind:
 * it holds one of these and never branches on which scope it came from.
 */
export interface LiveProtocol {
  /** Sent verbatim on open, and again after every reconnect. */
  subscribeFrame: Record<string, unknown>;
  /** Whether a frame confirms **this** subscription, so the socket may be trusted. */
  isSubscribed: (frame: LiveFrame) => boolean;
  /** Whether a frame carries an event for this scope, and so means "re-read". */
  isEventFrame: (frame: LiveFrame) => boolean;
  /** The streaming text this frame carries for this scope, or null (ADR 019 item 13). */
  deltaText: (frame: LiveFrame) => string | null;
}

/**
 * The protocol for one scope: `subscribe` / `subscribed` / `event`, all scope-tagged
 * (ADR 033 §1).
 *
 * **One builder where version 1 had `featureSubscription` and
 * `designSubscription`.** The two differed in exactly the frames they sent and read,
 * and every one of those now carries a scope instead — so the difference is the
 * scope, which is an argument. ADR 033 §3's claim is that a new scope costs data
 * rather than a protocol, and this function is where that is true or not: adding
 * `test` here needs no edit at all.
 *
 * **The scope is checked on the confirmation.** The server echoes the scope it
 * accepted, so a `subscribed` naming another resource is a server bug rather than a
 * shape to tolerate; treating it as live would leave the page on the 30s safety
 * interval receiving nothing, which looks identical to a quiet session until someone
 * times it. Being stricter than the server here fails *safe*: an unrecognised
 * confirmation degrades to the poll that worked before the relay existed.
 */
export function scopeSubscription(input: {
  projectId: string;
  scope: LiveScope;
}): LiveProtocol {
  return {
    subscribeFrame: { type: "subscribe", projectId: input.projectId, scope: input.scope },
    isSubscribed: (frame) => frame.type === "subscribed" && isScopeFor(frame.scope, input.scope),
    isEventFrame: (frame) => eventFromFrame(frame, input.scope) !== null,
    deltaText: (frame) => deltaTextFromFrame(frame, input.scope),
  };
}

export interface LiveRelayDeps {
  url: string;
  /**
   * How to subscribe this socket, and how to read what comes back.
   *
   * **Why the protocol is a value rather than a scope flag.** The relay owns one
   * socket's lifecycle and nothing else: it should not know which scope it serves,
   * because a `kind` branch here would put the scopes' frames in the one file they
   * all share, which is a branch away from being conflated. As a value, the caller
   * names exactly one scope and this file cannot tell which it was.
   *
   * Built by `scopeSubscription` rather than inline in the hook, so the protocol has
   * one home a test can exercise directly. The hook is a React binding and this repo
   * has no React testing library by design, so a protocol written inline in a hook is
   * only ever covered by a *copy* of itself — which is exactly what happened once,
   * and why the comment on that note survives in `live-relay-design.test.ts`.
   */
  protocol: LiveProtocol;
  /** An `event` frame arrived for whatever scope this socket subscribed to. */
  onEvent: () => void;
  /**
   * One streaming chunk of assistant text arrived (ADR 019 item 13).
   *
   * Optional because the caller may have nothing to stream into — the relay is
   * still useful without deltas, and a deployment with them switched off simply
   * never fires this.
   */
  onDelta?: (text: string) => void;
  onStatusChange?: (status: LiveRelayStatus) => void;
  socketFactory?: (url: string) => LiveSocket;
  schedule?: (run: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
  maxAttempts?: number;
}

export interface LiveRelay {
  status(): LiveRelayStatus;
  stop(): void;
}

/**
 * Keeps one socket connected and subscribed for one scope — a feature or a design
 * session, depending on the frames the caller supplies.
 *
 * Every branch here is about *not breaking the page*: a socket that fails to
 * connect, fails mid-run, is refused, or misbehaves in any way must leave the
 * caller polling, and the caller must be able to tell the difference so it can
 * pick the poll interval. `stop()` is safe to call twice and is what the React
 * effect's cleanup uses.
 *
 * **Teardown closes the socket without an `unsubscribe` frame.** The server removes
 * the connection — and therefore every subscription on it — on `close`
 * (`api/src/live/socket.ts`), so the frame would be redundant, and a second teardown
 * path is a second thing to get wrong. `unsubscribe` exists for a client that stays
 * connected while dropping one subscription, which no surface here does.
 */
export function createLiveRelay(deps: LiveRelayDeps): LiveRelay {
  const socketFactory = deps.socketFactory ?? ((url: string) => new WebSocket(url) as LiveSocket);
  const schedule = deps.schedule ?? ((run, delayMs) => setTimeout(run, delayMs));
  const cancel = deps.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const maxAttempts = deps.maxAttempts ?? LIVE_MAX_RECONNECT_ATTEMPTS;

  let socket: LiveSocket | null = null;
  let attempt = 0;
  let pendingRetry: unknown = null;
  let stopped = false;
  let current: LiveRelayStatus = "off";

  function setStatus(next: LiveRelayStatus): void {
    if (current === next) return;
    current = next;
    deps.onStatusChange?.(next);
  }

  function teardown(): void {
    if (socket) {
      // Detach before closing so the close handler cannot schedule a reconnect
      // for a socket we are deliberately discarding.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // Closing an already-dead socket is not an error worth reporting.
      }
      socket = null;
    }
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    if (attempt >= maxAttempts) {
      // Give up rather than reconnect forever; the page's fast poll is already
      // running and is the pre-relay behaviour.
      setStatus("off");
      return;
    }
    const delay = reconnectDelayMs(attempt);
    attempt += 1;
    pendingRetry = schedule(() => {
      pendingRetry = null;
      connect();
    }, delay);
  }

  function connect(): void {
    if (stopped) return;
    setStatus("connecting");

    let opened: LiveSocket;
    try {
      opened = socketFactory(deps.url);
    } catch {
      // A constructor that throws (an unsupported scheme, a blocked socket) is
      // the same outcome as a failed connection.
      scheduleReconnect();
      return;
    }
    socket = opened;

    opened.onopen = () => {
      if (stopped || socket !== opened) return;
      // Reset on success so a long-lived tab that reconnects after a blip
      // starts its backoff over rather than inheriting an old failure count.
      attempt = 0;
      try {
        opened.send(JSON.stringify(deps.protocol.subscribeFrame));
      } catch {
        // The close handler will pick this up and retry.
      }
    };

    opened.onmessage = (event) => {
      if (stopped || socket !== opened) return;
      const frame = parseLiveFrame(event.data);
      if (!frame) return;

      if (deps.protocol.isSubscribed(frame)) {
        // "live" only once the server has confirmed this subscription, never on
        // open alone: an open socket that has not been accepted receives nothing,
        // so treating it as live would strand the page on the slow safety poll
        // with no fast fallback.
        setStatus("live");
        return;
      }
      if (frame.type === "error") {
        // A subscribe refusal is not retryable — the same request will be
        // refused again. Fall back to polling and leave the socket closed.
        stop();
        return;
      }

      // Deltas are checked before stored events, though the two frame types are
      // disjoint: keeping the provisional path first makes it obvious in the
      // read order that a delta is never a state change, only text.
      const delta = deps.protocol.deltaText(frame);
      if (delta !== null) {
        deps.onDelta?.(delta);
        return;
      }

      if (deps.protocol.isEventFrame(frame)) deps.onEvent();
    };

    // Reconnect from close only: real sockets fire `error` immediately before
    // `close`, so handling both would double-schedule every failure.
    opened.onclose = (event) => {
      if (stopped || socket !== opened) return;
      setStatus("off");
      socket = null;
      if (
        event?.code === LIVE_APP_CLOSE_UNAUTHORIZED ||
        event?.code === LIVE_APP_CLOSE_PROTOCOL
      ) {
        stop();
        return;
      }
      scheduleReconnect();
    };

    opened.onerror = () => {
      // Nothing to do: `close` follows and owns the retry decision.
    };
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (pendingRetry !== null) {
      cancel(pendingRetry);
      pendingRetry = null;
    }
    teardown();
    setStatus("off");
  }

  connect();

  return {
    status: () => current,
    stop,
  };
}

export interface RefreshCoalescer {
  trigger(): void;
  cancel(): void;
}

/**
 * Collapses a burst of relay frames into one re-read.
 *
 * A burst is normal rather than exceptional — one agent turn can append several
 * events in a few milliseconds, and a test run reports many steps — and a
 * refresh per frame would make the socket *cheaper-looking* while issuing the
 * same number of requests as polling, only burstier.
 */
export function createRefreshCoalescer(deps: {
  run: () => void;
  delayMs?: number;
  schedule?: (run: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
}): RefreshCoalescer {
  const delayMs = deps.delayMs ?? LIVE_REFRESH_COALESCE_MS;
  const schedule = deps.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancelScheduled =
    deps.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let pending: unknown = null;

  return {
    trigger(): void {
      // Leading-edge suppression only: one timer at a time, and a frame
      // arriving while one is pending extends nothing — the sweep that is
      // already booked will read the newer state anyway.
      if (pending !== null) return;
      pending = schedule(() => {
        pending = null;
        deps.run();
      }, delayMs);
    },
    cancel(): void {
      if (pending === null) return;
      cancelScheduled(pending);
      pending = null;
    },
  };
}
