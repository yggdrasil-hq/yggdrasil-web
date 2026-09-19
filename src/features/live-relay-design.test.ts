import { describe, expect, it, vi } from "vitest";
import {
  createLiveRelay,
  deltaTextFromFrame,
  eventFromFrame,
  pollIntervalMsForRelay,
  scopeSubscription,
  type LiveFrame,
  type LiveScope,
  type LiveSocket,
} from "@/lib/features/live-relay";
import { DESIGN_POLL_INTERVAL_MS } from "@/lib/features/design";

/**
 * Issue #25's client side, generalised by ADR 033 §3: the **design-session** half of
 * the relay.
 *
 * A separate file from `live-relay.test.ts` because the two scopes must stay
 * distinguishable at the point of *reading*, and under ADR 033 §1 that protection is
 * no longer a separate frame type — it is the `scope` pair on the frame. Which makes
 * this file more load-bearing than it was, not less: one `event` frame serves every
 * scope now, so if the client stopped comparing scopes, a design session's event would
 * trigger a re-read on a feature page and nothing else would notice.
 *
 * That trade is stated plainly in ADR 033 §1's consequences: the tag is a *stronger*
 * guarantee at the point of writing and a weaker one at the point of reading, and this
 * is the file that keeps the reading side honest.
 */

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_SESSION_ID = "55555555-5555-4555-8555-555555555555";
const FEATURE_ID = "33333333-3333-4333-8333-333333333333";

const designScope: LiveScope = { kind: "design_session", id: SESSION_ID };
const featureScope: LiveScope = { kind: "feature", id: FEATURE_ID };

function designFrame(overrides: Record<string, unknown> = {}): LiveFrame {
  return {
    type: "event",
    scope: designScope,
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
    type: "event",
    scope: featureScope,
    event: { id: "event_2", type: "agent_text", message: "hi", createdAt: "2026-09-18T10:00:00.000Z" },
  };
}

/*
 * The property the scope tag exists for, asserted in both directions.
 *
 * Without this, one reader could stop checking the scope — e.g. a future "read
 * whatever event a frame carries" helper, which is precisely what version 1's two
 * readers were split to prevent — and a session id would flow into code expecting a
 * feature id (or the reverse) with nothing failing. Each direction is a separate `it`
 * so a report names which one broke.
 *
 * **The ids are deliberately the same shape and the same length**, and one case uses
 * *the same uuid* under both kinds: comparing ids alone would pass that case, so the
 * kind has to be part of the comparison. That is not hypothetical — a feature id and a
 * design session's id are both uuids produced by the same database.
 */
describe("the two scopes are not interchangeable (#25, ADR 033 §1)", () => {
  it("does not read a design session event as a feature event", () => {
    expect(eventFromFrame(designFrame(), featureScope)).toBeNull();
  });

  it("does not read a feature event as a design session event", () => {
    expect(eventFromFrame(featureFrame(), designScope)).toBeNull();
  });

  it("refuses the same id under a different kind", () => {
    // The case id-only comparison would get wrong. Both are uuids from one source, so
    // "the id matches" is not the same claim as "this is my subscription".
    const sameId: LiveScope = { kind: "design_session", id: FEATURE_ID };
    expect(eventFromFrame({ type: "event", scope: sameId, event: { id: "e" } }, featureScope)).toBeNull();
    expect(eventFromFrame({ type: "event", scope: featureScope, event: { id: "e" } }, sameId)).toBeNull();
  });

  it("returns the event a design frame carries", () => {
    expect(eventFromFrame(designFrame(), designScope)?.message).toBe("Drafting the shell");
  });

  it("ignores a design frame whose event is not an object", () => {
    // The reader casts rather than deep-validating (the frame is from the API over
    // an authenticated socket), so the one thing it must not do is hand back a
    // non-object as an event.
    expect(eventFromFrame(designFrame({ event: "nope" }), designScope)).toBeNull();
    expect(eventFromFrame(designFrame({ event: null }), designScope)).toBeNull();
  });

  it("ignores a frame with no scope, and a scope of the wrong shape", () => {
    expect(eventFromFrame({ type: "event", event: { id: "e" } }, designScope)).toBeNull();
    expect(eventFromFrame({ type: "event", scope: null, event: { id: "e" } }, designScope)).toBeNull();
    expect(eventFromFrame({ type: "event", scope: SESSION_ID, event: { id: "e" } }, designScope)).toBeNull();
    expect(eventFromFrame({ type: "event", scope: { kind: "design_session" }, event: {} }, designScope)).toBeNull();
  });
});

