import { describe, expect, it } from "vitest";
import {
  agenticReviewFromResponse,
  blockStatusLabel,
  blockingLabelFor,
  describeCommentLocation,
  findingFromComment,
  reviewDetail,
  reviewTimestampLabel,
} from "@/lib/features/agentic-review";
import type { AgenticReviewResponse } from "@/lib/features/types";
import { getMockAgenticReview } from "@/lib/msw/fixtures";

/**
 * Issue #59: the Agentic Review endpoint's response mapped to what the panel
 * renders. The load-bearing case is the first block below — `verdict: null` is
 * the endpoint's "no review yet", and conflating it with "a review whose verdict
 * is null" renders a false statement about the feature's status.
 */

function response(overrides: Partial<AgenticReviewResponse> = {}): AgenticReviewResponse {
  return {
    verdict: "changes_requested",
    summary: "1 blocking finding",
    comments: [{ path: "a.ts", line: 4, body: "does not hold", blocking: true }],
    jobId: "job_1",
    completedAt: "2026-09-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("agenticReviewFromResponse — no review yet", () => {
  /*
   * The bug this mapper exists to prevent. The panel picks its banner with
   * `view.verdict === "approved" ? approved : changesRequested`, so a review
   * object with `verdict: null` renders "Changes requested — sent back to
   * Implementation" for a feature nothing has reviewed. That would have started
   * happening the moment the endpoint answered `200 {verdict: null}`, which is
   * precisely the response the issue asked for so the empty state would become
   * reachable.
   */
  it("maps verdict null to no review, not to a review with a null verdict", () => {
    expect(agenticReviewFromResponse(response({ verdict: null }))).toBeNull();
  });

  it("treats a response with no verdict key the same way", () => {
    // A response that does not report a verdict has not reported one. Reading it
    // as a review would be asserting something the payload never said.
    const withoutVerdict = { comments: [] } as unknown as AgenticReviewResponse;
    expect(agenticReviewFromResponse(withoutVerdict)).toBeNull();
  });

  it("rejects an unrecognised verdict rather than rendering it", () => {
    const odd = { ...response(), verdict: "maybe" } as unknown as AgenticReviewResponse;
    expect(agenticReviewFromResponse(odd)).toBeNull();
  });

  it("maps a missing response to no review", () => {
    expect(agenticReviewFromResponse(null)).toBeNull();
    expect(agenticReviewFromResponse(undefined)).toBeNull();
  });
});

describe("agenticReviewFromResponse — a real review", () => {
  it("maps comments to findings at their locations", () => {
    const review = agenticReviewFromResponse(response());

    expect(review).not.toBeNull();
    expect(review!.verdict).toBe("changes_requested");
    expect(review!.findings).toEqual([
      { location: "a.ts:4", note: "does not hold", blocking: true },
    ]);
  });

  it("takes the summary as the review's comment", () => {
    expect(agenticReviewFromResponse(response())!.comment).toBe("1 blocking finding");
  });

  it("carries the job id and completion time through", () => {
    const review = agenticReviewFromResponse(response())!;
    expect(review.jobId).toBe("job_1");
    expect(review.completedAt).toBe("2026-09-18T10:00:00.000Z");
  });

  it("defaults missing job metadata to null rather than inventing it", () => {
    const review = agenticReviewFromResponse(
      response({ jobId: null, completedAt: null }),
    )!;
    expect(review.jobId).toBeNull();
    expect(review.completedAt).toBeNull();
  });

  it("accepts an approved verdict with no comments", () => {
    const review = agenticReviewFromResponse(
      response({ verdict: "approved", summary: null, comments: [] }),
    )!;
    expect(review.verdict).toBe("approved");
    expect(review.findings).toEqual([]);
    expect(review.comment).toBeNull();
  });

  /*
   * The tolerance for the app's pre-existing shape, and its justification: the
   * MSW mock in `lib/msw/` is a supported development path that returned this
   * shape (`findings`/`location`/`note`/`comment`), and a mapper that only
   * understood the new one would silently blank the panel whenever it is enabled.
   * One shape is chosen by presence, not merged.
   */
  it("accepts the app's older findings shape, which the mock still returns", () => {
    const legacy = {
      verdict: "changes_requested",
      comment: "legacy summary",
      findings: [{ location: "legacy.ts:9", note: "legacy note", blocking: false }],
    } as unknown as AgenticReviewResponse;

    const review = agenticReviewFromResponse(legacy)!;

    expect(review.findings).toEqual([
      { location: "legacy.ts:9", note: "legacy note", blocking: false },
    ]);
    expect(review.comment).toBe("legacy summary");
  });

  it("prefers comments over findings when a response somehow carries both", () => {
    const both = {
      ...response(),
      findings: [{ location: "stale.ts:1", note: "stale", blocking: true }],
    } as unknown as AgenticReviewResponse;

    expect(agenticReviewFromResponse(both)!.findings[0].location).toBe("a.ts:4");
  });
});

describe("findingFromComment", () => {
  it("defaults a comment with no blocking flag to blocking", () => {
    // The issue that specified this endpoint called its comments the blocking
    // flags, so an absent field means "these are the flags". Defaulting to false
    // would let a review pass its gate while showing the comments that should
    // have stopped it — the one wrong direction.
    const finding = findingFromComment({ path: null, line: null, body: "note" });
    expect(finding.blocking).toBe(true);
  });

  it("honours an explicit non-blocking flag", () => {
    const finding = findingFromComment({
      path: "a.ts",
      line: 1,
      body: "nit",
      blocking: false,
    });
    expect(finding.blocking).toBe(false);
  });
});

