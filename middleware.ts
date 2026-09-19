import { NextResponse, type NextRequest } from "next/server";
import { appPath, internalApiUrl } from "@/lib/config";
import {
  ORGANIZATION_ONBOARDING_PATH,
  entryRedirectFor,
} from "@/lib/features/readiness";
import type { ReadinessReport } from "@/lib/features/types";

const PUBLIC_PATHS = ["/login"];
const CONFIRM_USERNAME_PATH = "/onboarding/confirm-username";

function stripBasePath(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }
  return pathname;
}

/**
 * Issue #35: the user's organizations' readiness, or null when it cannot be
 * established.
 *
 * **Null means "do not gate", which is deliberate and is the same posture the
 * `/auth/me` call below already takes.** Failing closed here would mean a
 * transient API blip, a restarting container, or a migration in flight locks
 * every user out of the whole app — a much worse outcome than briefly letting
 * someone reach a dashboard one step early. The gate exists to stop a *dead end*,
 * not to be an authorization boundary; the real gates are server-side (the create
 * gate, and every settings route's own role check), so nothing here is load
 * bearing for security.
 */
async function fetchReadiness(cookie: string): Promise<ReadinessReport | null> {
  try {
    const response = await fetch(internalApiUrl("/organizations/readiness"), {
      headers: { cookie },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as ReadinessReport;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const path = stripBasePath(request.nextUrl.pathname, basePath);

  if (PUBLIC_PATHS.some((publicPath) => path === publicPath)) {
    return NextResponse.next();
  }

  const cookie = request.headers.get("cookie") ?? "";
  let meResponse: Response;
  try {
    meResponse = await fetch(internalApiUrl("/auth/me"), {
      headers: { cookie },
      cache: "no-store",
    });
  } catch {
    // API unreachable (e.g. container restarting) — don't crash the page shell.
    return NextResponse.next();
  }

  if (meResponse.status === 401) {
    const loginUrl = new URL(appPath("/login"), request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!meResponse.ok) {
    return NextResponse.next();
  }

  const data = (await meResponse.json()) as {
    user: { onboardingState: string };
  };

  if (
    data.user.onboardingState === "pending_username" &&
    path !== CONFIRM_USERNAME_PATH
  ) {
    return NextResponse.redirect(new URL(appPath(CONFIRM_USERNAME_PATH), request.url));
  }

  if (path === CONFIRM_USERNAME_PATH && data.user.onboardingState === "active") {
    return NextResponse.redirect(new URL(appPath("/"), request.url));
  }

  /*
   * The second gate (issue #35): organization readiness.
   *
   * The first gate is identity — you must have confirmed a username. This one is
   * capability: a user whose organizations are all unconfigured would reach a
   * dashboard whose "Create project" cannot succeed, fill in the whole form, and
   * only then get a 400 naming an org-level setting they have never seen. So they
   * are held at onboarding instead, which is the same shape as the username gate
   * above and for the same reason.
   *
   * **Skipped entirely on `/onboarding`**, for two reasons that happen to agree:
   * those paths are exempt from the gate by definition (redirecting to onboarding
   * from onboarding is the one guaranteed loop), and skipping saves the call
   * precisely when the user is most likely to be blocked — the case where they are
   * sitting on the page this gate sends people to. The page fetches readiness
   * itself to render its checklist, so nothing is lost.
   *
   * The cost of the call on every other request is real and accepted: readiness is
   * a defaults read plus one model resolution per org, and it runs once per
   * navigation. It is a deliberate trade against asking on *submit* instead, which
   * is the failure this issue exists to remove. `/auth/me` is already fetched on
   * every request here for the same reason.
   */
  if (data.user.onboardingState === "active" && !path.startsWith("/onboarding")) {
    const report = await fetchReadiness(cookie);
    if (report) {
      const redirectTo = entryRedirectFor(path, report);
      if (redirectTo) {
        return NextResponse.redirect(new URL(appPath(redirectTo), request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mockServiceWorker.js|branding).*)"],
};

/**
 * Exported for the middleware's own tests, which need the path it redirects to
 * without importing the module that computes it.
 */
export { ORGANIZATION_ONBOARDING_PATH };
