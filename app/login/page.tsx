import { Suspense } from "react";
import { LoginPageClient } from "@/components/auth/login-page-client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-mist">Loading…</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
