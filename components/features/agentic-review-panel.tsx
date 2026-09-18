"use client";

import { useEffect, useState } from "react";
import { LoadFailure } from "@/components/ui/load-failure";
import { fetchFeatureAgenticReview } from "@/lib/api";
import type { AgenticReview } from "@/lib/features/types";
import {
  agenticReviewToView,
  blockingLabelFor,
  reviewDetail,
  reviewTimestampLabel,
} from "@/lib/features/agentic-review";
import { FilterToggleGroup } from "@/components/ui/filter-toggle";
import { cn } from "@/lib/utils";

interface AgenticReviewPanelProps {
  projectId: string;
  featureId: string;
}

/**
 * ADR 015 items 13-16 / Track B6: the Agentic Review stage for a feature.
 * Mirrors design/.../agentic-review/index.html: an Approved vs
 * Changes-requested subview, a verdict banner, and the per-location review
 * comment list (blocking flags).
 *
 * **Three outcomes, not two (issue #59).** This panel used to have one failure
 * path and one empty path, and the endpoint 404'd, so *every* visit showed the
 * failure — including the ordinary case of a feature whose review had not run
 * yet. The endpoint now answers `200 {verdict: null}` for "no review yet", which
 * makes the three states genuinely distinguishable, and they must stay that way
 * because they mean different things to the user:
 *
 * - **no review yet** → the empty state below, which says the stage has not run;
 * - **no review on record** (`null`) → the same empty state, reached when the
 *   feature has never been through review at all;
 * - **the request failed** → `LoadFailure`, with copy derived from the status.
 *
 * The `null` case and the failed case are what used to be one thing. A user
 * looking at a permanently "failed" panel would go hunting for a bug that is not
 * there.
 *
 * The panel renders *inside* the feature shell (see `FeatureDetailLayout`), which
 * already renders a full-page `LoadFailure` if the project or feature itself
 * fails — so this uses the `panel` variant rather than a second full-page
 * treatment.
 */
export function AgenticReviewPanel({ projectId, featureId }: AgenticReviewPanelProps) {
  const [review, setReview] = useState<AgenticReview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Non-nullable on purpose: this is a filter with a default, never "no filter".
   * The review's own `verdict` is non-null by the time it reaches here — a review
   * with no verdict is mapped to `null` (no review) rather than to a review whose
   * verdict is null, which is what used to make this panel render the
   * changes-requested banner for a review that had not happened.
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
      .catch((loadError: unknown) => {
        if (!active) return;
        // The thrown message keeps its HTTP status (see `formatApiError`), which
        // is what lets `LoadFailure` classify it rather than echo it.
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load agentic review.",
        );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [projectId, featureId]);

  const view = review ? agenticReviewToView(review) : null;
  const reviewedAt = review ? reviewTimestampLabel(review) : null;
  const detail = review ? reviewDetail(review) : null;
  /**
   * Null when the review's findings are prose, so the banner omits the count
   * instead of printing "no blocking issues" over a review that found some — see
   * `blockingLabelFor`.
   */
  const blockingLabel = review ? blockingLabelFor(review) : null;

  return (
    <section className="rounded-card border border-rime bg-surface-01 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-frost">Agentic Review</h2>
        {blockingLabel ? (
          <span className="text-xs text-shadow">{blockingLabel}</span>
        ) : null}
      </div>

      {error ? <LoadFailure message={error} subject="feature" variant="panel" /> : null}

      {!loaded && !error ? (
        <p className="mt-4 text-sm text-mist">Loading agentic review…</p>
      ) : null}

      {/*
        The empty state, reached two ways and deliberately given one treatment:
        the endpoint answered `200 {verdict: null}`, or it answered `null`. Both
        mean the stage has produced no result, which is what the user needs to
        know; which of the two it technically was is not actionable and not worth
        two different sentences.
      */}
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
            {/*
             * The banner names the verdict and, when it can, the count. It
             * deliberately does **not** quote the summary any more: the summary is
             * rendered as the review's body below, and printing it in both places
             * read as two separate findings. The count phrase is dropped entirely
             * when the findings are prose, because there is no number to give.
             */}
            {view.verdict === "approved" ? (
              <div className="mb-4 rounded-md border border-status-approved/30 bg-status-approved/10 px-4 py-3 text-sm text-mist">
                <span className="text-status-approved">&#9679;</span> Approved
                {blockingLabel ? ` — ${blockingLabel} found` : ""}. Proceeding to Manual
                Review.
              </div>
            ) : (
              <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-mist">
                <span className="text-amber-500">&#9679;</span> Changes requested
                {blockingLabel ? ` — ${blockingLabel}` : ""}. Sent back to Implementation.
              </div>
            )}

            {/* When the review happened. Omitted rather than guessed when the
                response carried no timestamp. */}
            {reviewedAt ? (
              <p className="mb-3 text-xs text-shadow">Reviewed {reviewedAt}</p>
            ) : null}

            {detail?.kind === "structured" ? (
              <div className="space-y-2.5">
                {detail.findings.map((finding, index) => (
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
            ) : null}

            {/*
             * The prose case — what the only producer actually writes today.
             * `whitespace-pre-wrap` because the reviewer's convention is a
             * list of "file/location + what's wrong + what the ADR requires" per
             * issue, one per line; collapsing that to a single paragraph would
             * destroy the only structure it has.
             */}
            {detail?.kind === "prose" ? (
              <div className="rounded-md border border-rime px-4 py-3">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
                  {detail.summary}
                </p>
              </div>
            ) : null}

            {detail?.kind === "none" ? (
              <p className="rounded-md border border-rime-soft px-3 py-2 text-sm text-mist">
                This review recorded a verdict with no comments.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
