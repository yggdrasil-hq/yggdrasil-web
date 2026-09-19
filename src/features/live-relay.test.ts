import { describe, expect, it, vi } from "vitest";
import {
  LIVE_APP_CLOSE_PROTOCOL,
  LIVE_APP_CLOSE_UNAUTHORIZED,
  LIVE_DELTA_FRAME_TYPE,
  LIVE_MAX_RECONNECT_ATTEMPTS,
  LIVE_RECONNECT_BASE_MS,
  LIVE_RECONNECT_MAX_MS,
  LIVE_SAFETY_POLL_INTERVAL_MS,
  createLiveRelay,
  createRefreshCoalescer,
  deltaTextFromFrame,
  jobEventFromFrame,
  liveSocketUrl,
  parseLiveFrame,
  pollIntervalMsForRelay,
  reconnectDelayMs,
  type LiveSocket,
} from "@/lib/features/live-relay";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const FEATURE_ID = "33333333-3333-4333-8333-333333333333";

function makeSocket() {
  const sent: string[] = [];
  const socket = {
    readyState: 1,
    sent,
    closed: false,
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onclose: null as ((event: { code?: number }) => void) | null,
    onerror: null as (() => void) | null,
    send(data: string) {
      sent.push(data);
    },
    close() {
      socket.closed = true;
    },
  };
  return socket as typeof socket & LiveSocket;
}

/** Deterministic timers, so backoff is asserted rather than waited on. */
function makeScheduler() {
  const tasks: Array<{ run: () => void; delayMs: number; cancelled: boolean; ran: boolean }> = [];
  return {
    tasks,
    schedule(run: () => void, delayMs: number) {
      tasks.push({ run, delayMs, cancelled: false, ran: false });
      return tasks.length - 1;
    },
    cancel(handle: unknown) {
      const task = tasks[handle as number];
      if (task) task.cancelled = true;
    },
    run(handle: number) {
      const task = tasks[handle];
      if (!task || task.cancelled) return;
      task.ran = true;
      task.run();
    },
    pendingDelays: () => tasks.filter((task) => !task.cancelled && !task.ran).map((t) => t.delayMs),
  };
}

function buildRelay(options: { maxAttempts?: number } = {}) {
  const sockets: Array<ReturnType<typeof makeSocket>> = [];
  const scheduler = makeScheduler();
  const statuses: string[] = [];
  const onEvent = vi.fn();
  const onDelta = vi.fn();

  const relay = createLiveRelay({
    url: "ws://api.test/api/ws",
    projectId: PROJECT_ID,
    featureId: FEATURE_ID,
    onEvent,
    onDelta,
    onStatusChange: (status) => statuses.push(status),
    socketFactory: () => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    maxAttempts: options.maxAttempts ?? 3,
  });

  return {
    relay,
    sockets,
    scheduler,
    statuses,
    onEvent,
    onDelta,
    socket: () => sockets[sockets.length - 1],
  };
}

function subscribeFrame(): string {
  return JSON.stringify({ type: "subscribe", projectId: PROJECT_ID, featureId: FEATURE_ID });
}

function jobEventMessage() {
  return {
    data: JSON.stringify({
      type: "job_event",
      featureId: FEATURE_ID,
      jobId: "job_1",
      event: { id: "event_1", type: "agent_text", message: "hi", createdAt: "2026-09-18T10:00:00.000Z" },
    }),
  };
}

function deltaMessage(text: string) {
  return {
    data: JSON.stringify({
      type: LIVE_DELTA_FRAME_TYPE,
      featureId: FEATURE_ID,
      jobId: "job_1",
      text,
    }),
  };
}

describe("liveSocketUrl", () => {
  it("builds a ws URL from the relative API base used in dev", () => {
    // `/api` is how the app reaches the API behind nginx path routing, so the
    // socket must land on `/api/ws` — the same prefix every REST call uses.
    expect(liveSocketUrl("/api", "http://localhost:8080")).toBe("ws://localhost:8080/api/ws");
  });

  it("upgrades the scheme for an https origin", () => {
    expect(liveSocketUrl("/api", "https://app.example.com")).toBe(
      "wss://app.example.com/api/ws",
    );
  });

  it("handles an absolute API base on a different origin, as in a subdomain deploy", () => {
    expect(liveSocketUrl("https://api.example.com", "https://app.example.com")).toBe(
      "wss://api.example.com/ws",
    );
    expect(liveSocketUrl("https://api.example.com/", "https://app.example.com")).toBe(
      "wss://api.example.com/ws",
    );
  });

  it("drops any query or hash on the base", () => {
    expect(liveSocketUrl("/api?token=leak", "http://localhost:8080")).toBe(
      "ws://localhost:8080/api/ws",
    );
  });

  it("returns null for a base that cannot be parsed", () => {
    // A misconfigured base must degrade to polling, not throw inside a page.
    expect(liveSocketUrl("http://[", "http://localhost:8080")).toBeNull();
  });
});

