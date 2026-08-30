"use client";

import { useState } from "react";
import type { Feature } from "@/lib/features/types";
import {
  MANUAL_REVIEW_SUBVIEWS,
  manualReviewStatusCopy,
  manualReviewSubviewForStatus,
  type ManualReviewSubview,
} from "@/lib/features/manual-review";
import { cn } from "@/lib/utils";

interface ManualReviewPanelProps {
  projectId: string;
  feature: Feature;
}

/**
 * ADR 015 item 17 / Track B7: Manual Review is a UI grouping of three real
 * feature states — `in_review`, `returned` (the "Changes Requested" tab), and
 * `merged`. Renders PR link + ADR summary per subview. For `returned` the
 * resume control lives in the pre-existing "Returned for changes" banner in
 * FeatureDetailClient, so it is intentionally NOT duplicated here — this
 * panel is a complement (PR + ADR context), not a second resume surface.
 */
export function ManualReviewPanel({ projectId, feature }: ManualReviewPanelProps) {
  const [subview, setSubview] = useState<ManualReviewSubview>(
    manualReviewSubviewForStatus(feature.status),
  );
  void projectId;

  return (
    <section className="rounded-card border border-rime bg-surface-01 p-6">
      <h2 className="text-base font-semibold text-frost">Manual Review</h2>

      <div className="mt-3 flex gap-4 border-b border-rime-soft">
        {MANUAL_REVIEW_SUBVIEWS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubview(tab.id)}
            className={cn(
              "border-b-2 px-1 pb-2 text-[13px] font-medium transition-colors",
              subview === tab.id
                ? "border-bifrost text-frost"
                : "border-transparent text-mist hover:text-frost",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-[13px] text-mist">
          {manualReviewStatusCopy(subview, feature)}
        </p>

        {feature.prUrl ? (
          <a
            href={feature.prUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-bifrost hover:underline"
          >
            {feature.prUrl}
          </a>
        ) : (
          <p className="mt-2 text-sm text-shadow">No pull request linked yet.</p>
        )}

        {(feature.title || feature.specExcerpt) && (
          <div className="mt-3 rounded-md bg-surface-02 px-4 py-3">
            <h3 className="text-[15px] font-medium text-frost">ADR: {feature.title}</h3>
            {feature.specExcerpt ? (
              <p className="mt-1 text-[13px] leading-relaxed text-mist">
                {feature.specExcerpt}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}