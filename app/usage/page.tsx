import { Suspense } from "react";
import { UsagePageClient } from "@/components/usage/usage-page-client";

// Suspense boundary: the page reads the ?org= param through useSearchParams,
// which Next requires to be wrapped for the static prerender.
export default function UsagePage() {
  return (
    <Suspense>
      <UsagePageClient />
    </Suspense>
  );
}