/*
 * Issue #95's client half: a design session now receives streaming text.
 *
 * Before ADR 033 the delta path was feature-scoped end to end, so a `design_grill` job
 * — which has no feature — had its deltas dropped at the publisher and its prose
 * arrived per message. The delta frame is scope-tagged now, which is the whole change,
 * so what needs asserting here is the client's side of it: this scope's deltas are
 * accepted and another scope's are not.
 */
describe("design-session deltas (#95)", () => {
  it("returns the text of a delta for this session", () => {
    expect(
      deltaTextFromFrame({ type: "delta", scope: designScope, text: "a mockup" }, designScope),
    ).toBe("a mockup");
  });

  it("does not accept a feature's delta, even for the same id", () => {
    // The scope-blind reader's failure mode, and it matters more for deltas than for
    // events: an accepted delta is *appended to the transcript*, so a stray one would
    // put another surface's prose into this conversation rather than merely causing an
    // extra fetch.
    expect(
      deltaTextFromFrame({ type: "delta", scope: featureScope, text: "chatty" }, designScope),
    ).toBeNull();
    expect(
      deltaTextFromFrame(
        { type: "delta", scope: { kind: "feature", id: SESSION_ID }, text: "chatty" },
        designScope,
      ),
    ).toBeNull();
  });

  it("still refuses an empty text, so a stream that appends nothing is not a signal", () => {
    expect(deltaTextFromFrame({ type: "delta", scope: designScope, text: "" }, designScope)).toBeNull();
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
 * The design scope's protocol comes from its real home in `lib/` rather than being
 * restated here, and that is a correction rather than a tidy-up.
 *
 * An earlier version of this file spelled the frames out inline. It passed — but it
 * was verifying a *copy* of the protocol while the hook's own copy was uncovered:
 * mutating the hook's `isSubscribed` to drop the session-id check changed nothing.
 * That is the "a test that builds its own app only tests its own app" shape
 * (#84), and the fix is to have one implementation both sides consume.
 *
 * ADR 033 §3 makes this the *only* protocol factory there is — `scopeSubscription`
 * parameterised by a scope — so the same property now holds for every scope by
 * construction rather than by three parallel files agreeing to keep in step.
 */
function designProtocol() {
  return scopeSubscription({ projectId: PROJECT_ID, scope: designScope });
}

describe("scopeSubscription, design_session scope (#25)", () => {
  const protocol = designProtocol();

  it("subscribes by naming the project and the scope", () => {
    expect(protocol.subscribeFrame).toEqual({
      type: "subscribe",
      projectId: PROJECT_ID,
      scope: designScope,
    });
  });

  it("accepts only a confirmation naming this scope", () => {
    expect(protocol.isSubscribed({ type: "subscribed", scope: designScope })).toBe(true);
    expect(
      protocol.isSubscribed({ type: "subscribed", scope: { kind: "design_session", id: OTHER_SESSION_ID } }),
    ).toBe(false);
  });

  it("does not accept a feature's confirmation, including for the same id", () => {
    // The cross-scope case, and the reason the confirmation carries a scope rather
    // than the client inferring it from the frame's name.
    expect(protocol.isSubscribed({ type: "subscribed", scope: featureScope })).toBe(false);
    expect(
      protocol.isSubscribed({ type: "subscribed", scope: { kind: "feature", id: SESSION_ID } }),
    ).toBe(false);
  });

  it("treats only this scope's event as a change", () => {
    expect(protocol.isEventFrame(designFrame())).toBe(true);
    expect(protocol.isEventFrame(featureFrame())).toBe(false);
  });

  it("exposes the delta reader for this scope, so the relay needs no scope knowledge", () => {
    // The reason `deltaText` lives on the protocol rather than being called from
    // `createLiveRelay`: the relay holds one protocol value and never learns which
    // scope it is serving, which is what makes a fourth scope a protocol argument
    // rather than a code path.
    expect(protocol.deltaText({ type: "delta", scope: designScope, text: "x" })).toBe("x");
    expect(protocol.deltaText({ type: "delta", scope: featureScope, text: "x" })).toBeNull();
  });
});

function buildRelay() {
  const sockets: Array<ReturnType<typeof makeSocket>> = [];
  const scheduler = makeScheduler();
  const statuses: string[] = [];
  const onEvent = vi.fn();
  const onDelta = vi.fn();

  const relay = createLiveRelay({
    url: "ws://api.test/api/ws",
    protocol: designProtocol(),
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
    maxAttempts: 3,
  });

  return {
    relay,
    scheduler,
    statuses,
    onEvent,
    onDelta,
    socket: () => sockets[sockets.length - 1],
  };
}

describe("createLiveRelay, design-session scope (#25)", () => {
  it("sends the scope-tagged subscribe for this session on open", () => {
    const { socket } = buildRelay();

    socket().onopen?.();

    expect(socket().sent.map((raw) => JSON.parse(raw))).toContainEqual({
      type: "subscribe",
      projectId: PROJECT_ID,
      scope: designScope,
    });
  });

  it("becomes live only on a confirmation for this scope", () => {
    const { socket, statuses } = buildRelay();

    socket().onopen?.();
    expect(statuses.at(-1)).toBe("connecting");

    socket().onmessage?.({ data: JSON.stringify({ type: "subscribed", scope: designScope }) });

    expect(statuses.at(-1)).toBe("live");
  });

  /*
   * The scope check on the confirmation. A confirmation naming a different session
   * must not mark this socket live: the page would then sit on the 30s safety
   * interval while receiving nothing, which looks identical to a quiet session until
   * someone times it.
   */
  it("does not become live on a confirmation for a different session", () => {
    const { socket, statuses } = buildRelay();

    socket().onopen?.();
    socket().onmessage?.({
      data: JSON.stringify({ type: "subscribed", scope: { kind: "design_session", id: OTHER_SESSION_ID } }),
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
   * **The regression test for the bug this conversion nearly shipped**, kept because
   * the failure it catches is the one ADR 033 §1 traded towards. The relay used to
   * decide "an event arrived" with a reader hardcoded for the feature scope; a design
   * socket then received design frames it could not recognise and *never signalled a
   * re-read* — the page looked subscribed, sat on the 30s safety interval, and appeared
   * to work while every update arrived up to 30 seconds late. Nothing but timing would
   * reveal it.
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

  it("appends this scope's deltas and drops another scope's", () => {
    // Issue #95, end to end through the relay: the design page now streams, and the
    // scope check is what stops a feature's prose landing in this conversation.
    const { socket, onDelta } = buildRelay();

    socket().onopen?.();
    socket().onmessage?.({ data: JSON.stringify({ type: "delta", scope: designScope, text: "a mock" }) });
    socket().onmessage?.({ data: JSON.stringify({ type: "delta", scope: featureScope, text: " up" }) });
    socket().onmessage?.({ data: JSON.stringify({ type: "delta", scope: designScope, text: "up" }) });

    expect(onDelta.mock.calls.map((call) => call[0])).toEqual(["a mock", "up"]);
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

  it("closes the socket on teardown without sending an unsubscribe frame", () => {
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
  it("polls slowly while live and at the surface's own rate otherwise", () => {
    // The relay-driven interval is the *slower* one; the fallback is this page's own
    // 2s. Anchored to `DESIGN_POLL_INTERVAL_MS` rather than a literal, so a change to
    // the page's pre-relay behaviour is reflected here instead of hidden.
    expect(pollIntervalMsForRelay({ isLive: true, fallbackMs: DESIGN_POLL_INTERVAL_MS })).toBe(
      30_000,
    );
    expect(pollIntervalMsForRelay({ isLive: false, fallbackMs: DESIGN_POLL_INTERVAL_MS })).toBe(
      DESIGN_POLL_INTERVAL_MS,
    );
  });
});
