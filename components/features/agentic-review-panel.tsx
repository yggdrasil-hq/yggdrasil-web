"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import { useEffect, useState } from "react";
import { fetchFeatureAgenticReview } from "@/lib/api";
import type { AgenticReview } from "@/lib/features/types";
import { agenticReviewToView, blockStatusLabel } from "@/lib/features/agentic-review";
import { FilterToggleGroup } from "@/components/ui/filter-toggle";
import { cn } from "@/lib/utils";

interface AgenticReviewPanelProps {
  projectId: string;
  featureId: string;
}

/**
 * ADR 015 items 13-16 / Track B6: the Agentic Review stage for a feature in
 * `status === "agentic_review"`. Mirrors design/.../agentic-review/index.html:
 * an Approved vs Changes-requested subview, a verdict banner, and the
 * per-location review comment list (blocking flags). An honest empty state
 * renders while the stage hasn't produced a result yet.
 */
export function AgenticReviewPanel({ projectId, featureId }: AgenticReviewPanelProps) {
  const [review, setReview] = useState<AgenticReview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Non-nullable on purpose: this is a filter with a default, never "no filter".
   * The review's own `verdict` may be null (no verdict yet), but that is a
   * property of the data, not of the selected subview — and leaving null in the
   * type let the toggle render with no option pressed.
   */
  const [subview, setSubview] = useState<NonNullable<AgenticReview["verdict"]>>("approved");

  useEffect(() => {
    let active = true;
    setLoaded(false);
    fetchFeatureAgenticReview(projectId, featureId)
      .then((data) => {
        if (!active) return;
        setReview(data);
        setError(null);
        if (data?.verdict) setSubview(data.verdict);
      })
      .catch(() => {
        if (active) setError("Unable to load agentic review.");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [projectId, featureId]);

  const view = review ? agenticReviewToView(review) : null;

  return (
    <section className="rounded-card border border-rime bg-surface-01 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-frost">Agentic Review</h2>
        {view ? (
          <span className="text-xs text-shadow">{blockStatusLabel(view.blockingCount)}</span>
        ) : null}
      </div>

      {error ? <ErrorMessage className="mt-3 text-sm text-destructive">{error}</ErrorMessage> : null}

      {!loaded ? (
        <p className="mt-4 text-sm text-mist">Loading agentic review…</p>
      ) : null}

      {loaded && !error && !review ? (
        <div className="mt-4 rounded-md border border-dashed border-rime px-4 py-5 text-sm text-shadow">
          Agentic review hasn&apos;t run for this feature yet — it starts automatically once
          Testing passes.
        </div>
      ) : null}

      {loaded && !error && review && view ? (
        <div className="mt-4">
          <FilterToggleGroup
            label="Review verdict filter"
            options={[
              { id: "approved", label: "Approved" },
              { id: "changes_requested", label: "Changes requested" },
            ] as const}
            value={subview}
            onChange={setSubview}
          />

          <div className="mt-4">
            {view.verdict === "approved" ? (
              <div className="mb-4 rounded-md border border-status-approved/30 bg-status-approved/10 px-4 py-3 text-sm text-mist">
                <span className="text-status-approved">&#9679;</span> Approved —{" "}
                {blockStatusLabel(view.blockingCount)} found. Proceeding to Manual Review.
              </div>
            ) : (
              <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-mist">
                <span className="text-amber-500">&#9679;</span> Changes requested —{" "}
                {blockStatusLabel(view.blockingCount)}. Sent back to Implementation
                {review.comment ? `: "${review.comment}"` : " with a comment"}.
              </div>
            )}

            {review.findings.length === 0 ? (
              <p className="rounded-md border border-rime-soft px-3 py-2 text-sm text-mist">
                No comments on this review.
              </p>
            ) : (
              <div className="space-y-2.5">
                {review.findings.map((finding, index) => (
                  <div
                    key={`${finding.location}-${index}`}
                    className={cn(
                      "rounded-md border border-rime px-4 py-3",
                      finding.blocking && "border-status-rejected/30",
                    )}
                  >
                    <p
                      className={cn(
                        "font-mono text-xs",
                        finding.blocking ? "text-status-rejected" : "text-shadow",
                      )}
                    >
                      {finding.location}
                      {finding.blocking ? " · blocking" : ""}
                    </p>
                    <p className="mt-1 text-[13px] text-mist">{finding.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}