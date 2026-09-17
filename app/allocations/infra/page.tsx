import { Suspense } from "react";
import { InfraAllocationsPageClient } from "@/components/allocations/infra-allocations-page-client";

// Suspense boundary: the page reads the ?org= param through useSearchParams
// (via useActiveOrganization), which Next requires to be wrapped for the
// static prerender. Same shape as /usage and /analytics.
export default function InfraAllocationsPage() {
  return (
    <Suspense>
      <InfraAllocationsPageClient />
    </Suspense>
  );
}
