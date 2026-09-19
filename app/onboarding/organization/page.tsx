"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorMessage } from "@/components/ui/error-message";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchOrganizationReadiness } from "@/lib/api";
import { logout } from "@/lib/auth/api";
import { appRoute } from "@/lib/config";
import {
  blockingOrganizations,
  blockersFor,
  cannotFixNotice,
  canUnblockOrg,
  onboardingExplanation,
  onboardingHeadline,
  roleLabel,
} from "@/lib/features/readiness";
import type { OrganizationReadiness, ReadinessReport } from "@/lib/features/types";

/**
 * Issue #35's second onboarding step: organization readiness.
 *
 * **Why a page rather than a banner on the dashboard.** The issue's failure is a
 * user reaching a dashboard that offers an action which cannot succeed. A banner
 * leaves that action on screen behind a warning; holding them here removes it.
 * The middleware does the holding (see `middleware.ts`), so this page is what a
 * blocked user sees instead of the app, and it is deliberately reachable when
 * blocked — a gate that also blocks the page explaining it is the dead end the
 * issue forbids.
 *
 * **Why it fetches its own readiness rather than receiving it.** The middleware
 * skips this call on `/onboarding` (it has no decision to make here), so this is
 * the only fetch, and having the page own it is what makes "Check again" work:
 * the user completes a step in organization settings, comes back, and the
 * checklist reflects reality rather than a value captured before they acted.
 *
 * The decisions — which org to blame, which steps are actionable, what a
 * non-admin is told — are in `lib/features/readiness.ts` so they are testable
 * without a browser and so the middleware and this page cannot disagree.
 */
export default function OrganizationOnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchOrganizationReadiness();
      setReport(next);
      setLoadFailed(false);
      // Same shape as `confirm-username`'s redirect: once the condition this page
      // exists for is satisfied, it has nothing to say, so leave. Safe from
      // looping because `/projects` is not exempt — an allowed user passes the
      // gate and is not sent back here.
      if (next.entryAllowed) router.replace(appRoute("/projects"));
    } catch {
      setLoadFailed(true);
    }
  }, [router]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(appRoute("/login"));
      return;
    }
    if (user) void load();
  }, [user, loading, router, load]);

  async function handleCheckAgain() {
    setChecking(true);
    await load();
    setChecking(false);
  }

  if (loading || !user || (!report && !loadFailed)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading…
      </div>
    );
  }

  /*
   * An unreadable readiness report is shown as its own state rather than as "not
   * ready". The two are genuinely different — one is a transient failure the user
   * can retry, the other is a configuration task — and rendering a checklist of
   * invented blockers would send someone to change settings that may be fine.
   */
  if (loadFailed || !report) {
    return (
      <AuthLayout title="Could not check your organization">
        <Card>
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
            <CardDescription>
              We could not read your organization&apos;s setup state. This is usually
              temporary.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <Button onClick={() => void handleCheckAgain()} disabled={checking}>
              {checking ? "Checking…" : "Try again"}
            </Button>
            <Button variant="ghost" asChild>
              <Link href={appRoute("/login")}>Back to sign in</Link>
            </Button>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  const blocking = blockingOrganizations(report);

  return (
    <AuthLayout
      title={onboardingHeadline(report)}
      description={onboardingExplanation(report)}
    >
      <div className="space-y-4">
        {blocking.map((org) => (
          <OrganizationChecklist key={org.id} org={org} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => void handleCheckAgain()} disabled={checking}>
          {checking ? "Checking…" : "Check again"}
        </Button>
        {/*
         * A way out that does not require being allowed in. Without this a blocked
         * user has no route to sign out, because `/settings/account` sits behind
         * the same gate — a small trap inside the larger one this page exists to
         * prevent.
         */}
        <Button
          variant="ghost"
          onClick={async () => {
            await logout();
            window.location.href = appRoute("/login");
          }}
        >
          Log out
        </Button>
      </div>
    </AuthLayout>
  );
}

/**
 * One organization's outstanding steps.
 *
 * Renders every unmet step rather than only the first: they are independent
 * settings, and showing one at a time turns a two-item checklist into a sequence
 * of round trips.
 */
function OrganizationChecklist({ org }: { org: OrganizationReadiness }) {
  const blockers = blockersFor(org);
  const cannotFix = cannotFixNotice(org);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{org.name}</CardTitle>
          {org.isPersonal ? <Badge variant="outline">Personal</Badge> : null}
          <Badge variant="outline">{roleLabel(org.role)}</Badge>
        </div>
        <CardDescription>
          {canUnblockOrg(org)
            ? "These settings are organization-level, so they are configured once for every project here."
            : "These settings are organization-level and need an administrator."}
        </CardDescription>
      </CardHeader>
      <ul className="space-y-3 px-4 pb-4">
        {blockers.map(({ step, actionable, detail }) => (
          <li
            key={step.id}
            className="rounded-md border border-rime-soft px-3 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-frost">{step.label}</span>
              {actionable ? (
                <Button size="sm" variant="outline" asChild>
                  {/* `fixPath` arrives app-relative, like a notification link. */}
                  <Link href={appRoute(step.fixPath)}>Set up</Link>
                </Button>
              ) : (
                <span className="text-xs text-shadow">
                  Needs an organization admin
                </span>
              )}
            </div>
            {detail ? <p className="mt-1 text-sm text-mist">{detail}</p> : null}
          </li>
        ))}
      </ul>
      {cannotFix ? (
        <div className="px-4 pb-4">
          {/*
           * The non-dead-end requirement, handled by explaining rather than by
           * offering a form that would 403. `cannotFixNotice` returns null for
           * anyone who *can* act, so this is only ever shown to someone who
           * genuinely cannot.
           */}
          <ErrorMessage className="text-sm text-mist">{cannotFix}</ErrorMessage>
        </div>
      ) : null}
    </Card>
  );
}
