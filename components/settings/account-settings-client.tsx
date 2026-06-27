"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PasswordRecoveryWarning } from "@/components/auth/password-warning";
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
import {
  disconnectGithub,
  logout,
  setOrChangePassword,
  updateDisplayName,
} from "@/lib/auth/api";
import { AuthApiError } from "@/lib/auth/types";
import { appRoute, oauthStartUrl } from "@/lib/config";

export function AccountSettingsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setDisplayName(user.displayName);
  }, [user]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err === "github_already_linked") {
      setError("That GitHub account is already connected to another user.");
    }
  }, [searchParams]);

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

  async function savePassword() {
    if (!user) return;
    setError(null);
    setMessage(null);
    try {
      await setOrChangePassword({
        currentPassword: user.hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage(user.hasPassword ? "Password changed." : "Password set.");
      setUser({ ...user, hasPassword: true });
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Password update failed");
    }
  }

  async function handleDisconnectGithub() {
    setError(null);
    setMessage(null);
    try {
      const updated = await disconnectGithub();
      setUser(updated);
      setMessage("GitHub disconnected.");
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Disconnect failed");
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
      description="Profile, security, and connections."
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
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              {user.hasPassword ? "Change your password" : "Set a password for backup login"}
            </CardDescription>
          </CardHeader>
          <div className="space-y-4 px-4 pb-4">
            {!user.hasPassword ? <PasswordRecoveryWarning /> : null}
            {user.hasPassword ? (
              <div className="space-y-2">
                <label htmlFor="currentPassword" className="text-sm text-mist">
                  Current password
                </label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm text-mist">
                {user.hasPassword ? "New password" : "Password"}
              </label>
              <Input
                id="newPassword"
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <Button onClick={() => void savePassword()} disabled={!newPassword}>
              {user.hasPassword ? "Change password" : "Set password"}
            </Button>
            <div className="border-t border-rime-soft pt-4">
              <Button variant="outline" onClick={() => void handleLogout()}>
                Log out
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>GitHub is required for agent runs on your repos</CardDescription>
          </CardHeader>
          <div className="space-y-4 px-4 pb-4">
            {user.githubConnected ? (
              <>
                <p className="text-sm text-mist">
                  Connected as{" "}
                  <span className="text-frost">@{user.githubLogin ?? "github"}</span>
                </p>
                <Button
                  variant="outline"
                  disabled={!user.hasPassword}
                  onClick={() => void handleDisconnectGithub()}
                >
                  Disconnect GitHub
                </Button>
                {!user.hasPassword ? (
                  <p className="text-xs text-shadow">
                    Set a password before you can disconnect GitHub.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm text-mist">GitHub is not connected.</p>
                <Button asChild variant="outline">
                  <a href={oauthStartUrl("link")}>Connect GitHub</a>
                </Button>
              </>
            )}
            <p className="text-xs text-shadow">
              Need repo access for projects? Use upgrade from project settings (coming soon)
              or reconnect with broader scopes.
            </p>
          </div>
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
