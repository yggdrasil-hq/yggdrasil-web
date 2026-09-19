import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findRelayPollEffects,
  findRelaySurfaces,
  type RelaySurfaceFile,
} from "@/lib/features/relay-surfaces";

/**
 * Issue #98: of the four surfaces subscribed to the live relay, two re-read when
 * the relay becomes live and two did not — and the shared module asserted the
 * property of all four.
 *
 * The two that did not were keyed on `[poll]` alone, with the immediate read in
 * its own effect, so the connect only *restarted* the interval. Worst-case
 * staleness was the safety interval rather than zero, which is bounded and was
 * never a live-feed outage — but the socket's subscribe is registered server-side
 * only after the frame is authorised and the hub keeps no backlog, so the read at
 * that moment is the only thing covering the window in between. The interval is a
 * watchdog, not the catch-up.
 *
 * **Why a source scan and not a behaviour test.** An effect's dependency list is
 * not observable from a test in this repo: vitest runs in a `node` environment
 * with no React testing library, deliberately. A surface that stopped depending on
 * the live status renders identically in every state a test could reach — only the
 * *timing* of a refetch changes, and there is no clock to assert against. So the
 * dependency list is the mechanism, and the source is where it lives. Same shape
 * and same reasoning as `src/a11y/form-controls.test.ts` (issues #67/#83).
 *
 * The scanner is `lib/features/relay-surfaces.ts`; the first half of this file
 * tests it against hand-written sources, including the exact pre-fix shape, and the
 * second half runs it over the real components.
 */

/**
 * Each surface and the scope **kind** it subscribes to (issue #100).
 *
 * A map rather than a list, because the kind is the half of "this surface is live"
 * the poll rule cannot see: a surface can re-read on connect and still receive
 * nothing, if it subscribed to a scope the server routes something else to. That
 * failure is quiet — the authoriser refuses an id it cannot resolve, the client falls
 * back to its poll, and the page works while never being live. Which is the state
 * issue #100 was filed about.
 */
const EXPECTED_SCOPES: Record<string, string> = {
  "components/features/feature-grill-client.tsx": "feature",
  "components/features/build-progress-panel.tsx": "feature",
  "components/features/testing-panel.tsx": "feature",
  "components/designs/design-session-client.tsx": "design_session",
  // Issue #100: the Test entity's run history, and the first `test`-scoped surface.
  // A feature-driven `test_run` reaches both the feature topic and the test topic, so
  // this page needs a socket of its own to consume the second.
  "components/tests/test-run-history.tsx": "test",
};

/** The four surfaces #98 is about, so a rename or removal is noticed. */
const KNOWN_SURFACES = [
  "components/features/feature-grill-client.tsx",
  "components/features/build-progress-panel.tsx",
  "components/features/testing-panel.tsx",
  "components/designs/design-session-client.tsx",
  // Issue #100: the fifth surface, and the first *test*-scoped one — a feature-driven
  // `test_run` reaches both the feature topic and the test topic, so the Test entity's
  // run history needed a socket of its own to consume the second.
  "components/tests/test-run-history.tsx",
];