describe("reconnectDelayMs", () => {
  it("doubles from the base delay", () => {
    expect(reconnectDelayMs(0)).toBe(LIVE_RECONNECT_BASE_MS);
    expect(reconnectDelayMs(1)).toBe(2 * LIVE_RECONNECT_BASE_MS);
    expect(reconnectDelayMs(2)).toBe(4 * LIVE_RECONNECT_BASE_MS);
  });

  it("caps at the maximum", () => {
    expect(reconnectDelayMs(20)).toBe(LIVE_RECONNECT_MAX_MS);
  });

  it("treats a negative attempt as the first attempt", () => {
    expect(reconnectDelayMs(-3)).toBe(LIVE_RECONNECT_BASE_MS);
  });
});

describe("parseLiveFrame", () => {
  it("parses a JSON object with a type", () => {
    expect(parseLiveFrame('{"type":"ready"}')).toEqual({ type: "ready" });
  });

  it("rejects non-strings, bad JSON, non-objects, and typeless frames", () => {
    expect(parseLiveFrame(undefined)).toBeNull();
    expect(parseLiveFrame(42)).toBeNull();
    expect(parseLiveFrame("{oops")).toBeNull();
    expect(parseLiveFrame("null")).toBeNull();
    expect(parseLiveFrame('{"noType":true}')).toBeNull();
  });
});

describe("jobEventFromFrame", () => {
  it("returns the event for a job_event frame", () => {
    const event = jobEventFromFrame({
      type: "job_event",
      event: { id: "event_1", type: "agent_text" },
    });
    expect(event).toMatchObject({ id: "event_1" });
  });

  it("returns null for other frames and for a missing payload", () => {
    expect(jobEventFromFrame({ type: "pong" })).toBeNull();
    expect(jobEventFromFrame({ type: "job_event" })).toBeNull();
    expect(jobEventFromFrame({ type: "job_event", event: null })).toBeNull();
  });
});

