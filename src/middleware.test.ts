import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "../middleware";
import type { ReadinessReport } from "@/lib/features/types";

/**
 * The onboarding gate's **wiring**, not its decision.
 *
 * `entryRedirectFor` is covered by 35 cases in `src/features/readiness.test.ts`,
 * which is where the rule lives. What that cannot cover is the part this file
 * does: that `middleware.ts` actually calls it, *after* the right gate, with the
 * right path, and turns a blocked decision into a redirect. Those are four
 * separate places for the gate to be silently absent — and an absent gate looks
 * exactly like an allowed user, so nothing else in the suite would notice.
 *
 * **Why this is a unit test rather than a browser check.** The blocker here is
 * that the middleware fetches readiness **server-side**, so a browser-level mock
 * cannot influence it: the operator's real organization is `ready`, and the only
 * way to see a blocked user in the browser would be to break their real
 * configuration. That is not something to do to verify a redirect. Stubbing
 * `fetch` exercises the same function the server runs, deterministically, and
 * keeps running in CI.
 *
 * `NEXT_PUBLIC_BASE_PATH` is deliberately left unset so the middleware's base-path
 * stripping is a no-op and the paths under test are the app-relative ones a reader
 * recognises.
 */

const ACTIVE_USER = { user: { onboardingState: "active" } };

function readinessReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    entryAllowed: true,
    readyOrganizationId: "org_ready",
    organizations: [
      {
        id: "org_ready",
        name: "Ready org",
        isPersonal: true,
        role: "admin",
        ready: true,
        steps: [
          {
            id: "cluster",
            label: "Kubernetes cluster",
            satisfied: true,
            detail: null,
            requiresAdmin: true,
            fixPath: "/settings/organization/cluster",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function blockedReport(): ReadinessReport {
  return {
    entryAllowed: false,
    readyOrganizationId: null,
    organizations: [
      {
        id: "org_personal",
        name: "Sarat's workspace",
        isPersonal: true,
        role: "admin",
        ready: false,
        steps: [
          {
            id: "cluster",
            label: "Kubernetes cluster",
            satisfied: false,
            detail: "No Kubernetes cluster is configured for this organization.",
            requiresAdmin: true,
            fixPath: "/settings/organization/cluster",
          },
        ],
      },
    ],
  };
}

/** Stubs the two internal calls the middleware makes, by path. */
function stubApi(input: { me?: unknown; readiness?: unknown; readinessThrows?: boolean }) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url);

    if (href.includes("/auth/me")) {
      return new Response(JSON.stringify(input.me ?? ACTIVE_USER), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("/organizations/readiness")) {
      if (input.readinessThrows) throw new Error("connect ECONNREFUSED");
      return new Response(JSON.stringify(input.readiness ?? readinessReport()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch in middleware: ${href}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function request(path: string) {
  return new NextRequest(new URL(`http://localhost:8080${path}`), {
    headers: { cookie: "yggdrasil_session=sess_1" },
  });
}

/** Where a response sends the browser, or null when it is not a redirect. */
function redirectLocation(response: Response): string | null {
  if (response.status < 300 || response.status >= 400) return null;
  return response.headers.get("location");
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_BASE_PATH;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("middleware — the readiness gate is actually wired", () => {
  it("redirects a blocked user from the hub to onboarding", async () => {
    stubApi({ readiness: blockedReport() });

    const response = await middleware(request("/projects"));

    const location = redirectLocation(response);
    expect(location).toBeTruthy();
    expect(location).toContain("/onboarding/organization");
  });

  it("redirects a blocked user from a deep app route too, not just the hub", async () => {
    // The gate covers the app, not one entry page: a bookmarked or pasted link
    // must not be a way around it, and the issue asks for exactly this.
    stubApi({ readiness: blockedReport() });

    expect(redirectLocation(await middleware(request("/usage")))).toContain(
      "/onboarding/organization",
    );
  });

  it("lets an allowed user straight through", async () => {
    stubApi({ readiness: readinessReport() });

    const response = await middleware(request("/projects"));

    expect(redirectLocation(response)).toBeNull();
  });

  it("does not redirect a blocked user away from the fix path", async () => {
    // The dead-end requirement, at the wiring level: if this regressed, the page
    // offering the fix link would bounce back to itself and the user could never
    // reach the settings that unblock them.
    stubApi({ readiness: blockedReport() });

    const response = await middleware(request("/settings/organization/cluster"));

    expect(redirectLocation(response)).toBeNull();
  });

  it("does not redirect a blocked user away from onboarding itself", async () => {
    // Otherwise the redirect loops.
    stubApi({ readiness: blockedReport() });

    expect(redirectLocation(await middleware(request("/onboarding/organization")))).toBeNull();
  });

  it("does not gate when readiness cannot be read", async () => {
    // Failing closed on a transient API failure would lock every user out of the
    // app — a worse outcome than briefly letting someone in one step early.
    stubApi({ readinessThrows: true });

    expect(redirectLocation(await middleware(request("/projects")))).toBeNull();
  });

  it("still applies the username gate first", async () => {
    // The new gate must not shadow the existing one, nor be reached before a
    // user has a username at all.
    stubApi({ me: { user: { onboardingState: "pending_username" } } });

    const response = await middleware(request("/projects"));

    expect(redirectLocation(response)).toContain("/onboarding/confirm-username");
  });

  it("sends an unsigned request to login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
    );

    const response = await middleware(request("/projects"));

    expect(redirectLocation(response)).toContain("/login");
  });
});