describe("findRelayPollEffects", () => {
  const scan = (source: string, path = "components/x.tsx") =>
    findRelayPollEffects([{ path, source }]);

  it("accepts the shape the grill transcript and the build panel use", () => {
    const source = `
      function Surface() {
        const { isLive } = useLiveRelay({ onEvent: () => void poll() });
        useEffect(() => {
          void poll();
          const interval = setInterval(
            () => void poll(),
            pollIntervalMsForRelay({ isLive, fallbackMs: 2000 }),
          );
          return () => clearInterval(interval);
        }, [poll, isLive]);
        return null;
      }
    `;

    const effects = scan(source);
    expect(effects).toHaveLength(1);
    expect(effects[0].intervalReads).toEqual(["poll"]);
    expect(effects[0].immediateReads).toContain("poll");
    expect(effects[0].keyedOnLiveStatus).toBe(true);
    expect(effects[0].readsOnStart).toBe(true);
  });

  it("flags the pre-fix shape: the immediate read in its own effect", () => {
    // The regression this issue is about, verbatim: the interval restarts on
    // `isLive`, and the immediate read never re-runs.
    const source = `
      function Surface() {
        const { isLive } = useLiveRelay({ onEvent: () => void poll() });
        useEffect(() => {
          void poll();
        }, [poll]);
        useEffect(() => {
          const interval = setInterval(
            () => void poll(),
            pollIntervalMsForRelay({ isLive, fallbackMs: 2000 }),
          );
          return () => clearInterval(interval);
        }, [poll, isLive]);
        return null;
      }
    `;

    const effects = scan(source);
    expect(effects).toHaveLength(1);
    expect(effects[0].readsOnStart).toBe(false);
    // Keyed on the live status, and still not a catch-up — which is the whole
    // point: the transition restarts the interval and reads nothing.
    expect(effects[0].keyedOnLiveStatus).toBe(true);
    expect(effects[0].intervalReads).toEqual(["poll"]);
    expect(effects[0].immediateReads).not.toContain("poll");
  });

  it("flags an effect whose only read is inside the interval", () => {
    const source = `
      function Surface() {
        useEffect(() => {
          const interval = setInterval(
            () => void poll(),
            pollIntervalMsForRelay({ isLive, fallbackMs: 2000 }),
          );
          return () => clearInterval(interval);
        }, [poll, isLive]);
        return null;
      }
    `;

    const effects = scan(source);
    expect(effects).toHaveLength(1);
    expect(effects[0].readsOnStart).toBe(false);
  });

  it("flags an effect keyed on the identity but not the live status", () => {
    const source = `
      function Surface() {
        useEffect(() => {
          void poll();
          const interval = setInterval(
            () => void poll(),
            pollIntervalMsForRelay({ isLive, fallbackMs: 2000 }),
          );
          return () => clearInterval(interval);
        }, [poll]);
        return null;
      }
    `;

    const effects = scan(source);
    expect(effects).toHaveLength(1);
    expect(effects[0].keyedOnLiveStatus).toBe(false);
  });

  it("reads a dotted dependency name, and is not fooled by a longer one", () => {
    const dotted = `
      function Surface() {
        useEffect(() => {
          void poll();
          const i = setInterval(() => void poll(), pollIntervalMsForRelay({ isLive, fallbackMs: 1 }));
          return () => clearInterval(i);
        }, [poll, relay.isLive]);
      }
    `;
    expect(scan(dotted)[0].keyedOnLiveStatus).toBe(true);

    // A word boundary, not a substring: `isLiveRelay` is a different name.
    const longer = dotted.replace("relay.isLive", "isLiveRelay");
    expect(scan(longer)[0].keyedOnLiveStatus).toBe(false);
  });

  it("ignores an interval that is not the relay's", () => {
    // The elapsed-time tickers in these same components schedule a `setInterval`
    // whose period is a literal. They are clocks, not reads.
    const source = `
      function Surface() {
        useEffect(() => {
          const tick = setInterval(() => setNow(Date.now()), 1000);
          return () => clearInterval(tick);
        }, []);
        return null;
      }
    `;

    expect(scan(source)).toEqual([]);
  });

  it("does not read an effect written in a comment", () => {
    // The #83 trap: a text scan reports prose as code. Comments are trivia, so the
    // parser cannot see this one at all.
    const source = `
      function Surface() {
        /*
        useEffect(() => {
          void poll();
          const i = setInterval(() => void poll(), pollIntervalMsForRelay({ isLive, fallbackMs: 1 }));
          return () => clearInterval(i);
        }, [poll, isLive]);
        */
        return null;
      }
    `;

    expect(scan(source)).toEqual([]);
  });

  it("reports the line of the effect, for the failure message", () => {
    const source = [
      "function Surface() {",
      "  useEffect(() => {",
      "    void poll();",
      "    const i = setInterval(() => void poll(), pollIntervalMsForRelay({ isLive, fallbackMs: 1 }));",
      "    return () => clearInterval(i);",
      "  }, [poll, isLive]);",
      "}",
    ].join("\n");

    expect(scan(source)[0].line).toBe(2);
  });
});

