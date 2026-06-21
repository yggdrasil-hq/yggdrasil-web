"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { login } from "@/lib/auth/api";
import { AuthApiError } from "@/lib/auth/types";
import { appPath, appRoute, oauthStartUrl, stripAppBasePath } from "@/lib/config";

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUnlinkedChoice, setShowUnlinkedChoice] = useState(
    searchParams.get("error") === "github_unlinked",
  );
  const githubLogin = searchParams.get("github_login");

  const next = stripAppBasePath(searchParams.get("next") ?? appRoute("/"));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login({ username, password, rememberMe });
      setUser(user);
      router.push(
        user.onboardingState === "pending_username"
          ? appRoute("/onboarding/confirm-username")
          : next,
      );
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Sign in" description="Welcome back to Yggdrasil">
      {showUnlinkedChoice ? (
        <Card>
          <CardHeader>
            <CardTitle>GitHub not linked</CardTitle>
            <CardDescription>
              {githubLogin
                ? `No Yggdrasil account is linked to GitHub user @${githubLogin}.`
                : "No Yggdrasil account is linked to that GitHub identity."}
            </CardDescription>
          </CardHeader>
          <div className="space-y-3 px-4 pb-4">
            <p className="text-sm text-mist">
              Sign in with your username and password, then connect GitHub in account
              settings — or create a new account.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={() => setShowUnlinkedChoice(false)}>
                Sign in to link
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <Link href={appRoute("/signup")}>Create new account</Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Use your username and password</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm text-mist">
              Username
            </label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-mist">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-mist">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-input"
            />
            Remember me for 30 days
          </label>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <CardFooter className="flex-col gap-3 border-t border-rime-soft pt-4">
          <Button
            variant="outline"
            className="w-full"
            type="button"
            onClick={() => {
              window.location.href = oauthStartUrl("login");
            }}
          >
            Continue with GitHub
          </Button>
          <p className="text-sm text-mist">
            No account?{" "}
            <Link href={appRoute("/signup")} className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