describe("createRefreshCoalescer", () => {
  it("collapses a burst into one run", () => {
    const scheduler = makeScheduler();
    const run = vi.fn();
    const coalescer = createRefreshCoalescer({ run, schedule: scheduler.schedule, cancel: scheduler.cancel });

    coalescer.trigger();
    coalescer.trigger();
    coalescer.trigger();
    expect(scheduler.tasks).toHaveLength(1);

    scheduler.run(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("allows a later burst to schedule again", () => {
    const scheduler = makeScheduler();
    const run = vi.fn();
    const coalescer = createRefreshCoalescer({ run, schedule: scheduler.schedule, cancel: scheduler.cancel });

    coalescer.trigger();
    scheduler.run(0);
    coalescer.trigger();
    expect(scheduler.tasks).toHaveLength(2);
    scheduler.run(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending run", () => {
    const scheduler = makeScheduler();
    const run = vi.fn();
    const coalescer = createRefreshCoalescer({ run, schedule: scheduler.schedule, cancel: scheduler.cancel });

    coalescer.trigger();
    coalescer.cancel();
    coalescer.cancel();
    scheduler.run(0);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("deltaTextFromFrame", () => {
  it("returns the text of a delta frame", () => {
    expect(
      deltaTextFromFrame({ type: LIVE_DELTA_FRAME_TYPE, featureId: FEATURE_ID, jobId: "job_1", text: "Hello " }),
    ).toBe("Hello ");
  });

  it("preserves whitespace, since the client concatenates", () => {
    // A chunk is often a single space or a newline; trimming here would corrupt
    // the streamed text in a way no later event could repair.
    expect(deltaTextFromFrame({ type: LIVE_DELTA_FRAME_TYPE, text: " " })).toBe(" ");
    expect(deltaTextFromFrame({ type: LIVE_DELTA_FRAME_TYPE, text: "\n\n" })).toBe("\n\n");
  });

  it("returns null for other frames, a missing text, and an empty text", () => {
    expect(deltaTextFromFrame({ type: "job_event" })).toBeNull();
    expect(deltaTextFromFrame({ type: "pong" })).toBeNull();
    expect(deltaTextFromFrame({ type: LIVE_DELTA_FRAME_TYPE })).toBeNull();
    expect(deltaTextFromFrame({ type: LIVE_DELTA_FRAME_TYPE, text: "" })).toBeNull();
    expect(deltaTextFromFrame({ type: LIVE_DELTA_FRAME_TYPE, text: 42 })).toBeNull();
  });

  it("does not confuse a delta with a stored event", () => {
    // The two are disjoint, and the client acts differently on each: one appends
    // text, the other re-reads. Mistaking one for the other would either drop
    // the stream or trigger a request per chunk.
    expect(jobEventFromFrame({ type: LIVE_DELTA_FRAME_TYPE, text: "x" })).toBeNull();
    expect(deltaTextFromFrame({ type: "job_event", event: {} })).toBeNull();
  });
});

describe("createLiveRelay: deltas", () => {
  it("signals each delta's text in order", () => {
    const { socket, onDelta } = buildRelay();
    socket().onopen?.();

    for (const text of ["Drafting ", "the ", "ADR."]) {
      socket().onmessage?.(deltaMessage(text));
    }

    expect(onDelta.mock.calls.map((call) => call[0])).toEqual(["Drafting ", "the ", "ADR."]);
  });

  it("does not trigger a re-read for a delta", () => {
    // A delta is text, not a state change: a re-read per chunk would issue as
    // many requests as the polling this replaced. onEvent is what drives the
    // coalesced refresh, and it must stay quiet here.
    const { socket, onEvent, onDelta } = buildRelay();
    socket().onopen?.();

    socket().onmessage?.(deltaMessage("chunk"));

    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("still signals stored events, so a finished message re-reads", () => {
    // The counterpart: the authoritative agent_text must still drive the refresh
    // that replaces the accumulated buffer.
    const { socket, onEvent, onDelta } = buildRelay();
    socket().onopen?.();

    socket().onmessage?.(jobEventMessage());

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onDelta).not.toHaveBeenCalled();
  });

  it("forwards a delta arriving before the subscribed ack", () => {
    // Deliberately not gated on the connection being `live`. The server only
    // publishes to sockets it has accepted for this feature, so a pre-ack delta
    // cannot happen in practice — and if it did, the text belongs to the very
    // feature this relay is scoped to, so forwarding it is preferable to
    // dropping it. Gating here would add a state check that buys nothing.
    const { socket, onDelta } = buildRelay();
    socket().onmessage?.(deltaMessage("early"));

    expect(onDelta).toHaveBeenCalledTimes(1);
  });

  it("works with no onDelta configured", () => {
    // The callback is optional: a caller that does not stream text must not have
    // to pass a stub, and a delta must not throw.
    const socket = makeSocket();
    const relay = createLiveRelay({
      url: "ws://api.test/api/ws",
      projectId: PROJECT_ID,
      featureId: FEATURE_ID,
      onEvent: vi.fn(),
      socketFactory: () => socket,
      schedule: () => 0,
      cancel: () => {},
    });

    socket.onopen?.();
    expect(() => socket.onmessage?.(deltaMessage("x"))).not.toThrow();
    relay.stop();
  });

  it("stops signalling deltas after stop", () => {
    const { relay, socket, onDelta } = buildRelay();
    socket().onopen?.();
    relay.stop();

    socket().onmessage?.(deltaMessage("late"));

    expect(onDelta).not.toHaveBeenCalled();
  });
});

describe("createLiveRelay", () => {
  it("subscribes to the feature on open", () => {
    const { socket } = buildRelay();
    socket().onopen?.();
    expect(socket().sent).toEqual([subscribeFrame()]);
  });

  it("reports connecting immediately and never live before the server confirms", () => {
    const { relay, socket, statuses } = buildRelay();
    // Construction starts the attempt synchronously, so the first status a
    // caller observes is already "connecting" — there is no window in which the
    // relay claims to be doing nothing while a socket is being opened.
    expect(relay.status()).toBe("connecting");
    expect(statuses).toEqual(["connecting"]);

    socket().onopen?.();
    expect(relay.status()).toBe("connecting");

    // An open socket that has not been accepted for this feature receives
    // nothing, so treating it as live would strand the page on the slow poll.
    socket().onmessage?.({ data: JSON.stringify({ type: "ready", protocolVersion: 1 }) });
    expect(relay.status()).toBe("connecting");
  });

  it("goes live only once subscribed", () => {
    const { relay, socket, statuses } = buildRelay();
    socket().onopen?.();
    socket().onmessage?.({ data: JSON.stringify({ type: "subscribed", featureId: FEATURE_ID }) });

    expect(relay.status()).toBe("live");
    expect(statuses).toEqual(["connecting", "live"]);
  });

  it("signals a change for a job_event and ignores other frames", () => {
    const { socket, onEvent } = buildRelay();
    socket().onopen?.();

    socket().onmessage?.({ data: JSON.stringify({ type: "pong" }) });
    socket().onmessage?.({ data: "not json" });
    expect(onEvent).not.toHaveBeenCalled();

    socket().onmessage?.(jobEventMessage());
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("reconnects with backoff after an ordinary close", () => {
    const { relay, socket, scheduler, statuses } = buildRelay();
    socket().onopen?.();
    socket().onmessage?.({ data: JSON.stringify({ type: "subscribed" }) });
    expect(relay.status()).toBe("live");

    socket().onclose?.({ code: 1006 });
    expect(relay.status()).toBe("off");
    expect(scheduler.pendingDelays()).toEqual([LIVE_RECONNECT_BASE_MS]);

    scheduler.run(0);
    expect(relay.status()).toBe("connecting");
  });

  it("backs off further on each successive failure", () => {
    const { socket, scheduler } = buildRelay();
    socket().onclose?.({ code: 1006 });
    scheduler.run(0);
    socket().onclose?.({ code: 1006 });
    scheduler.run(1);
    socket().onclose?.({ code: 1006 });

    expect(scheduler.tasks.map((task) => task.delayMs)).toEqual([
      LIVE_RECONNECT_BASE_MS,
      2 * LIVE_RECONNECT_BASE_MS,
      4 * LIVE_RECONNECT_BASE_MS,
    ]);
  });

  it("resets the backoff after a successful connection", () => {
    // A tab that blips once should not inherit a failure count from hours ago.
    const { socket, scheduler } = buildRelay();
    socket().onclose?.({ code: 1006 });
    scheduler.run(0);
    socket().onclose?.({ code: 1006 });
    scheduler.run(1);

    socket().onopen?.();
    socket().onclose?.({ code: 1006 });

    expect(scheduler.tasks[scheduler.tasks.length - 1].delayMs).toBe(LIVE_RECONNECT_BASE_MS);
  });

  it("stops retrying and stays off after the attempt budget is spent", () => {
    const { relay, socket, scheduler, onEvent } = buildRelay({ maxAttempts: 2 });

    socket().onclose?.({ code: 1006 });
    scheduler.run(0);
    socket().onclose?.({ code: 1006 });
    scheduler.run(1);
    socket().onclose?.({ code: 1006 });

    expect(relay.status()).toBe("off");
    expect(scheduler.pendingDelays()).toEqual([]);
    // Polling is untouched: this is the pre-relay behaviour, not a dead page.
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("does not retry a rejected credential", () => {
    // Retrying a 4401 would loop forever against a session that will never be
    // accepted; the page's REST calls surface the 401 and send the user to login.
    const { relay, socket, scheduler } = buildRelay();
    socket().onclose?.({ code: LIVE_APP_CLOSE_UNAUTHORIZED });

    expect(relay.status()).toBe("off");
    expect(scheduler.pendingDelays()).toEqual([]);
  });

  it("does not retry a protocol rejection", () => {
    const { relay, socket, scheduler } = buildRelay();
    socket().onclose?.({ code: LIVE_APP_CLOSE_PROTOCOL });

    expect(relay.status()).toBe("off");
    expect(scheduler.pendingDelays()).toEqual([]);
  });

  it("falls back to polling when a subscribe is refused", () => {
    const { relay, socket, scheduler } = buildRelay();
    socket().onopen?.();
    socket().onmessage?.({
      data: JSON.stringify({ type: "error", message: "Feature not found" }),
    });

    expect(relay.status()).toBe("off");
    expect(scheduler.pendingDelays()).toEqual([]);
    expect(socket().closed).toBe(true);
  });

  it("schedules a retry when the socket cannot even be constructed", () => {
    const scheduler = makeScheduler();
    const relay = createLiveRelay({
      url: "ws://api.test/api/ws",
      projectId: PROJECT_ID,
      featureId: FEATURE_ID,
      onEvent: vi.fn(),
      socketFactory: () => {
        throw new Error("blocked");
      },
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });

    expect(scheduler.pendingDelays()).toEqual([LIVE_RECONNECT_BASE_MS]);
    relay.stop();
  });

  it("ignores a stale socket's frames after reconnecting", () => {
    // Guards the `socket !== opened` checks: without them a late frame from the
    // previous socket could set the status of the new one.
    const { relay, sockets, scheduler } = buildRelay();
    sockets[0].onclose?.({ code: 1006 });
    scheduler.run(0);

    expect(sockets).toHaveLength(2);
    sockets[0].onmessage?.({ data: JSON.stringify({ type: "subscribed" }) });
    expect(relay.status()).toBe("connecting");

    sockets[1].onmessage?.({ data: JSON.stringify({ type: "subscribed" }) });
    expect(relay.status()).toBe("live");
  });

  it("does not schedule a reconnect for a socket it closed itself", () => {
    const { socket, scheduler } = buildRelay();
    socket().onclose?.({ code: 1006 });
    scheduler.run(0);
    const before = scheduler.tasks.length;

    socket().onclose?.({ code: 1006 });
    expect(scheduler.tasks.length).toBe(before + 1);
  });

  it("stops cleanly: closes the socket, cancels the retry, and is idempotent", () => {
    const { relay, socket, scheduler, onEvent } = buildRelay();
    socket().onopen?.();
    socket().onmessage?.({ data: JSON.stringify({ type: "subscribed" }) });
    socket().onclose?.({ code: 1006 });
    expect(scheduler.pendingDelays()).toHaveLength(1);

    relay.stop();
    relay.stop();

    expect(relay.status()).toBe("off");
    expect(scheduler.pendingDelays()).toEqual([]);

    // A cancelled retry must not resurrect the relay, and a stopped relay must
    // not keep signalling changes.
    scheduler.run(0);
    socket().onmessage?.(jobEventMessage());
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("closes the socket on stop", () => {
    const { relay, socket } = buildRelay();
    relay.stop();
    expect(socket().closed).toBe(true);
  });
});

describe("live poll intervals", () => {
  it("keeps the safety interval well above a reconnect delay", () => {
    // The two constants encode the same trade-off from different sides: a live
    // relay polls slowly, and a dead one retries slowly. Neither should be
    // tighter than a second, or a broken socket becomes a request flood.
    expect(LIVE_SAFETY_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(LIVE_RECONNECT_BASE_MS).toBeGreaterThanOrEqual(1_000);
    expect(LIVE_MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(1);
  });
});

describe("pollIntervalMsForRelay (issue #25)", () => {
  /*
   * The direction is the assertion. `isLive` must select the *slower* interval:
   * the socket removes the latency and the poll is only the safety net, so
   * getting this backwards leaves a connected surface polling at the fast rate
   * *on top of* the socket — strictly worse than before the relay existed, and
   * invisible to any test that only checks the page renders.
   */
  it("polls more slowly while the relay is live", () => {
    const fallbackMs = 2000;

    const live = pollIntervalMsForRelay({ isLive: true, fallbackMs });
    const offline = pollIntervalMsForRelay({ isLive: false, fallbackMs });

    expect(live).toBe(LIVE_SAFETY_POLL_INTERVAL_MS);
    expect(offline).toBe(fallbackMs);
    // Stated as an ordering as well, so the test still means something if either
    // constant is retuned: live must never be the faster of the two.
    expect(live).toBeGreaterThan(offline);
  });

  it("uses the caller's fallback when the relay is not live", () => {
    // The three converted surfaces have genuinely different fallbacks (2s for a
    // build, 5s for a testing tab), so the fallback is the caller's to choose
    // and must not be replaced by a shared default.
    expect(pollIntervalMsForRelay({ isLive: false, fallbackMs: 5000 })).toBe(5000);
    expect(pollIntervalMsForRelay({ isLive: false, fallbackMs: 2000 })).toBe(2000);
  });

  it("accepts an explicit safety interval, defaulting to the shared one", () => {
    expect(pollIntervalMsForRelay({ isLive: true, fallbackMs: 2000, safetyMs: 9000 })).toBe(9000);
    expect(pollIntervalMsForRelay({ isLive: true, fallbackMs: 2000 })).toBe(
      LIVE_SAFETY_POLL_INTERVAL_MS,
    );
  });
});
