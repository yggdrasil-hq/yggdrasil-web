import { describe, expect, it } from "vitest";
import {
  apiRelativePath,
  describeUnhandledRequest,
  isKnownUnmocked,
  matchesPattern,
} from "@/lib/msw/unhandled-request";

/**
 * Issue #64: the message a developer sees when the mock layer has a hole.
 *
 * The test is mostly about what this says *nothing* about, because the previous
 * silent-"bypass" behaviour was replaced by a warning that must not become noise
 * a developer learns to scroll past. A non-API request (a JS chunk, a CSS file,
 * an RSC payload) drawing a warning would do exactly that.
 */

const LEDGER = ["/projects/:p/deploys", "/organizations/:p/usage"];

describe("apiRelativePath", () => {
  it("strips the origin and the API base path", () => {
    expect(
      apiRelativePath("http://localhost:3000/app/api/projects/abc/deploys", "/app/api"),
    ).toBe("/projects/abc/deploys");
  });

  it("strips a bare API base", () => {
    expect(apiRelativePath("http://localhost:3000/api/health", "/api")).toBe("/health");
  });

  it("ignores a query string", () => {
    expect(
      apiRelativePath("http://localhost:3000/app/api/projects/abc/usage?days=30", "/app/api"),
    ).toBe("/projects/abc/usage");
  });

  // The load-bearing filter: everything else the page fetches goes through the
  // same service worker, and warning about static assets would bury the signal.
  it("returns null for a request that is not an API call", () => {
    expect(
      apiRelativePath("http://localhost:3000/app/_next/static/chunk.js", "/app/api"),
    ).toBeNull();
    expect(apiRelativePath("http://localhost:3000/app/favicon.ico", "/app/api")).toBeNull();
    expect(
      apiRelativePath("http://localhost:3000/app/projects/abc", "/app/api"),
    ).toBeNull();
  });

  it("returns null rather than throwing on a malformed URL", () => {
    expect(apiRelativePath("not a url", "/api")).toBeNull();
  });

  // "/app/api" must not match "/app/apiary".
  it("does not treat a sibling path sharing the base's prefix as an API call", () => {
    expect(apiRelativePath("http://x/app/apiary/thing", "/app/api")).toBeNull();
  });

  it("handles a base path given with a trailing slash", () => {
    expect(apiRelativePath("http://x/app/api/projects/abc", "/app/api/")).toBe("/projects/abc");
  });
});

describe("matchesPattern", () => {
  it("matches a concrete path against a parameterised one", () => {
    expect(matchesPattern("/projects/abc/deploys", "/projects/:p/deploys")).toBe(true);
    expect(matchesPattern("/organizations/org_1/usage", "/organizations/:p/usage")).toBe(true);
  });

  it("requires the same segment count, so a sub-path is not a match", () => {
    expect(matchesPattern("/projects/abc/deploys/1", "/projects/:p/deploys")).toBe(false);
  });

  it("requires literal segments to match", () => {
    expect(matchesPattern("/projects/abc/rollback", "/projects/:p/deploys")).toBe(false);
  });
});

describe("describeUnhandledRequest", () => {
  it("stays silent for a non-API request", () => {
    expect(
      describeUnhandledRequest({
        url: "http://x/app/_next/static/chunk.js",
        apiBase: "/app/api",
        ledger: LEDGER,
      }),
    ).toBeNull();
  });

  it("names MSW and the path for a known gap", () => {
    const message = describeUnhandledRequest({
      url: "http://x/app/api/projects/abc/deploys",
      apiBase: "/app/api",
      ledger: LEDGER,
    });

    expect(message).toContain("[MSW]");
    expect(message).toContain("/projects/abc/deploys");
    expect(message).toContain("known gap");
    expect(message).toContain("NEXT_PUBLIC_USE_MSW=false");
  });

  // A new gap needs a different action from a known one: one is "the mocks are
  // incomplete", the other is "someone forgot a handler".
  it("says a path outside the ledger is a new gap and names the test", () => {
    const message = describeUnhandledRequest({
      url: "http://x/app/api/projects/abc/brand-new",
      apiBase: "/app/api",
      ledger: LEDGER,
    });

    expect(message).toContain("new gap");
    expect(message).toContain("KNOWN_UNMOCKED_PATHS");
    expect(message).toContain("coverage.test.ts");
  });

  it("reports the API-relative path, not the full URL", () => {
    const message = describeUnhandledRequest({
      url: "http://x/app/api/organizations/org_1/usage",
      apiBase: "/app/api",
      ledger: LEDGER,
    });

    expect(message).toContain("/organizations/org_1/usage");
    expect(message).not.toContain("http://");
  });
});

describe("isKnownUnmocked", () => {
  it("recognises a ledger entry and rejects anything else", () => {
    expect(isKnownUnmocked("/projects/abc/deploys", LEDGER)).toBe(true);
    expect(isKnownUnmocked("/projects/abc/rollback", LEDGER)).toBe(false);
  });

  // Defaulting to the real ledger is what lets the provider call this with no
  // second argument, keeping the two sides from disagreeing about the gap.
  it("defaults to the repo's own ledger", () => {
    expect(isKnownUnmocked("/projects/abc/deploys")).toBe(true);
  });
});
