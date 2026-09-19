import { describe, expect, it } from "vitest";
import {
  describeEarlierRun,
  earlierRunsSummary,
  grillRunPath,
  isRunFinished,
} from "@/lib/features/grill-runs";
import type { EarlierGrillRun } from "@/lib/features/types";

/**
 * Issue #28 part 2's Web rules.
 *
 * The case that matters is the one where the wording has to stay honest: a run with
 * no `supersededByJobId` was *not* discarded, so it must not be described as though
 * it were. Everything else here is a shape check.
 */

function run(overrides: Partial<EarlierGrillRun> = {}): EarlierGrillRun {
  return {
    jobId: "job-1",
    status: "completed",
    createdAt: "2026-09-01T10:00:00.000Z",
    restartedFromEventId: null,
    supersededByJobId: null,
    ...overrides,
  };
}

describe("describeEarlierRun", () => {
  it("says a run was superseded when a rewind replaced it", () => {
    expect(describeEarlierRun(run({ supersededByJobId: "job-2" }), "Completed")).toBe(
      "Completed · superseded by a later run",
    );
  });

  it("does not claim a discard when the run was merely older", () => {
    // The distinction the API draws and this names: no `supersededByJobId` means
    // nothing was truncated — ADR 012's retry leaves the earlier conversation
    // intact — so "superseded" would assert a loss that never happened.
    expect(describeEarlierRun(run(), "Completed")).toBe("Completed · an earlier run");
  });

  it("carries the caller's status wording through rather than inventing its own", () => {
    // The status label comes from the shared job-status mapper, so this module
    // cannot drift from the wording the rest of the app uses for a failed run.
    expect(describeEarlierRun(run({ status: "failed" }), "Failed")).toContain("Failed");
  });
});

describe("earlierRunsSummary", () => {
  it("is null when there is nothing earlier, so no section renders", () => {
    // The commonest case: a feature on its first grill. A heading reading
    // "0 earlier runs" would be noise on it.
    expect(earlierRunsSummary([])).toBeNull();
  });

  it("counts one and many differently", () => {
    expect(earlierRunsSummary([run()])).toBe("1 earlier run");
    expect(earlierRunsSummary([run(), run({ jobId: "job-2" })])).toBe("2 earlier runs");
  });
});

describe("grillRunPath", () => {
  it("addresses a specific run's transcript", () => {
    expect(grillRunPath("p-1", "f-1", "j-1")).toBe("/projects/p-1/features/f-1/runs/j-1");
  });
});

describe("isRunFinished", () => {
  it("treats every terminal status as finished", () => {
    expect(isRunFinished("completed")).toBe(true);
    expect(isRunFinished("failed")).toBe(true);
    // A cancelled run is terminal *and* has a transcript worth reading, which is
    // why this answers "has it stopped" and not "did it succeed".
    expect(isRunFinished("cancelled")).toBe(true);
  });

  it("does not treat a live status as finished", () => {
    expect(isRunFinished("running")).toBe(false);
    expect(isRunFinished("pending")).toBe(false);
  });
});
