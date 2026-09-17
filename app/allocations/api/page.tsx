import { Suspense } from "react";
import { ApiAllocationsPageClient } from "@/components/allocations/api-allocations-page-client";

// Suspense boundary: the page reads the ?org= param through useSearchParams
// (via useActiveOrganization), which Next requires to be wrapped for the
// static prerender. Same shape as /usage and /analytics.
export default function ApiAllocationsPage() {
  return (
    <Suspense>
      <ApiAllocationsPageClient />
    </Suspense>
  );
}