describe("describeCommentLocation", () => {
  it("renders path:line when both are known", () => {
    expect(describeCommentLocation({ path: "src/app.ts", line: 12 })).toBe("src/app.ts:12");
  });

  it("renders the path alone when the comment is about a whole file", () => {
    expect(describeCommentLocation({ path: "src/app.ts", line: null })).toBe("src/app.ts");
  });

  it("names a general comment rather than rendering nulls", () => {
    // A verdict can carry a remark with no location. `null:null` or a blank line
    // would read as a rendering fault instead of as "about the change as a whole".
    expect(describeCommentLocation({ path: null, line: null })).toBe("General comment");
    expect(describeCommentLocation({ path: "  ", line: 3 })).toBe("General comment");
  });
});

describe("reviewTimestampLabel", () => {
  it("formats a real timestamp", () => {
    expect(reviewTimestampLabel({
      verdict: "approved",
      comment: null,
      findings: [],
      jobId: null,
      completedAt: "2026-09-18T10:00:00.000Z",
    })).not.toBeNull();
  });

  it("returns null when the response carried no time, so the line is omitted", () => {
    // Returning "" would render "Reviewed " with nothing after it.
    expect(reviewTimestampLabel({
      verdict: "approved",
      comment: null,
      findings: [],
      jobId: null,
      completedAt: null,
    })).toBeNull();
  });

  it("returns null for an unparseable time rather than 'Invalid Date'", () => {
    expect(reviewTimestampLabel({
      verdict: "approved",
      comment: null,
      findings: [],
      jobId: null,
      completedAt: "not a date",
    })).toBeNull();
  });
});

describe("blockStatusLabel", () => {
  it("is plural-safe", () => {
    expect(blockStatusLabel(0)).toBe("no blocking issues");
    expect(blockStatusLabel(1)).toBe("1 blocking issue");
    expect(blockStatusLabel(3)).toBe("3 blocking issues");
  });
});

/*
 * Ties the mock layer's fixture to the mapper, so the two sources of this
 * response cannot drift apart silently. Issue #64 established that the mock layer
 * is a second, hand-maintained source of every API shape; this is that lesson
 * applied to the one response this change redefined. If someone edits the fixture
 * into a shape the mapper cannot read, this fails here rather than blanking the
 * panel the next time MSW is enabled.
 */
describe("the MSW fixture and the mapper agree", () => {
  it("maps the mock's own fixture rather than only hand-written inputs", () => {
    const review = agenticReviewFromResponse(getMockAgenticReview("proj", "feat_010"));

    expect(review).not.toBeNull();
    // The fixture deliberately carries one blocking, one non-blocking, and one
    // location-less comment, so all three panel renderings stay exercised through
    // the mock path too.
    expect(review!.findings.map((finding) => finding.blocking)).toEqual([true, false, true]);
    expect(review!.findings.map((finding) => finding.location)).toEqual([
      "lib/export-csv.ts:18",
      "app/customers/export.tsx:42",
      "General comment",
    ]);
  });

  it("still answers null for a feature with no mock review", () => {
    expect(agenticReviewFromResponse(getMockAgenticReview("proj", "feat_none"))).toBeNull();
  });
});

/*
 * Where the findings actually are. The endpoint's `comments` is always empty
 * today — the only producer writes prose into `summary` (see
 * `api/src/features/review-types.ts`) — so a panel that rendered only the
 * structured list would claim "no blocking issues" and "no comments" over a
 * review that listed blocking issues in prose. These pin the distinction, and
 * the count's refusal to guess.
 */
describe("reviewDetail", () => {
  const base = {
    verdict: "changes_requested" as const,
    jobId: null,
    completedAt: null,
  };

  it("prefers structured findings when there are any", () => {
    const detail = reviewDetail({
      ...base,
      comment: "prose that should not win",
      findings: [{ location: "a.ts:1", note: "n", blocking: true }],
    });
    expect(detail).toEqual({
      kind: "structured",
      findings: [{ location: "a.ts:1", note: "n", blocking: true }],
    });
  });

  it("falls back to the prose summary when there are no findings", () => {
    const detail = reviewDetail({
      ...base,
      comment: "lib/x.ts:12 — does not validate input; the ADR requires it",
      findings: [],
    });
    expect(detail).toEqual({
      kind: "prose",
      summary: "lib/x.ts:12 — does not validate input; the ADR requires it",
    });
  });

  it("treats a whitespace-only summary as nothing to show", () => {
    expect(reviewDetail({ ...base, comment: "   ", findings: [] })).toEqual({ kind: "none" });
  });

  it("reports nothing to show when both sources are empty", () => {
    expect(reviewDetail({ ...base, comment: null, findings: [] })).toEqual({ kind: "none" });
  });
});

describe("blockingLabelFor", () => {
  it("counts when the findings are structured", () => {
    const label = blockingLabelFor({
      verdict: "changes_requested",
      comment: null,
      findings: [
        { location: "a.ts:1", note: "n", blocking: true },
        { location: "b.ts:2", note: "n", blocking: false },
      ],
      jobId: null,
      completedAt: null,
    });
    expect(label).toBe("1 blocking issue");
  });

  /*
   * The assertion that matters. An empty `findings` array beside a prose summary
   * means the findings are prose, not that there are none — and reading absence of
   * structure as absence of problems would put "no blocking issues" on a review
   * that requested changes.
   */
  it("refuses to claim zero when the findings are prose", () => {
    const label = blockingLabelFor({
      verdict: "changes_requested",
      comment: "three blocking issues described in prose",
      findings: [],
      jobId: null,
      completedAt: null,
    });
    expect(label).toBeNull();
  });

  it("refuses to claim zero when there is nothing at all", () => {
    expect(
      blockingLabelFor({
        verdict: "approved",
        comment: null,
        findings: [],
        jobId: null,
        completedAt: null,
      }),
    ).toBeNull();
  });
});
