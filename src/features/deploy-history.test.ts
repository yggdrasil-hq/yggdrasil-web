import { describe, expect, it } from "vitest";
import {
  canRollBackTo,
  DEPLOY_KIND_LABELS,
  describeDeploy,
  describeRollbackImpact,
  findTarget,
  isDeploymentInFlight,
  liveDeploymentUrl,
} from "@/lib/features/deploy-history";
import type { ProjectDeploy, RollbackTarget } from "@/lib/features/types";

function makeDeploy(overrides: Partial<ProjectDeploy> = {}): ProjectDeploy {
  return {
    id: "deploy_1",
    jobId: "job_1",
    kind: "deploy",
    helmRevision: 4,
    targetRevision: null,
    status: "completed",
    lastError: null,
    ref: "main",
    createdAt: "2026-09-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("describeDeploy", () => {
  it("names the revision a plain deploy produced", () => {
    expect(describeDeploy(makeDeploy())).toBe("Deployed revision 4");
  });

  // The counter does not rewind, so a rollback row has to show both numbers or
  // it reads as though revision 3 is now current.
  it("shows both revisions for a rollback", () => {
    expect(
      describeDeploy(
        makeDeploy({ kind: "rollback", helmRevision: 10, targetRevision: 3 }),
      ),
    ).toBe("Rolled back to revision 3 (revision 10)");
  });

  it("names the target of a failed rollback", () => {
    expect(
      describeDeploy(
        makeDeploy({ kind: "rollback", helmRevision: null, targetRevision: 3, status: "failed" }),
      ),
    ).toBe("Rollback to revision 3 failed");
  });

  it("describes a failed deploy without a revision", () => {
    expect(describeDeploy(makeDeploy({ helmRevision: null, status: "failed" }))).toBe(
      "Deploy failed",
    );
  });

  it("labels both kinds", () => {
    expect(DEPLOY_KIND_LABELS.deploy).toBe("Deploy");
    expect(DEPLOY_KIND_LABELS.rollback).toBe("Rollback");
  });
});

describe("canRollBackTo", () => {
  it("offers a successful deploy that is not what is running", () => {
    expect(canRollBackTo(makeDeploy({ helmRevision: 4 }), 12)).toBe(true);
  });

  // Rolling back to the revision already live is a no-op, so offering it would
  // be a button that does nothing.
  it("does not offer the revision that is already live", () => {
    expect(canRollBackTo(makeDeploy({ helmRevision: 12 }), 12)).toBe(false);
  });

  it("does not offer a failed attempt", () => {
    expect(
      canRollBackTo(makeDeploy({ status: "failed", helmRevision: null }), 12),
    ).toBe(false);
  });

  it("does not offer an entry with no revision even if marked completed", () => {
    expect(canRollBackTo(makeDeploy({ helmRevision: null }), 12)).toBe(false);
  });

  it("offers a successful rollback row too — its content is a valid earlier state", () => {
    expect(
      canRollBackTo(
        makeDeploy({ kind: "rollback", helmRevision: 10, targetRevision: 3 }),
        12,
      ),
    ).toBe(true);
  });
});

describe("isDeploymentInFlight", () => {
  it("is true while pending or running", () => {
    expect(isDeploymentInFlight("pending")).toBe(true);
    expect(isDeploymentInFlight("running")).toBe(true);
  });

  it("is false once terminal or absent", () => {
    expect(isDeploymentInFlight("completed")).toBe(false);
    expect(isDeploymentInFlight("failed")).toBe(false);
    expect(isDeploymentInFlight(null)).toBe(false);
  });
});

describe("liveDeploymentUrl", () => {
  it("only exposes the URL once something is actually running", () => {
    expect(liveDeploymentUrl("completed", "https://x.example")).toBe("https://x.example");
    expect(liveDeploymentUrl("running", "https://x.example")).toBeNull();
    expect(liveDeploymentUrl(null, "https://x.example")).toBeNull();
  });
});

describe("findTarget", () => {
  const targets: RollbackTarget[] = [
    { revision: 9, deployedAt: "2026-09-16T10:00:00.000Z", kind: "deploy" },
    { revision: 4, deployedAt: "2026-09-15T10:00:00.000Z", kind: "rollback" },
  ];

  it("finds an offered revision", () => {
    expect(findTarget(targets, 9)?.revision).toBe(9);
  });

  it("returns null for a revision the API no longer offers", () => {
    expect(findTarget(targets, 99)).toBeNull();
  });
});

describe("describeRollbackImpact", () => {
  it("states what is being replaced", () => {
    const target: RollbackTarget = {
      revision: 3,
      deployedAt: "2026-09-16T10:00:00.000Z",
      kind: "deploy",
    };
    const message = describeRollbackImpact(target, 12);
    expect(message).toContain("12");
    expect(message).toContain("3");
  });

  // Worth pinning: an operator confirming a destructive action should not be
  // left thinking the old revision is somehow "lost" when it is not.
  it("says the new revision is created rather than replacing history", () => {
    const target: RollbackTarget = {
      revision: 3,
      deployedAt: "2026-09-16T10:00:00.000Z",
      kind: "deploy",
    };
    expect(describeRollbackImpact(target, 12)).toMatch(/stays in history/);
  });

  it("handles a project that has no revision recorded yet", () => {
    const target: RollbackTarget = {
      revision: 1,
      deployedAt: "2026-09-16T10:00:00.000Z",
      kind: "deploy",
    };
    expect(describeRollbackImpact(target, null)).toContain("revision 1");
  });

  it("says so when the target is gone", () => {
    expect(describeRollbackImpact(null, 12)).toMatch(/no longer available/);
  });
});
