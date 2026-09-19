import { describe, expect, it, vi } from "vitest";
import {
  createLiveRelay,
  designSessionEventFromFrame,
  designSubscription,
  jobEventFromFrame,
  pollIntervalMsForRelay,
  type LiveFrame,
  type LiveSocket,
} from "@/lib/features/live-relay";
import { DESIGN_POLL_INTERVAL_MS } from "@/lib/features/design";

/**
 * Issue #25's client side: the **design-session** half of the relay.
 *
 * A separate file from `live-relay.test.ts` because the two scopes are deliberately
 * not interchangeable, and the first block below is what enforces that. The API
 * emits `design_session_event` rather than a `job_event` carrying a session id in
 * `featureId`, precisely so a session id is never mistaken for a feature id; these
 * tests hold the client to the same standard, and the ones after them cover the
 * protocol the design hook actually speaks.
 */

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_SESSION_ID = "55555555-5555-4555-8555-555555555555";
const FEATURE_ID = "33333333-3333-4333-8333-333333333333";

function designFrame(overrides: Record<string, unknown> = {}): LiveFrame {
  return {
    type: "design_session_event",
    sessionId: SESSION_ID,
    event: {
      id: "event_1",
      type: "agent_text",
      message: "Drafting the shell",
      createdAt: "2026-09-18T10:00:00.000Z",
    },
    ...overrides,
  };
}

function featureFrame(): LiveFrame {
  return {
    type: "job_event",
    featureId: FEATURE_ID,
    jobId: "job_1",
    event: { id: "event_2", type: "agent_text", message: "hi", createdAt: "2026-09-18T10:00:00.000Z" },
  };
}

/*
 * The property the distinct frame type exists for, asserted in both directions.
 *
 * Without this, the two readers could drift into one — e.g. a future "read whatever
 * event a frame carries" helper — and a session id would flow into code expecting a
 * feature id (or the reverse) with nothing failing. Each direction is a separate
 * `it` so a report names which one broke.
 */
describe("the two event readers are not interchangeable (#25)", () => {
  it("does not read a design session event as a job event", () => {
    expect(jobEventFromFrame(designFrame())).toBeNull();
  });

  it("does not read a job event as a design session event", () => {
    expect(designSessionEventFromFrame(featureFrame())).toBeNull();
  });

  it("returns the event a design frame carries", () => {
    expect(designSessionEventFromFrame(designFrame())?.message).toBe("Drafting the shell");
  });

  it("ignores a design frame whose event is not an object", () => {
    // The reader casts rather than deep-validating (the frame is from the API over
    // an authenticated socket), so the one thing it must not do is hand back a
    // non-object as an event.
    expect(designSessionEventFromFrame(designFrame({ event: "nope" }))).toBeNull();
    expect(designSessionEventFromFrame(designFrame({ event: null }))).toBeNull();
  });

  it("ignores an unknown frame type", () => {
    expect(designSessionEventFromFrame({ type: "subscribed_design", sessionId: SESSION_ID })).toBeNull();
    expect(jobEventFromFrame({ type: "subscribed", featureId: FEATURE_ID })).toBeNull();
  });
});

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

interface Scheduled {
  run: () => void;
  delayMs: number;
  cancelled: boolean;
  ran: boolean;
}

function makeScheduler() {
  const tasks: Scheduled[] = [];
  return {
    schedule: (run: () => void, delayMs: number) => {
      const task: Scheduled = { run, delayMs, cancelled: false, ran: false };
      tasks.push(task);
      return task;
    },
    cancel: (handle: unknown) => {
      (handle as Scheduled).cancelled = true;
    },
    tasks,
  };
}

/**
 * The design protocol comes from its real home in `lib/` rather than being restated
 * here, and that is a correction rather than a tidy-up.
 *
 * An earlier version of this file spelled the frames out inline. It passed — but it
 * was verifying a *copy* of the protocol while the hook's own copy was uncovered:
 * mutating the hook's `isSubscribed` to drop the session-id check changed nothing.
 * That is the "a test that builds its own app only tests its own app" shape
 * (#84), and the fix is to have one implementation both sides consume.
 *
 * The factory is also asserted directly below, for the same reason: a protocol
 * written into a React hook is unreachable by tests, because this repo has no React
 * testing library by design.
 */
function designProtocol() {
  return designSubscription({ projectId: PROJECT_ID, sessionId: SESSION_ID });
}

describe("designSubscription (#25)", () => {
  const protocol = designProtocol();

  it("subscribes by naming the project and the session", () => {
    expect(protocol.subscribeFrame).toEqual({
      type: "subscribe_design",
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
    });
  });

  it("accepts only a confirmation naming this session", () => {
    expect(protocol.isSubscribed({ type: "subscribed_design", sessionId: SESSION_ID })).toBe(true);
    expect(
      protocol.isSubscribed({ type: "subscribed_design", sessionId: OTHER_SESSION_ID }),
    ).toBe(false);
  });

  it("does not accept a feature's confirmation", () => {
    // The cross-scope case, and the reason the two protocols are separate functions
    // rather than one parameterised by a flag.
    expect(protocol.isSubscribed({ type: "subscribed", featureId: SESSION_ID })).toBe(false);
  });

  it("treats only a design session event as a change", () => {
    expect(protocol.isEventFrame(designFrame())).toBe(true);
    expect(protocol.isEventFrame(featureFrame())).toBe(false);
  });
});

