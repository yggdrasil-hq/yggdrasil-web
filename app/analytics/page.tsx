import { Suspense } from "react";
import { AnalyticsPageClient } from "@/components/analytics/analytics-page-client";

// Suspense boundary: the page reads the ?org= param through useSearchParams,
// which Next requires to be wrapped for the static prerender.
export default function AnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsPageClient />
    </Suspense>
  );
}
