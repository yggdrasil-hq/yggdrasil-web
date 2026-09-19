import type {
  AgenticReview,
  AgenticReviewComment,
  AgenticReviewFinding,
  AgenticReviewResponse,
} from "./types";

/**
 * ADR 015 items 13-16: the Agentic Review stage's pure logic.
 *
 * The panel renders; everything decidable lives here, because vitest runs in a
 * `node` environment with no React testing library — the same split as
 * `test-runs.ts` and `testing.ts`.
 */

/**
 * Turns an endpoint response into what the panel renders, or `null` for "no
 * review yet".
 *
 * **`verdict: null` is the empty state, not a review.** This is the bug the
 * mapper exists to prevent, and it is not hypothetical: the panel decides which
 * banner to show with `view.verdict === "approved" ? approved-message :
 * changes-requested-message`. A review object carrying `verdict: null` therefore
 * falls into the *else* branch and renders **"Changes requested — sent back to
 * Implementation"** for a feature whose review has not run at all. That is a
 * false statement about a feature's status, and it would have appeared the moment
 * the endpoint started answering `200 {verdict: null}` — which is exactly the
 * response the issue asked for so that the empty state would be reachable.
 *
 * So the mapping is: `verdict: null` → `null` review → the panel's empty state.
 * A *missing* `verdict` key is read the same way, because a response without one
 * has not reported a verdict either.
 *
 * **Why it tolerates two shapes.** `comments` is the endpoint's field and the one
 * that will be sent; `findings` is what this app already rendered and what the
 * MSW mock in `lib/msw/` still returns. Accepting both is not speculative
 * generality — the mock is a second source of this exact response, it is a
 * supported development path, and the alternative is that enabling it silently
 * blanks the panel. Each tolerance is one `??`, and the shapes agree on meaning:
 * a review comment *is* a finding at a location.
 */
export function agenticReviewFromResponse(
  response: AgenticReviewResponse | null | undefined,
): AgenticReview | null {
  if (!response) return null;

  const { verdict } = response;
  if (verdict !== "approved" && verdict !== "changes_requested") return null;

  return {
    verdict,
    comment: response.summary ?? response.comment ?? null,
    findings:
      response.comments !== undefined
        ? response.comments.map(findingFromComment)
        : (response.findings ?? []),
    jobId: response.jobId ?? null,
    completedAt: response.completedAt ?? null,
  };
}

/**
 * How a comment's location reads in the list.
 *
 * `path:line` when both are known, the path alone when the comment is about a
 * whole file, and a plain phrase when the review commented on the change rather
 * than a place in it. The last case is a real one — a verdict can carry a remark
 * with no location — and rendering `null:null` or an empty line there would read
 * as a rendering fault rather than as "this is about the change as a whole".
 */
export function describeCommentLocation(comment: {
  path: string | null;
  line: number | null;
}): string {
  const path = comment.path?.trim();
  if (!path) return "General comment";
  return comment.line === null || comment.line === undefined
    ? path
    : `${path}:${comment.line}`;
}

/**
 * One wire comment as a finding.
 *
 * `blocking` defaults to **true** when the endpoint does not send it. The issue
 * that specified this endpoint described its comments as the blocking flags, so
 * the field's absence means "these are the flags", not "none of these matter";
 * defaulting to false would let a review pass its gate while displaying exactly
 * the comments that would have stopped it.
 */
export function findingFromComment(comment: AgenticReviewComment): AgenticReviewFinding {
  return {
    location: describeCommentLocation(comment),
    note: comment.body,
    blocking: comment.blocking ?? true,
  };
}

/**
 * Where a review's findings actually are.
 *
 * **Why this is needed at all (issue #59).** The endpoint's contract has a
 * structured `comments` array, but the only producer today is the `agentic_review`
 * skill, which writes its findings as *prose* in `submit_review`'s comment — and
 * the API maps that into `summary`, leaving `comments` always empty (`api/src/features/review-types.ts`
 * says so directly). A panel that only rendered `findings` would therefore show
 * "no blocking issues" and then "No comments on this review" over a review whose
 * summary is a list of blocking issues. That is not a graceful degradation; it is
 * the page contradicting itself.
 *
 * So the two sources are distinguished rather than merged. They mean different
 * things and one of them cannot be counted:
 *
 * - `structured` — per-location findings exist, so a blocking count is real.
 * - `prose` — the findings are a paragraph. We do **not** know how many there are,
 *   and claiming "0 blocking issues" from an empty array would be reading absence
 *   of structure as absence of problems.
 * - `none` — nothing to show, which is the one case that earns "no comments".
 */
export type ReviewDetail =
  | { kind: "structured"; findings: AgenticReviewFinding[] }
  | { kind: "prose"; summary: string }
  | { kind: "none" };

export function reviewDetail(review: AgenticReview): ReviewDetail {
  if (review.findings.length > 0) {
    return { kind: "structured", findings: review.findings };
  }
  const summary = review.comment?.trim();
  if (summary) return { kind: "prose", summary };
  return { kind: "none" };
}

/**
 * The blocking-count phrase for a banner, or **null when it cannot be counted**.
 *
 * Null is the whole point: with prose-only findings the count is unknown, and the
 * banner must drop the phrase rather than assert zero. `blockStatusLabel(0)` is a
 * true statement about an empty array and a false one about a review that
 * requested changes.
 */
export function blockingLabelFor(review: AgenticReview): string | null {
  const detail = reviewDetail(review);
  if (detail.kind !== "structured") return null;
  return blockStatusLabel(detail.findings.filter((finding) => finding.blocking).length);
}

/**
 * The phrase for a *known* blocking count. Plural-safe, including zero.
 *
 * **Callers must not use this when the count is unknown.** `blockStatusLabel(0)`
 * is a true statement about an empty findings array and a false one about a
 * review whose blocking issues are written as prose — which is every review the
 * current producer writes. `blockingLabelFor` is the function that decides
 * whether the count is knowable at all, and it is what the panel calls; this is
 * only the wording.
 *
 * (The removed `agenticReviewToView` was a second, less careful path to the same
 * number: it counted `findings.filter(blocking)` unconditionally, so it reported
 * "no blocking issues" for exactly the prose reviews the count cannot speak for.
 * Unused is not the same as harmless.)
 */
export function blockStatusLabel(blockingCount: number): string {
  if (blockingCount === 0) return "no blocking issues";
  return `${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"}`;
}

/**
 * When the review finished, or null when the response did not say.
 *
 * Returns null rather than an empty string so the caller's `? :` check can omit
 * the line entirely — the alternative, rendering "Reviewed " with nothing after
 * it, is worse than not showing the line.
 */
export function reviewTimestampLabel(review: AgenticReview): string | null {
  if (!review.completedAt) return null;
  const at = new Date(review.completedAt);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString();
}
