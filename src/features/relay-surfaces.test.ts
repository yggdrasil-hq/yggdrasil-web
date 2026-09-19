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

/** The four surfaces #98 is about, so a rename or removal is noticed. */
const KNOWN_SURFACES = [
  "components/features/feature-grill-client.tsx",
  "components/features/build-progress-panel.tsx",
  "components/features/testing-panel.tsx",
  "components/designs/design-session-client.tsx",
];

describe("findRelayPollEffects", () => {
  const scan = (source: string, path = "components/x.tsx") =>
    findRelayPollEffects([{ path, source }]);

  it("accepts the shape the grill transcript and the build panel use", () => {
    const source = `
      function Surface() {
        const { isLive } = useLiveFeatureRelay({ onEvent: () => void poll() });
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
        const { isLive } = useLiveFeatureRelay({ onEvent: () => void poll() });
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
      import { useLiveFeatureRelay } from "@/components/features/use-live-feature-relay";
      export function Surface() {
        const { isLive } = useLiveFeatureRelay({ projectId, featureId });
        return null;
      }
    `;

    expect(findRelaySurfaces([{ path: "components/x.tsx", source }])).toEqual([
      { path: "components/x.tsx", hooks: ["useLiveFeatureRelay"] },
    ]);
  });

  it("finds the design surface from its own hook", () => {
    const source = `
      import { useLiveDesignRelay } from "@/components/designs/use-live-design-relay";
      export function Surface() {
        const { isLive } = useLiveDesignRelay({ projectId, sessionId });
        return null;
      }
    `;

    expect(findRelaySurfaces([{ path: "components/y.tsx", source }])[0].hooks).toEqual([
      "useLiveDesignRelay",
    ]);
  });

  it("is not fooled by a mention outside an import", () => {
    // Discovery has to be the *import*, or a page that merely talks about the
    // relay in a comment or a string is scanned as a surface.
    const source = `
      // The grill page used to call useLiveFeatureRelay here.
      const note = "useLiveFeatureRelay";
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
