"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptOrganizationInvite } from "@/lib/api";
import { appRoute } from "@/lib/config";
import { oauthStartUrl } from "@/lib/config";

export function InviteAccept({ token }: { token: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setError(null);
    setPending(true);
    try {
      const org = await acceptOrganizationInvite(token);
      // Land the user on the org they just joined.
      const target = `${org.isPersonal ? "/projects" : "/settings/organization/general"}`;
      window.location.href = appRoute(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept this invite.");
      setPending(false);
    }
  }

  // Not yet signed in: the API's open registration means signing in is enough.
  // Route through GitHub OAuth and come back to this same page to accept.
  if (!user) {
    return (
      <HubLayout title="Join an organization" className="max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>You&apos;ve been invited to a Yggdrasil organization</CardTitle>
            <CardDescription>
              Sign in with GitHub to accept — new or existing account, registration is open.
            </CardDescription>
          </CardHeader>
          <div className="px-4 pb-4">
            <Button asChild>
              <a href={oauthStartUrl(`/organizations/invites/${token}`)}>Sign in with GitHub</a>
            </Button>
          </div>
        </Card>
      </HubLayout>
    );
  }

  return (
    <HubLayout title="Join an organization" className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Accept this invite?</CardTitle>
          <CardDescription>Accepting adds you to the organization you were invited to.</CardDescription>
        </CardHeader>
        <div className="px-4 pb-4">
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-3">
            <Button onClick={() => void accept()} disabled={pending}>
              {pending ? "Accepting…" : "Accept invite"}
            </Button>
            <Button variant="outline" asChild>
              <a href={appRoute("/projects")}>Cancel</a>
            </Button>
          </div>
        </div>
      </Card>
    </HubLayout>
  );
}