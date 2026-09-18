import { KNOWN_UNMOCKED_PATHS } from "./coverage";

/**
 * What to say when the mock layer has no handler for a request.
 *
 * **The problem this solves.** `worker.start` used `onUnhandledRequest: "bypass"`,
 * which lets an unmocked request fall through to the network and fail there. With
 * no API running that surfaces as an ordinary 404 or a failed fetch — a shape
 * indistinguishable from a product bug. A developer then debugs the app, because
 * nothing said the *mock layer* was the thing with the hole in it.
 *
 * So the message has to name its own cause. It also has to be **quiet when it has
 * nothing useful to say**, which is why this returns null for anything that is
 * not an API request: the page fetches JS chunks, CSS, images and Next.js RSC
 * payloads through the same service worker, and warning about those would bury
 * the real signal under noise a developer learns to ignore.
 */

/**
 * The API-relative path of a request, or null if it is not an API request.
 *
 * `apiBase` is a path (`/app/api` in the docker stack, `/api` bare) while
 * `request.url` is absolute, so the origin is discarded before the prefix is
 * stripped.
 */
export function apiRelativePath(url: string, apiBase: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // A malformed URL is not something to warn about; it is not our request.
    return null;
  }

  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return null;

  const withoutBase = base ? pathname.slice(base.length) : pathname;
  const path = withoutBase.startsWith("/") ? withoutBase : `/${withoutBase}`;
  return path === "" ? "/" : path;
}

/**
 * Segment-wise match of a concrete request path against a parameterised pattern
 * (`/projects/:p/deploys`), so a known gap can be recognised and named rather
 * than reported as a fresh surprise.
 */
export function matchesPattern(path: string, pattern: string): boolean {
  const pathSegments = path.split("/").filter(Boolean);
  const patternSegments = pattern.split("/").filter(Boolean);
  if (pathSegments.length !== patternSegments.length) return false;

  return patternSegments.every(
    (segment, index) => segment === ":p" || segment === pathSegments[index],
  );
}

export function isKnownUnmocked(
  path: string,
  ledger: readonly string[] = KNOWN_UNMOCKED_PATHS,
): boolean {
  return ledger.some((pattern) => matchesPattern(path, pattern));
}

/**
 * The warning to print, or null to stay quiet.
 *
 * The two cases are worded differently on purpose. A **known** gap is the mocked
 * layer working as documented-but-incomplete, so the message points at the ledger
 * and at the dev stack. An **unknown** gap is new — someone added a call and no
 * handler — so it says that plainly and points at the test that should have
 * caught it.
 */
export function describeUnhandledRequest(input: {
  url: string;
  apiBase: string;
  ledger?: readonly string[];
}): string | null {
  const path = apiRelativePath(input.url, input.apiBase);
  if (path === null) return null;

  const known = isKnownUnmocked(path, input.ledger);
  const remedy = known
    ? [
        "This path is a known gap, listed in web/lib/msw/coverage.ts.",
        "Either run the full dev stack (docker compose -f deploy/docker-compose.dev.yml up),",
        "or set NEXT_PUBLIC_USE_MSW=false to talk to a real API instead of the mocks.",
      ]
    : [
        "This path is NOT in that ledger, so it is a new gap: a call was added with no handler.",
        "Add a handler, or add it to KNOWN_UNMOCKED_PATHS with a reason — the",
        "coverage test (src/msw/coverage.test.ts) fails until one of those happens.",
      ];

  return [
    `[MSW] No mock handler for ${path} — the request went to the network unmocked.`,
    ...remedy,
  ].join("\n        ");
}
