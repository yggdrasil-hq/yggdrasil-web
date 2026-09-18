/**
 * How much of the API the app calls does the mock layer actually mock?
 *
 * **Why this module exists.** `web/lib/msw/` is a second, hand-maintained source
 * of every API response shape. Nothing compared it against what the app really
 * requests, so it silently drifted: as of writing the app calls **85** distinct
 * paths and the mock layer handles **49**, leaving **41** whole surfaces —
 * model configuration, providers, allocation caps, usage/analytics, audit,
 * extensions, recordings and test-run history — that a developer running the app
 * against the mocks sees as 404s.
 *
 * The previous audit measured this by hand, twice, and got two different numbers
 * (41, then 43 after correcting a stale checkout) because each measurement used
 * a different normalisation of the same source. A number nobody can reproduce is
 * not worth much, so the counting lives here — pure, testable, and asserted by
 * `src/msw/coverage.test.ts` on every run. The test is the real deliverable: it
 * turns "the mock layer is 41 handlers behind" from something an audit discovers
 * into something that fails CI the moment it gets *worse*.
 *
 * **What it deliberately does not do.** It does not check that a fixture has the
 * right *shape*. That is already covered — `fixtures.ts` is typed against
 * `lib/features/types.ts`, so `tsc --noEmit` fails when the API grows a field the
 * fixtures lack, which is exactly how the `lastError`/`completedAt` drift was
 * caught. Path coverage is the gap that had no check at all.
 */

/**
 * Every path the app currently calls with no mock handler, as a **debt ledger**
 * rather than an assumption.
 *
 * Enumerated so the test can distinguish "known gap, unchanged" from "new gap,
 * someone added a call and no handler". Without the ledger the test could only
 * fail-always, which is the same as no test; with it, the list can only stay the
 * same or get shorter, and any new unmocked path fails immediately with a message
 * naming it.
 *
 * Grouped by surface so the ledger reads as a description of what is missing
 * rather than a wall of paths. Each group is a whole feature area, which is why
 * the honest summary is "eight surfaces are unmocked", not "41 stragglers".
 *
 * Removing an entry is the right move whenever it becomes handled — the test
 * fails if the ledger is stale in that direction too, so it cannot rot into a
 * list of things that are actually fine.
 */
export const KNOWN_UNMOCKED_PATHS: readonly string[] = [
  // --- Organization: usage, analytics, audit, allocations (ADR 023 / ADR 030) ---
  "/organizations/:p/usage",
  "/organizations/:p/analytics",
  "/organizations/:p/audit",
  "/organizations/:p/allocations",
  "/organizations/:p/allocations/projects/:p/quota",
  "/organizations/:p/allocations/projects/:p/token-cap",

  // --- Organization: providers and the model catalog (ADR 018) ---
  "/organizations/:p/providers",
  "/organizations/:p/providers/:p",
  "/organizations/:p/providers/test-connection",
  "/organizations/:p/providers/:p/test-connection",
  // Issue #36's additions, which is why two of these postdate the audit's first
  // count: a listing endpoint is exactly the kind of path that arrives without a
  // mock, and exactly what this ledger is for.
  "/organizations/:p/providers/probe-models",
  "/organizations/:p/providers/:p/models",
  "/organizations/:p/models",
  "/organizations/:p/models/:p",
  "/organizations/:p/job-model-defaults",
  "/organizations/:p/job-model-defaults/:p",
  "/organizations/:p/cluster/test-connection",

  // --- Organization: extensions, invites (ADR 025 / ADR 016) ---
  "/organizations/:p/extensions",
  "/organizations/:p/extensions/:p",
  "/organizations/:p/invites/:p",

  // --- Project: usage and analytics ---
  "/projects/:p/usage",
  "/projects/:p/analytics",

  // --- Project: deploys and rollback (ADR 022) ---
  "/projects/:p/deploys",
  "/projects/:p/rollback",

  // --- Project: model overrides, all three tiers (ADR 018) ---
  "/projects/:p/job-model-overrides",
  "/projects/:p/job-model-overrides/:p",
  "/projects/:p/features/:p/model-config",
  "/projects/:p/features/:p/model-secrets",
  "/projects/:p/features/:p/job-model-overrides",
  "/projects/:p/features/:p/job-model-overrides/:p",
  "/projects/:p/uploaded-extensions-enabled",

  // --- Feature: the controls that mutate a run ---
  "/projects/:p/features/:p/restart",
  "/projects/:p/features/:p/restart-from-message",
  "/projects/:p/features/:p/retry-build",
  "/projects/:p/features/:p/action-items/:p/test",

  // --- Job artifacts and run history (ADR 029 / ADR 026) ---
  "/projects/:p/jobs/:p/recording",
  "/projects/:p/jobs/:p/recording/content",
  "/projects/:p/tests/:p/runs",
  "/projects/:p/tests/:p/runs/:p",

  // --- Notification preferences (ADR 027) ---
  "/settings/notification-preferences",
  "/settings/notification-preferences/projects/:p",
];

/** A path as the app calls it, and as a handler declares it, both normalised. */
export interface MswCoverage {
  /** Distinct paths the app requests, normalised and sorted. */
  called: string[];
  /** Distinct paths a mock handler declares, normalised and sorted. */
  handled: string[];
  /** Called, no handler, and not in the ledger — i.e. newly broken. */
  unexpected: string[];
  /** In the ledger but no longer a real gap (now handled, or no longer called). */
  staleLedgerEntries: string[];
  /** Handlers for paths the app never requests. */
  deadHandlers: string[];
}