describe("findRelaySurfaces", () => {
  it("finds a surface from the hook it imports, and names the hook", () => {
    const source = `
      import { useLiveRelay } from "@/components/features/use-live-relay";
      export function Surface() {
        const { isLive } = useLiveRelay({ projectId, scope: { kind: "feature", id: featureId } });
        return null;
      }
    `;

    // `scopes` is the hook's own scope kind, read from the same call (issue #100) —
    // `"feature"` here because that is what this source subscribes to, and asserting
    // the whole object is what keeps the field from being silently dropped.
    expect(findRelaySurfaces([{ path: "components/x.tsx", source }])).toEqual([
      { path: "components/x.tsx", hooks: ["useLiveRelay"], scopes: ["feature"] },
    ]);
  });

  it("finds every scope's surface from the one hook (ADR 033 §3)", () => {
    // The point of the generalisation, asserted: a design-session surface and a
    // feature surface import the *same* module now, so discovery has one entry to
    // look for. Before ADR 033 this needed a second hook module in the list, and a
    // third scope would have needed a third.
    const source = `
      import { useLiveRelay } from "@/components/features/use-live-relay";
      export function Surface() {
        const { isLive } = useLiveRelay({ projectId, scope: { kind: "design_session", id: sessionId } });
        return null;
      }
    `;

    expect(findRelaySurfaces([{ path: "components/y.tsx", source }])[0].hooks).toEqual([
      "useLiveRelay",
    ]);
  });

  it("is not fooled by a mention outside an import", () => {
    // Discovery has to be the *import*, or a page that merely talks about the
    // relay in a comment or a string is scanned as a surface.
    const source = `
      // The grill page used to call useLiveRelay here.
      const note = "useLiveRelay";
      export const x = note;
    `;

    expect(findRelaySurfaces([{ path: "components/z.tsx", source }])).toEqual([]);
  });
});

/*
 * The scan over the repo's own components. This is the part that would have
 * failed before the fix and is the reason the check exists at all.
 */
const root = process.cwd();

function componentSources(): RelaySurfaceFile[] {
  const files: RelaySurfaceFile[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith(".tsx")) continue;
      files.push({ path: relative(root, full), source: readFileSync(full, "utf8") });
    }
  }

  walk(join(root, "components"));
  walk(join(root, "app"));
  return files;
}

describe("findRelaySurfaces: the scope kind (#100)", () => {
  const scan = (source: string) =>
    findRelaySurfaces([{ path: "components/x.tsx", source }]);

  it("reads the literal kind each surface subscribes to", () => {
    // The other half of "this surface is live": the poll rule cannot see which topic a
    // socket was pointed at, and a surface can satisfy every dependency rule while
    // receiving nothing.
    const source = `
      import { useLiveRelay } from "@/components/features/use-live-relay";
      export function Surface({ projectId, testId }) {
        const { isLive } = useLiveRelay({
          projectId,
          scope: { kind: "test", id: testId },
          onEvent: () => void poll(),
        });
        return null;
      }
    `;

    expect(scan(source)[0].scopes).toEqual(["test"]);
  });

  it("reports no kind when the scope is not a literal, rather than guessing", () => {
    // A computed kind is not something this can reason about, and inventing one would
    // be the scanner claiming to know more than it read. Empty is the honest answer,
    // and the repo-wide assertion below treats empty as a failure.
    const source = `
      import { useLiveRelay } from "@/components/features/use-live-relay";
      export function Surface({ projectId, scope }) {
        const { isLive } = useLiveRelay({ projectId, scope, onEvent: () => void poll() });
        return null;
      }
    `;

    expect(scan(source)[0].scopes).toEqual([]);
  });

  it("does not read a scope out of some other call", () => {
    // Discovery is the hook by name, so a component that merely *contains* a
    // scope-shaped object must not be credited with a subscription.
    const source = `
      function helper() {
        return { projectId: "p", scope: { kind: "test", id: "t" } };
      }
    `;

    expect(scan(source)).toEqual([]);
  });
});

