"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { PasswordRecoveryWarning } from "@/components/auth/password-warning";
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
import { signup } from "@/lib/auth/api";
import { AuthApiError } from "@/lib/auth/types";
import { appRoute, oauthStartUrl } from "@/lib/config";

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await signup({
        username,
        password,
        displayName: displayName || undefined,
      });
      setUser(user);
      router.push(appRoute("/"));
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create account" description="Join your Yggdrasil instance">
      <Card>
        <CardHeader>
          <CardTitle>Sign up</CardTitle>
          <CardDescription>Choose a permanent username</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <PasswordRecoveryWarning />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm text-mist">
              Username
            </label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              pattern="[a-z0-9_-]{3,32}"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="displayName" className="text-sm text-mist">
              Display name (optional)
            </label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-mist">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <CardFooter className="flex-col gap-3 border-t border-rime-soft pt-4">
          <Button
            variant="outline"
            className="w-full"
            type="button"
            onClick={() => {
              window.location.href = oauthStartUrl("signup");
            }}
          >
            Continue with GitHub
          </Button>
          <p className="text-sm text-mist">
            Already have an account?{" "}
            <Link href={appRoute("/login")} className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