/**
 * Reads a template literal starting at `start` (a backtick) and returns its raw
 * contents, tracking `${ … }` nesting *including backticks inside* an
 * interpolation.
 *
 * The nesting matters for one real call site:
 * ``apiUrl(`/organizations/${id}/audit${query ? `?${query}` : ""}`)``. A regex
 * that stops at the next backtick reads that as two broken fragments, which is
 * how a hand count produced a path of `/organizations/:p/audit${query `. Nested
 * templates are the whole reason this is a scanner rather than a pattern.
 */
function readTemplateLiteral(source: string, start: number): string {
  let index = start + 1;
  let depth = 0;
  let out = "";

  while (index < source.length) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }
    if (depth === 0 && char === "`") return out;

    if (char === "$" && source[index + 1] === "{") {
      depth += 1;
      out += "${";
      index += 2;
      continue;
    }

    if (depth > 0) {
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          out += "}";
          index += 1;
          continue;
        }
      }
      out += char;
      index += 1;
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

/** The string argument of every `apiUrl(…)` call in a source file. */
export function extractApiUrlArguments(source: string): string[] {
  const args: string[] = [];
  const pattern = /apiUrl\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    let index = match.index + match[0].length;
    while (index < source.length && (source[index] === " " || source[index] === "\n" || source[index] === "\t")) {
      index += 1;
    }
    const quote = source[index];
    if (quote === "`") {
      args.push(readTemplateLiteral(source, index));
    } else if (quote === '"') {
      const end = source.indexOf('"', index + 1);
      if (end !== -1) args.push(source.slice(index + 1, end));
    }
  }

  return args;
}

/**
 * Reduces a path to a comparable form: every parameter becomes `:p`, and the
 * query string is dropped.
 *
 * Two different spellings have to meet in the middle. A call site writes
 * `` `/projects/${projectId}` `` and a handler writes
 * `"/projects/:projectId"`; both must become `/projects/:p`, or the comparison
 * finds every path missing and reports nonsense.
 *
 * A `${…}` **not** preceded by `/` is a query tail glued to the last segment
 * (`` `/github/installations${query}` `` is a request for
 * `/github/installations`, not for a path with a parameter), so it is dropped
 * rather than fused in. Getting that one wrong is what turned a handled path
 * into a reported gap during the hand count.
 */
export function normaliseApiPath(raw: string): string {
  const out: string[] = [];
  let index = 0;
  let depth = 0;
  let interpolationStart = 0;

  while (index < raw.length) {
    const char = raw[index];

    if (char === "$" && raw[index + 1] === "{") {
      depth += 1;
      interpolationStart = index + 2;
      index += 2;
      continue;
    }

    if (depth > 0) {
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          // A parameter is something that *replaces a segment*. Anything else
          // glued onto the end of a segment is a query tail.
          if (out[out.length - 1] === "/") out.push(":p");
          index += 1;
          continue;
        }
      }
      index += 1;
      continue;
    }

    if (char === "?") break; // query begins; the path is complete

    out.push(char);
    index += 1;
  }

  const withParams = out.join("").replace(/:[A-Za-z_]\w*/g, ":p");
  const segments = withParams.split("/").filter((segment) => segment.length > 0);
  return `/${segments.join("/")}`;
}

/** Distinct normalised paths a handlers file declares, from every `apiUrl(…)`. */
export function handlerPaths(handlerSource: string): string[] {
  const paths = new Set<string>();
  for (const raw of extractApiUrlArguments(handlerSource)) {
    const normalised = normaliseApiPath(raw);
    if (normalised !== "/") paths.add(normalised);
  }
  return [...paths].sort();
}

/** Distinct normalised paths an API client requests. */
export function calledPaths(apiSource: string): string[] {
  const paths = new Set<string>();
  for (const raw of extractApiUrlArguments(apiSource)) {
    const normalised = normaliseApiPath(raw);
    if (normalised !== "/") paths.add(normalised);
  }
  return [...paths].sort();
}

/**
 * Compares the two sides, with the ledger applied.
 *
 * `ledger` defaults to `KNOWN_UNMOCKED_PATHS` and is a parameter so the test can
 * exercise the comparison logic against synthetic inputs rather than only
 * against this repo's current (large, real) state.
 */
export function computeMswCoverage(input: {
  apiSource: string;
  handlerSource: string;
  ledger?: readonly string[];
}): MswCoverage {
  const ledger = new Set(input.ledger ?? KNOWN_UNMOCKED_PATHS);
  const called = calledPaths(input.apiSource);
  const handled = handlerPaths(input.handlerSource);
  const handledSet = new Set(handled);
  const calledSet = new Set(called);

  const unexpected = called.filter((path) => !handledSet.has(path) && !ledger.has(path));
  const staleLedgerEntries = [...ledger]
    .filter((path) => handledSet.has(path) || !calledSet.has(path))
    .sort();
  const deadHandlers = handled.filter((path) => !calledSet.has(path));

  return { called, handled, unexpected, staleLedgerEntries, deadHandlers };
}