describe("the repo's own relay surfaces (#98)", () => {
  const files = componentSources();
  const surfaces = findRelaySurfaces(files);
  const effects = findRelayPollEffects(files);

  it("scans a realistic number of component files", () => {
    // A guard against the scan silently finding nothing — a wrong cwd or a broken
    // walk would otherwise pass for the wrong reason.
    expect(files.length).toBeGreaterThan(40);
  });

  it("discovers every surface that subscribes to the relay", () => {
    const paths = surfaces.map((surface) => surface.path);
    for (const known of KNOWN_SURFACES) expect(paths).toContain(known);
    // Discovery is by import, so a fifth surface is covered without editing this
    // list — but a discovery that broke and found nothing must not pass.
    expect(surfaces.length).toBeGreaterThanOrEqual(KNOWN_SURFACES.length);
  });

  it("gives every surface a poll effect, so a dropped interval is not invisible", () => {
    const paths = effects.map((effect) => effect.path);
    for (const surface of surfaces) {
      expect(
        paths,
        `${surface.path} subscribes to the relay (${surface.hooks.join(", ")}) but schedules no relay poll — ` +
          `the fallback for a relay that never connects is gone`,
      ).toContain(surface.path);
    }
  });

  it("subscribes each surface to the scope kind it reads (#100)", () => {
    const kinds = new Map(surfaces.map((surface) => [surface.path, surface.scopes]));
    const mismatched = Object.entries(EXPECTED_SCOPES).flatMap(([path, expected]) => {
      const found = kinds.get(path);
      if (found === undefined) return [`  ${path}: not discovered as a relay surface`];
      if (found.length !== 1) {
        return [
          `  ${path}: subscribes to ${JSON.stringify(found)} — expected exactly one ` +
            `literal scope kind (${expected})`,
        ];
      }
      if (found[0] !== expected) {
        return [`  ${path}: subscribes to "${found[0]}", reads the "${expected}" scope`];
      }
      return [];
    });

    expect(
      mismatched,
      mismatched.length === 0
        ? ""
        : "A relay surface must subscribe to the scope its own REST read mirrors " +
          "(ADR 019 item 7). A wrong kind is quiet: the authoriser refuses an id it " +
          "cannot resolve, the client falls back to polling, and the page works while " +
          "never being live — the state issue #100 was filed about.\n" +
          mismatched.join("\n"),
    ).toEqual([]);
  });

  it("makes every relay poll effect re-read when the relay becomes live", () => {
    const gaps = effects.filter((effect) => !effect.readsOnStart || !effect.keyedOnLiveStatus);
    const described = gaps
      .map((gap) => {
        const why = [
          gap.readsOnStart ? null : "the connect never reads (no immediate read)",
          gap.keyedOnLiveStatus ? null : "not keyed on the live status",
        ]
          .filter((part): part is string => part !== null)
          .join("; ");
        return `  ${gap.path}:${gap.line}  interval reads ${JSON.stringify(gap.intervalReads)} ` +
          `immediate reads ${JSON.stringify(gap.immediateReads)} deps ${JSON.stringify(gap.deps)} — ${why}`;
      })
      .join("\n");

    expect(
      gaps,
      gaps.length === 0
        ? ""
        : "A relay poll effect must read immediately as well as on its interval, and must " +
          "be keyed on `isLive` so the connect restarts it (issue #98):\n" +
          described,
    ).toEqual([]);
  });
});
