"use client";

import { useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { oauthStartUrl, stripAppBasePath } from "@/lib/config";

const ERROR_MESSAGES: Record<string, string> = {
  github_not_configured: "GitHub sign-in is not configured for this instance.",
  github_denied: "GitHub sign-in was cancelled.",
  github_invalid: "GitHub sign-in failed. Please try again.",
  github_state_invalid: "That sign-in link expired. Please try again.",
  github_failed: "GitHub sign-in failed. Please try again.",
};

export function LoginPageClient() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const error = errorCode ? ERROR_MESSAGES[errorCode] ?? "Sign-in failed. Please try again." : null;

  const next = stripAppBasePath(searchParams.get("next") ?? "/");

  return (
    <AuthLayout title="Sign in" description="Welcome to Yggdrasil">
      <Card>
        <CardHeader>
          <CardTitle>Sign in with GitHub</CardTitle>
          <CardDescription>
            Your Yggdrasil account is your GitHub identity.
          </CardDescription>
        </CardHeader>
        <div className="space-y-4 px-4 pb-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            className="w-full"
            type="button"
            onClick={() => {
              window.location.href = oauthStartUrl(next);
            }}
          >
            Continue with GitHub
          </Button>
        </div>
      </Card>
    </AuthLayout>
  );
}
