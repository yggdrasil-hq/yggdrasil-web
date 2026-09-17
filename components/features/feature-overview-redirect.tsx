"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFeatureDetail } from "@/components/features/feature-detail-context";
import { featureEntryPath } from "@/lib/features/grill";
import { appRoute } from "@/lib/config";

/**
 * The bare `/projects/:projectId/features/:featureId` route has no page of
 * its own. design/projects/detail/features/detail/index.html sketches it as
 * an overview dashboard (run history, token usage), but none of that has a
 * backing API today — its own design-note calls the token-usage numbers
 * "illustrative, no tracking exists yet." Rather than build a page around
 * invented data, this redirects to whichever page the feature's actual
 * status maps to.
 *
 * For a `draft` feature that is now the full-page grill chat rather than the
 * Spec stage page: the transcript *is* its spec stage until `submit_adr`
 * lands, and this is the path the action queue's "Grill response needed"
 * item links to (yggdrasil-web#1).
 */
export function FeatureOverviewRedirect() {
  const router = useRouter();
  const { projectId, featureId, feature } = useFeatureDetail();

  useEffect(() => {
    router.replace(appRoute(featureEntryPath(projectId, featureId, feature)));
    // Only status/adrApproved actually change which stage we land on; other
    // feature-field changes (e.g. adrMarkdown edits) shouldn't re-trigger a
    // redirect once we've already navigated away from this route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, featureId, feature.status, feature.adrApproved, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-mist">
      Redirecting…
    </div>
  );
}
