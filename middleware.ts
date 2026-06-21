import { NextResponse, type NextRequest } from "next/server";
import { appPath, internalApiUrl } from "@/lib/config";

const PUBLIC_PATHS = ["/login", "/signup"];
const ONBOARDING_PATH = "/onboarding/confirm-username";

function stripBasePath(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }
  return pathname;
}

export async function middleware(request: NextRequest) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const path = stripBasePath(request.nextUrl.pathname, basePath);

  if (PUBLIC_PATHS.some((publicPath) => path === publicPath)) {
    return NextResponse.next();
  }

  const cookie = request.headers.get("cookie") ?? "";
  const meResponse = await fetch(internalApiUrl("/auth/me"), {
    headers: { cookie },
    cache: "no-store",
  });

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
    path !== ONBOARDING_PATH
  ) {
    return NextResponse.redirect(new URL(appPath(ONBOARDING_PATH), request.url));
  }

  if (path === ONBOARDING_PATH && data.user.onboardingState === "active") {
    return NextResponse.redirect(new URL(appPath("/"), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mockServiceWorker.js|branding).*)"],
};
