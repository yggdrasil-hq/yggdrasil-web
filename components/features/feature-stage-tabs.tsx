"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FEATURE_STAGES,
  featureStagePath,
  featureStageProgress,
  type FeatureStageId,
} from "@/lib/features/stage";
import { appRoute } from "@/lib/config";
import { cn } from "@/lib/utils";

interface FeatureStageTabsProps {
  projectId: string;
  featureId: string;
  currentStage: FeatureStageId;
}

/**
 * The six-stage progress nav shown on every feature-detail page — mirrors
 * design/projects/detail/features/detail/*'s persistent `.feature-steps`
 * strip. `currentStage` (from lib/features/stage.ts, derived from the
 * feature's real status) drives the done/active/upcoming styling. Which tab
 * is "here" — the page actually being viewed — is derived from the
 * pathname instead, since all six routes are directly navigable regardless
 * of where the feature's own status currently sits.
 */
export function FeatureStageTabs({ projectId, featureId, currentStage }: FeatureStageTabsProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Feature stages"
      className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-card border border-rime bg-surface-01 px-3 py-2.5"
    >
      {FEATURE_STAGES.map((stage, index) => {
        const progress = featureStageProgress(stage.id, currentStage);
        const href = appRoute(featureStagePath(projectId, featureId, stage.id));
        const isHere = pathname === href;

        return (
          <div key={stage.id} className="flex items-center gap-1">
            {index > 0 ? (
              <span className="px-0.5 text-shadow" aria-hidden>
                &rarr;
              </span>
            ) : null}
            <Link
              href={href}
              aria-current={isHere ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] transition-colors",
                isHere
                  ? "bg-bifrost/15 font-medium text-frost"
                  : progress === "upcoming"
                    ? "text-shadow hover:text-mist"
                    : "text-mist hover:text-frost",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                  progress === "done"
                    ? "bg-status-approved/20 text-status-approved"
                    : progress === "active"
                      ? "bg-bifrost/20 text-bifrost"
                      : "bg-surface-03 text-shadow",
                )}
                aria-hidden
              >
                {progress === "done" ? "✓" : index + 1}
              </span>
              {stage.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
