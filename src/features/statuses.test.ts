import { describe, expect, it } from "vitest";
import { getFeatureBucket, FEATURE_STATUSES } from "@/lib/features/statuses";

/**
 * Issue #66: `getFeatureBucket` had no caller and looked dead. It was not — the
 * mock layer was bucketing features with its own inline copy, which spelled the
 * rule *differently* (anything unrecognised went to `inProgress`, where the API
 * counts it nowhere). These tests pin the mapping and, more usefully, the
 * unknown-status behaviour that the three copies disagreed about.
 *
 * The API's implementation (`api/src/projects/types.ts`) is authoritative,
 * because it computes the counts the home page renders. This mirrors it.
 */
describe("getFeatureBucket", () => {
  it("maps every status the product defines", () => {
    const expected: Record<string, "planned" | "inProgress" | "completed"> = {
      draft: "planned",
      spec_ready: "planned",
      queued: "inProgress",
      running: "inProgress",
      testing: "inProgress",
      agentic_review: "inProgress",
      in_review: "inProgress",
      returned: "inProgress",
      failed: "inProgress",
      merged: "completed",
      cancelled: "completed",
    };

    for (const [status, bucket] of Object.entries(expected)) {
      expect(getFeatureBucket(status as never), status).toBe(bucket);
    }
  });

  it("covers every status in FEATURE_STATUSES", () => {
    // A guard against the list above drifting from the enum: a status added to
    // the product and not to this mapping would be silently bucketed as null.
    for (const status of FEATURE_STATUSES) {
      expect(getFeatureBucket(status.id), status.id).not.toBeNull();
    }
  });

  it("counts an unknown status nowhere rather than guessing a bucket", () => {
    // The specific disagreement: this returned "completed" before, the fixture
    // incremented `inProgress`, and the API returns null. Guessing puts a
    // feature in a section nobody looks at.
    expect(getFeatureBucket("something_new" as never)).toBeNull();
    expect(getFeatureBucket("" as never)).toBeNull();
  });

  it("treats a failed feature as in-progress, not completed", () => {
    // The case worth stating: a failure is not a finished feature, and the home
    // page's "completed" column is where it would be least likely to be seen.
    expect(getFeatureBucket("failed")).toBe("inProgress");
  });
});