function buildRelay() {
  const sockets: Array<ReturnType<typeof makeSocket>> = [];
  const scheduler = makeScheduler();
  const statuses: string[] = [];
  const onEvent = vi.fn();

  const relay = createLiveRelay({
    url: "ws://api.test/api/ws",
    protocol: designProtocol(),
    onEvent,
    onStatusChange: (status) => statuses.push(status),
    socketFactory: () => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    maxAttempts: 3,
  });

  return {
    relay,
    scheduler,
    statuses,
    onEvent,
    socket: () => sockets[sockets.length - 1],
  };
}

describe("createLiveRelay, design-session scope (#25)", () => {
  it("sends subscribe_design with the project and session on open", () => {
    const { socket } = buildRelay();

    socket().onopen?.();

    expect(socket().sent.map((raw) => JSON.parse(raw))).toContainEqual({
      type: "subscribe_design",
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
    });
  });

  it("becomes live only on a confirmation for this session", () => {
    const { socket, statuses } = buildRelay();

    socket().onopen?.();
    expect(statuses.at(-1)).toBe("connecting");

    socket().onmessage?.({
      data: JSON.stringify({ type: "subscribed_design", sessionId: SESSION_ID }),
    });

    expect(statuses.at(-1)).toBe("live");
  });

  /*
   * The id check, which the feature hook also gained. A confirmation naming a
   * different session must not mark this socket live: the page would then sit on
   * the 30s safety interval while receiving nothing, which looks identical to a
   * quiet session until someone times it.
   */
  it("does not become live on a confirmation for a different session", () => {
    const { socket, statuses } = buildRelay();

    socket().onopen?.();
    socket().onmessage?.({
      data: JSON.stringify({ type: "subscribed_design", sessionId: OTHER_SESSION_ID }),
    });

    expect(statuses.at(-1)).toBe("connecting");
  });

  it("signals a re-read for a design session event", () => {
    const { socket, onEvent } = buildRelay();

    socket().onopen?.();
    socket().onmessage?.({ data: JSON.stringify(designFrame()) });

    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  /*
   * **The regression test for the bug this conversion nearly shipped.** The relay
   * used to decide "an event arrived" with `jobEventFromFrame`, hardcoded for the
   * feature scope. A design socket would then receive `design_session_event` frames
   * it could not recognise and *never signal a re-read* — the page would look
   * subscribed, sit on the 30s safety interval, and appear to work while every
   * update arrived up to 30 seconds late. Nothing but timing would reveal it.
   *
   * So this asserts the negative: a feature frame on a design socket is ignored, and
   * the design frame is what triggers.
   */
  it("does not signal a re-read for a feature frame on a design socket", () => {
    const { socket, onEvent } = buildRelay();

    socket().onopen?.();
    socket().onmessage?.({ data: JSON.stringify(featureFrame()) });

    expect(onEvent).not.toHaveBeenCalled();

    // …and the design frame still does, so the assertion above cannot be passing
    // because the socket is inert for some unrelated reason.
    socket().onmessage?.({ data: JSON.stringify(designFrame()) });
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("falls back to polling and gives up when the subscription is refused", () => {
    const { socket, statuses, scheduler } = buildRelay();

    socket().onopen?.();
    socket().onmessage?.({
      data: JSON.stringify({ type: "error", message: "Design session not found" }),
    });

    // `off` rather than `connecting`: a refusal is not retryable, so the page must
    // be on its own fast poll rather than waiting for a socket that will never be
    // accepted.
    expect(statuses.at(-1)).toBe("off");
    expect(scheduler.tasks.filter((task) => !task.cancelled)).toHaveLength(0);
  });

  it("closes the socket on teardown without sending unsubscribe_design", () => {
    // The server removes the connection — and every subscription on it — on close
    // (`api/src/live/socket.ts`), so the frame would be redundant, and the feature
    // path takes the same approach. Asserted so a future "tidy" addition of the
    // frame is a deliberate choice rather than a silent one.
    const { socket, relay } = buildRelay();

    socket().onopen?.();
    relay.stop();

    expect(socket().closed).toBe(true);
    expect(socket().sent.some((raw) => raw.includes("unsubscribe"))).toBe(false);
  });
});

describe("the design fallback interval (#25)", () => {
  /*
   * The same rule the other converted surfaces assert, tied to *this* surface's
   * fallback constant so the design view cannot quietly acquire a fast poll while
   * live. Getting the direction backwards leaves a connected surface polling at 2s
   * on top of the socket — strictly worse than before the relay existed.
   */
  it("polls at the design fallback when offline and the safety floor when live", () => {
    const offline = pollIntervalMsForRelay({ isLive: false, fallbackMs: DESIGN_POLL_INTERVAL_MS });
    const live = pollIntervalMsForRelay({ isLive: true, fallbackMs: DESIGN_POLL_INTERVAL_MS });

    expect(offline).toBe(DESIGN_POLL_INTERVAL_MS);
    expect(live).toBe(30_000);
    expect(live).toBeGreaterThan(offline);
  });
});
