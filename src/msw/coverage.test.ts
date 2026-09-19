import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KNOWN_UNMOCKED_PATHS,
  calledPaths,
  computeMswCoverage,
  extractApiUrlArguments,
  handlerPaths,
  normaliseApiPath,
} from "@/lib/msw/coverage";

/**
 * Issue #64: the mock layer is a second source of every API response shape, and
 * nothing compared it against what the app actually requests. This test is the
 * thing that was missing — not the 41 handlers.
 *
 * It fails when the mock layer gets *worse* (a new call with no handler, and no
 * ledger entry saying so) and when the ledger goes *stale* (an entry that is now
 * handled, so the list overstates the gap). It passes while the gap is exactly
 * the enumerated one, which is the only honest state available today.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

function repoCoverage() {
  return computeMswCoverage({
    apiSource: read("lib/api.ts"),
    handlerSource: read("lib/msw/handlers.ts"),
  });
}

describe("normaliseApiPath", () => {
  it("collapses a call-site parameter and a handler parameter to the same form", () => {
    // The two spellings have to meet in the middle, or every path looks missing.
    expect(normaliseApiPath("/projects/${projectId}")).toBe("/projects/:p");
    expect(normaliseApiPath("/projects/:projectId")).toBe("/projects/:p");
    expect(normaliseApiPath("/projects/${projectId}/features/${featureId}")).toBe(
      "/projects/:p/features/:p",
    );
  });

  it("drops a query string", () => {
    expect(normaliseApiPath("/organizations/${organizationId}/usage?days=${days}")).toBe(
      "/organizations/:p/usage",
    );
    expect(normaliseApiPath("/settings/notification-preferences?org=${organizationId}")).toBe(
      "/settings/notification-preferences",
    );
  });

  it("treats an interpolation glued onto a segment as a query tail, not a parameter", () => {
    // `/github/installations${query}` requests `/github/installations`; reading
    // the interpolation as a parameter invents a path and reports a handled
    // route as a gap. That mistake is exactly what produced two different
    // hand-counted totals for this issue.
    expect(normaliseApiPath("/github/installations${query}")).toBe("/github/installations");
  });

  it("handles a nested template literal whose inner `?` must not end the path", () => {
    // ``audit${query ? `?${query}` : ""}`` — a naive `split("?")[0]` cuts inside
    // the interpolation and yields `/organizations/:p/audit${query `.
    expect(
      normaliseApiPath('/organizations/${organizationId}/audit${query ? `?${query}` : ""}'),
    ).toBe("/organizations/:p/audit");
  });

  it("keeps a path with no parameters unchanged", () => {
    expect(normaliseApiPath("/settings/notification-preferences")).toBe(
      "/settings/notification-preferences",
    );
  });
});

describe("extractApiUrlArguments", () => {
  it("reads both template literals and plain strings", () => {
    const source = `
      fetch(apiUrl(\`/projects/\${id}\`));
      fetch(apiUrl("/health"));
    `;
    expect(extractApiUrlArguments(source)).toEqual(["/projects/${id}", "/health"]);
  });

  it("reads a template literal containing a nested one as a single argument", () => {
    // A regex that stops at the next backtick would split this in two.
    const source = "apiUrl(`/a/${x}${q ? `?${q}` : \"\"}`)";
    expect(extractApiUrlArguments(source)).toEqual(['/a/${x}${q ? `?${q}` : ""}']);
  });

  it("does not mistake a longer identifier ending in apiUrl for a call", () => {
    // `buildApiUrl(` is not `apiUrl(`; the pattern anchors on the name followed
    // by `(` so a longer identifier cannot contribute a phantom path.
    expect(extractApiUrlArguments("buildApiUrl(`/nope`)")).toEqual([]);
  });
});

describe("computeMswCoverage", () => {
  const apiSource = `
    fetch(apiUrl(\`/mocked/\${id}\`));
    fetch(apiUrl(\`/missing/\${id}\`));
    fetch(apiUrl(\`/also-known\`));
  `;
  const handlerSource = `
    http.get(apiUrl("/mocked/:id"), () => {});
    http.get(apiUrl("/dead/:id"), () => {});
  `;

  it("reports a called path with no handler and no ledger entry as unexpected", () => {
    const coverage = computeMswCoverage({
      apiSource,
      handlerSource,
      ledger: ["/also-known"],
    });

    expect(coverage.unexpected).toEqual(["/missing/:p"]);
  });

  it("does not report a path the ledger already accounts for", () => {
    const coverage = computeMswCoverage({
      apiSource,
      handlerSource,
      ledger: ["/also-known", "/missing/:p"],
    });

    expect(coverage.unexpected).toEqual([]);
  });

  // A ledger that is never pruned becomes a list of things that are actually
  // fine, which is worse than no ledger: it would hide the real remaining gap.
  it("flags a ledger entry that is now handled", () => {
    const coverage = computeMswCoverage({
      apiSource,
      handlerSource,
      ledger: ["/missing/:p", "/mocked/:p"],
    });

    expect(coverage.staleLedgerEntries).toEqual(["/mocked/:p"]);
  });

  it("flags a ledger entry the app no longer calls", () => {
    const coverage = computeMswCoverage({
      apiSource,
      handlerSource,
      ledger: ["/missing/:p", "/gone-forever"],
    });

    expect(coverage.staleLedgerEntries).toEqual(["/gone-forever"]);
  });

  it("reports a handler for a path the app never calls", () => {
    const coverage = computeMswCoverage({
      apiSource,
      handlerSource,
      ledger: ["/missing/:p", "/also-known"],
    });

    expect(coverage.deadHandlers).toEqual(["/dead/:p"]);
  });
});

describe("the repo's own mock coverage (#64)", () => {
  const coverage = repoCoverage();

  /**
   * The count, asserted rather than described. If it moves, this fails and names
   * what moved — which is the whole point, because the previous two hand counts
   * of this disagreed with each other.
   */
  it("has the expected number of called and handled paths", () => {
    // Both counters moved together twice in this batch, each time because a call
    // arrived with its handler rather than as ledger debt:
    //   #35  `/organizations/readiness` (middleware, every navigation)
    //   #31  `/projects/:projectId/timezone` (the timezone picker's write)
    //   #28  the two feature-scoped grill-run reads (Spec page: the earlier-runs
    //        list and a superseded run's transcript)
    // Pinned deliberately so the next path has to be counted rather than absorbed.
    expect({
      called: coverage.called.length,
      handled: coverage.handled.length,
    }).toEqual({ called: 90, handled: 54 });
  });

  /**
   * The ratchet. A new `apiUrl(...)` call with no handler fails here, with the
   * path named, instead of becoming a 404 a developer has to diagnose.
   */
  it("has no unmocked path outside the known ledger", () => {
    expect(coverage.unexpected).toEqual([]);
  });

  /**
   * And the other direction: the ledger may not overstate the gap. Removing an
   * entry once it is handled is part of closing this issue.
   */
  it("has no stale entries in the ledger", () => {
    expect(coverage.staleLedgerEntries).toEqual([]);
  });

  it("keeps the ledger free of duplicates", () => {
    const seen = new Set(KnownLedger());
    expect(seen.size).toBe(KnownLedger().length);
  });

  /**
   * Dead handlers are reported but not failed on. A handler for a path the app
   * does not currently call is not necessarily wrong — the five here are
   * plausible future or alternate spellings — so this is a count to watch rather
   * than a rule. Asserting the exact set makes a surprise (a handler deleted, or
   * a path renamed out from under one) visible.
   */
  it("reports the handlers nothing calls", () => {
    expect(coverage.deadHandlers).toEqual([
      "/auth/me",
      "/github/installations/:p/repos",
      "/github/installations/:p/sync",
      "/settings/secrets",
      "/settings/secrets/:p",
    ]);
  });

  it("counts the known gap", () => {
    // 85 called − 49 handled = 36 unhandled, of which 36 are in the ledger.
    const unhandled = coverage.called.filter((p) => !coverage.handled.includes(p));
    expect(unhandled.length).toBe(KnownLedger().length);
  });
});

function KnownLedger(): readonly string[] {
  return KNOWN_UNMOCKED_PATHS;
}

describe("calledPaths and handlerPaths against real source", () => {
  it("finds paths in the API client and the handlers file", () => {
    expect(calledPaths(read("lib/api.ts")).length).toBeGreaterThan(50);
    expect(handlerPaths(read("lib/msw/handlers.ts")).length).toBeGreaterThan(30);
  });
});
