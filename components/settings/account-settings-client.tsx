"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/auth/user-avatar";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { logout, updateDisplayName } from "@/lib/auth/api";
import { AuthApiError } from "@/lib/auth/types";
import { appRoute } from "@/lib/config";

export function AccountSettingsClient() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setDisplayName(user.displayName);
  }, [user]);

  if (!user) return null;

  async function saveProfile() {
    setError(null);
    setMessage(null);
    try {
      const updated = await updateDisplayName(displayName);
      setUser(updated);
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Update failed");
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    router.push(appRoute("/login"));
  }

  return (
    <HubLayout
      title="Account"
      description="Profile and default model configuration."
      className="max-w-2xl"
    >
      <div className="space-y-6">
        {message ? <p className="text-sm text-bifrost">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Username <span className="text-frost">@{user.username}</span> is permanent
              &middot; signed in with GitHub as{" "}
              <span className="text-frost">@{user.githubLogin}</span>
            </CardDescription>
          </CardHeader>
          <div className="flex items-center gap-4 px-4 pb-4">
            <UserAvatar username={user.username} className="size-14" />
            <div className="flex-1 space-y-3">
              <div className="space-y-2">
                <label htmlFor="displayName" className="text-sm text-mist">
                  Display name
                </label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <Button onClick={() => void saveProfile()}>Save profile</Button>
            </div>
          </div>
          <div className="border-t border-rime-soft px-4 py-4">
            <Button variant="outline" onClick={() => void handleLogout()}>
              Log out
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default model configuration</CardTitle>
            <CardDescription>
              Model configuration now lives at the organization level (ADR 016). Configure it
              in{" "}
              <Link
                href={appRoute("/settings/organization/providers")}
                className="text-primary hover:underline"
              >
                Organization settings
              </Link>{" "}
              — every project inherits its organization&apos;s config.
            </CardDescription>
          </CardHeader>
        </Card>

        <p className="text-sm text-mist">
          <Link href={appRoute("/projects")} className="text-primary hover:underline">
            Back to projects
          </Link>
        </p>
      </div>
    </HubLayout>
  );
}
