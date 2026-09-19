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
 * The event a `job_event` frame carries, or null. Cast rather than fully
 * validated: the frame comes from the API, and the page treats the payload
 * exactly as it treats an event from the REST read (which is also trusted), so
 * re-validating one and not the other would be inconsistent.
 */
export function jobEventFromFrame(frame: LiveFrame): FeatureEvent | null {
  if (frame.type !== "job_event") return null;
  const event = frame.event;
  if (typeof event !== "object" || event === null) return null;
  return event as FeatureEvent;
}

/**
 * The event a `design_session_event` frame carries, or null (issue #25).
 *
 * **Deliberately a separate reader rather than a generalisation of
 * `jobEventFromFrame`.** The two frames differ in exactly one way that matters —
 * the scope field is `sessionId` where the feature frame's is `featureId` — and a
 * shared helper taking "either one" would be the confusion the distinct frame type
 * exists to prevent: a caller could stop asking which frame it holds, and a session
 * id would silently flow into something expecting a feature id. Two readers mean a
 * reader of either hook sees exactly one protocol.
 *
 * The `sessionId` on the frame is not checked against the subscribed session: the
 * socket is subscribed to one topic per hook instance, and the feature path takes
 * the same approach. `lib/features/live-relay.test.ts` asserts the two readers do
 * not accept each other's frames, which is the property that actually needs
 * guarding.
 */
export function designSessionEventFromFrame(frame: LiveFrame): FeatureEvent | null {
  if (frame.type !== "design_session_event") return null;
  const event = frame.event;
  if (typeof event !== "object" || event === null) return null;
  return event as FeatureEvent;
}

/**
 * The frame carrying one streaming chunk of assistant text (ADR 019 item 13).
 * Reserved in the protocol from the start; the client ignores unknown frames, so
 * a server that predates it simply never sends one.
 */
export const LIVE_DELTA_FRAME_TYPE = "job_event_delta";

/**
 * The text a delta frame carries, or null.
 *
 * Mirrors `jobEventFromFrame`: casts rather than deep-validating, because the
 * frame comes from the API over an already-authenticated socket and is treated
 * exactly as trustingly as the REST payload it approximates.
 */
export function deltaTextFromFrame(frame: LiveFrame): string | null {
  if (frame.type !== LIVE_DELTA_FRAME_TYPE) return null;
  const text = frame.text;
  return typeof text === "string" && text !== "" ? text : null;
}

/**
 * What one socket's lifecycle needs to know about the scope it serves.
 *
 * Three facts, all scope-specific: what frame subscribes, what frame confirms it,
 * and what frame means "something changed". Keeping them together is what lets
 * `createLiveRelay` be protocol-blind — it holds one of these and never branches on
 * which scope it came from.
 */
export interface LiveProtocol {
  /** Sent verbatim on open, and again after every reconnect. */
  subscribeFrame: Record<string, unknown>;
  /** Whether a frame confirms **this** subscription, so the socket may be trusted. */
  isSubscribed: (frame: LiveFrame) => boolean;
  /** Whether a frame carries an event for this scope, and so means "re-read". */
  isEventFrame: (frame: LiveFrame) => boolean;
}

/**
 * The feature protocol: `subscribe` / `subscribed` / `job_event` (ADR 019).
 *
 * **The echoed id is checked on the confirmation.** The server always sends it —
 * `safeSend(connection, { type: "subscribed", featureId })`
 * (`api/src/live/socket.ts`) — and the frame type declares it as required, so a
 * `subscribed` naming another feature is a server bug rather than a shape to
 * tolerate. Treating it as live would leave the page on the 30s safety interval
 * receiving nothing, which looks identical to a quiet session until someone times
 * it. Being stricter than the server here fails *safe*: an unrecognised
 * confirmation degrades to the fast poll that worked before the relay existed.
 */
export function featureSubscription(input: {
  projectId: string;
  featureId: string;
}): LiveProtocol {
  return {
    subscribeFrame: { type: "subscribe", projectId: input.projectId, featureId: input.featureId },
    isSubscribed: (frame) =>
      frame.type === "subscribed" && frame.featureId === input.featureId,
    isEventFrame: (frame) => jobEventFromFrame(frame) !== null,
  };
}

/**
 * The design-session protocol: `subscribe_design` / `subscribed_design` /
 * `design_session_event` (issue #25).
 *
 * The peer of `featureSubscription`, and separate rather than parameterised for the
 * reason the API gave the frame its own name: a session id must never travel where
 * a feature id is expected, and two protocols in one function is the arrangement
 * that invites exactly that.
 *
 * Note there is **no delta** path: streaming deltas are feature-scoped end to end
 * (`publishDelta` refuses a job with no `feature_id`), so a design session's prose
 * arrives as stored `agent_text` events — per message, not per token. Issue #95.
 */
export function designSubscription(input: {
  projectId: string;
  sessionId: string;
}): LiveProtocol {
  return {
    subscribeFrame: {
      type: "subscribe_design",
      projectId: input.projectId,
      sessionId: input.sessionId,
    },
    isSubscribed: (frame) =>
      frame.type === "subscribed_design" && frame.sessionId === input.sessionId,
    isEventFrame: (frame) => designSessionEventFromFrame(frame) !== null,
  };
}

export interface LiveRelayDeps {
  url: string;
  /**
   * How to subscribe this socket, and how to read what comes back.
   *
   * **Why the protocol is a value rather than a scope flag.** There are two
   * protocols now — `subscribe`/`subscribed`/`job_event` for a feature (ADR 019) and
   * `subscribe_design`/`subscribed_design`/`design_session_event` for a design
   * session (issue #25) — and the relay should know neither. It owns one socket's
   * lifecycle and nothing else; a `kind` branch checked here would hold both
   * protocols in the one file both scopes share, which is a branch away from being
   * conflated. As a value, each hook names exactly one protocol and this file
   * cannot tell them apart.
   *
   * Built by `featureSubscription`/`designSubscription` rather than inline in each
   * hook, so the protocol has one home that a test can exercise directly. A hook is
   * a React binding and this repo has no React testing library by design, so a
   * protocol written inline in a hook is only ever covered by a *copy* of itself.
   */
  protocol: LiveProtocol;
  /** A `job_event`/`design_session_event` arrived for whatever this socket subscribed to. */
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
 * **Teardown closes the socket without an `unsubscribe` frame**, for both scopes.
 * The server removes the connection — and therefore every subscription on it — on
 * `close` (`api/src/live/socket.ts`), so the frame would be redundant, and a
 * second teardown path is a second thing to get wrong. The `unsubscribe` /
 * `unsubscribe_design` frames exist for a client that stays connected while
 * dropping one subscription, which neither hook does.
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
      const delta = deltaTextFromFrame(frame);
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
