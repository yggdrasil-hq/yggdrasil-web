"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { UserAvatar } from "@/components/auth/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { confirmUsername } from "@/lib/auth/api";
import { AuthApiError } from "@/lib/auth/types";
import { appRoute } from "@/lib/config";

export default function ConfirmUsernamePage() {
  const router = useRouter();
  const { user, loading, setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(appRoute("/login"));
      return;
    }
    if (user?.onboardingState === "active") {
      router.replace(appRoute("/"));
      return;
    }
    if (user) {
      setUsername(user.username);
      setDisplayName(user.displayName);
    }
  }, [user, loading, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await confirmUsername({
        username,
        displayName: displayName || undefined,
      });
      setUser(updated);
      router.push(appRoute("/"));
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Could not confirm username");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading…
      </div>
    );
  }

  return (
    <AuthLayout
      title="Confirm username"
      description="Your username is permanent. Choose carefully."
    >
      <Card>
        <CardHeader className="items-center text-center">
          <UserAvatar username={username || user.username} className="size-16" />
          <CardTitle>Almost there</CardTitle>
          <CardDescription>
            Default from GitHub: <strong className="text-frost">{user.username}</strong>
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm text-mist">
              Username
            </label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              pattern="[a-z0-9_-]{3,32}"
              required
            />
          </div>
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
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Confirm and continue"}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
