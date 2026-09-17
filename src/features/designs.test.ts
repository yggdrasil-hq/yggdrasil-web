import { describe, expect, it } from "vitest";
import type { Design } from "@/lib/features/types";
import {
  DEFAULT_DESIGN_FILTERS,
  designFolderPath,
  designRoutePath,
  designSessionPath,
  designStatusCounts,
  designStatusLabel,
  filterDesigns,
  formatDesignDate,
  reopenDesignPath,
  sessionAttentionLabel,
  sortDesignsByRecency,
} from "./designs";

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: "design_1",
    projectId: "project_1",
    name: "Checkout",
    slug: "checkout",
    status: "in_progress",
    originJobId: "job_1",
    prUrl: null,
    finalizedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    latestSession: null,
    ...overrides,
  };
}

describe("design status", () => {
  it("labels both states", () => {
    expect(designStatusLabel("in_progress")).toBe("In progress");
    expect(designStatusLabel("finalized")).toBe("Finalized");
  });
});

describe("sessionAttentionLabel", () => {
  it("says nothing for a cleanly completed session — status already covers it", () => {
    expect(
      sessionAttentionLabel({
        id: "s1",
        status: "completed",
        createdAt: "2026-09-02T10:00:00.000Z",
        completedAt: "2026-09-02T10:10:00.000Z",
        lastError: null,
      }),
    ).toBeNull();
  });

  it("surfaces a failed session, which the design status alone would hide", () => {
    // A design whose only session died stays `in_progress` forever (ADR 020
    // item 3), so the failure has to be visible from the session.
    expect(
      sessionAttentionLabel({
        id: "s1",
        status: "failed",
        createdAt: "2026-09-02T10:00:00.000Z",
        completedAt: "2026-09-02T10:05:00.000Z",
        lastError: "container died",
      }),
    ).toBe("Last session failed: container died");
  });

  it("still reports a failure with no recorded reason", () => {
    expect(
      sessionAttentionLabel({
        id: "s1",
        status: "failed",
        createdAt: "2026-09-02T10:00:00.000Z",
        completedAt: null,
        lastError: null,
      }),
    ).toBe("Last session failed");
  });

  it("reports cancellation, runningness and queuedness", () => {
    const base = {
      id: "s1",
      createdAt: "2026-09-02T10:00:00.000Z",
      completedAt: null,
      lastError: null,
    };
    expect(sessionAttentionLabel({ ...base, status: "cancelled" })).toBe(
      "Last session was cancelled",
    );
    expect(sessionAttentionLabel({ ...base, status: "running" })).toBe("Session running now");
    expect(sessionAttentionLabel({ ...base, status: "pending" })).toBe("Session queued");
  });

  it("returns null when there is no session at all", () => {
    expect(sessionAttentionLabel(null)).toBeNull();
  });
});

describe("designFolderPath", () => {
  it("names the artifact's home in the repo, not a UI path", () => {
    expect(designFolderPath("checkout")).toBe("designs/checkout/");
  });
});

describe("sortDesignsByRecency", () => {
  it("puts the most recently touched design first without mutating the input", () => {
    const older = makeDesign({ id: "a", updatedAt: "2026-09-01T10:00:00.000Z" });
    const newer = makeDesign({ id: "b", updatedAt: "2026-09-05T10:00:00.000Z" });
    const input = [older, newer];

    expect(sortDesignsByRecency(input).map((design) => design.id)).toEqual(["b", "a"]);
    expect(input.map((design) => design.id)).toEqual(["a", "b"]);
  });
});

describe("filterDesigns", () => {
  const designs = [
    makeDesign({ id: "a", name: "Checkout", slug: "checkout", status: "finalized" }),
    makeDesign({ id: "b", name: "Settings", slug: "settings", status: "in_progress" }),
  ];

  it("returns everything by default", () => {
    expect(filterDesigns(designs, DEFAULT_DESIGN_FILTERS)).toHaveLength(2);
  });

  it("filters by status", () => {
    expect(
      filterDesigns(designs, { status: "finalized", query: "" }).map((d) => d.id),
    ).toEqual(["a"]);
  });

  it("matches name or slug, case-insensitively", () => {
    expect(filterDesigns(designs, { status: "all", query: "CHEC" }).map((d) => d.id)).toEqual(["a"]);
    expect(filterDesigns(designs, { status: "all", query: "sett" }).map((d) => d.id)).toEqual(["b"]);
  });

  it("combines status and query", () => {
    expect(filterDesigns(designs, { status: "in_progress", query: "checkout" })).toEqual([]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterDesigns(designs, { status: "all", query: "  " })).toHaveLength(2);
  });
});

describe("designStatusCounts", () => {
  it("counts each state, so an empty filtered view is explainable", () => {
    expect(
      designStatusCounts([
        makeDesign({ status: "finalized" }),
        makeDesign({ status: "finalized" }),
        makeDesign({ status: "in_progress" }),
      ]),
    ).toEqual({ in_progress: 1, finalized: 2 });
  });
});

describe("formatDesignDate", () => {
  it("renders a date-only value", () => {
    expect(formatDesignDate("2026-09-02T10:00:00.000Z")).toBe("2026-09-02");
  });

  it("passes an unparseable value through rather than showing Invalid Date", () => {
    expect(formatDesignDate("not-a-date")).toBe("not-a-date");
  });
});

describe("routes", () => {
  it("addresses a design by its index id", () => {
    expect(designRoutePath("p1", "d1")).toBe("/projects/p1/designs/d1");
  });

  it("reserves a segment for live sessions so a uuid cannot be ambiguous", () => {
    // A design id and a session id are both uuids in the same path position;
    // `/designs/sessions/...` removes the guesswork.
    expect(designSessionPath("p1", "s1")).toBe("/projects/p1/designs/sessions/s1");
  });

  it("re-opens through the create form with the design pre-filled", () => {
    expect(reopenDesignPath("p1", "d1")).toBe("/projects/p1/designs/new?reopen=d1");
  });
});
