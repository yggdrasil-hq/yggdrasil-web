import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_GROUPS,
  actionGroupPrefix,
  actionLabel,
  actorLabel,
  formatAuditTimestamp,
  hasNextPage,
  hasPreviousPage,
  paginationSummary,
  targetLabel,
} from "@/lib/features/audit";

/**
 * ADR 028's read side. The audit page itself is untested (no component
 * testing library in this repo, by convention) — everything it decides beyond
 * layout lives in lib/features/audit.ts and is covered here.
 */
describe("audit action labelling", () => {
  it("labels a known action", () => {
    expect(actionLabel("project.created")).toBe("Project created");
    expect(actionLabel("org.role_changed")).toBe("Member role changed");
    expect(actionLabel("github.installation_updated")).toBe(
      "GitHub App installation updated",
    );
  });

  it("falls back to a prettified string for an action it doesn't know", () => {
    expect(actionLabel("widget.dropped_by_agent")).toBe("Widget Dropped By Agent");
  });

  it("groups by the domain before the dot", () => {
    expect(actionGroupPrefix("project.repository_linked")).toBe("project.");
    expect(actionGroupPrefix("github.repos_synced")).toBe("github.");
    expect(actionGroupPrefix("bare")).toBe("bare");
  });

  it("covers every group the filter dropdown offers with a documented prefix", () => {
    for (const group of AUDIT_ACTION_GROUPS) {
      expect(actionGroupPrefix(`${group.prefix}created`)).toBe(group.prefix);
    }
  });
});

describe("audit actor labelling", () => {
  it("prefers the person's name and handle", () => {
    expect(
      actorLabel({
        actorKind: "user",
        actorUsername: "sarat",
        actorDisplayName: "Sarat Angajala",
      }),
    ).toBe("Sarat Angajala (@sarat)");
  });

  it("falls back to the handle when there's no display name", () => {
    expect(
      actorLabel({ actorKind: "user", actorUsername: "sarat", actorDisplayName: null }),
    ).toBe("@sarat");
  });

  it("labels an unowned actor by kind — the webhook/system case", () => {
    expect(
      actorLabel({
        actorKind: "webhook",
        actorUsername: null,
        actorDisplayName: null,
      }),
    ).toBe("GitHub webhook");
    expect(
      actorLabel({ actorKind: "system", actorUsername: null, actorDisplayName: null }),
    ).toBe("System");
  });
});

describe("audit target labelling", () => {
  const base = { action: "project.created", projectName: null, metadata: {} };

  it("prefers a feature title", () => {
    expect(
      targetLabel({ ...base, targetType: "feature", metadata: { title: "Add SSO" } }),
    ).toBe("Add SSO");
  });

  it("falls back through repository, name, key and job kind", () => {
    expect(
      targetLabel({ ...base, targetType: "project", metadata: { repository: "acme/api" } }),
    ).toBe("acme/api");
    expect(targetLabel({ ...base, targetType: "project", metadata: { name: "Acme" } })).toBe(
      "Acme",
    );
    expect(
      targetLabel({ ...base, targetType: "project_secret", metadata: { key: "DATABASE_URL" } }),
    ).toBe("DATABASE_URL");
    expect(
      targetLabel({ ...base, targetType: "job_model_default", metadata: { jobKind: "spec_grill" } }),
    ).toBe("spec_grill");
  });

  it("falls back to the project name, then a dash", () => {
    expect(
      targetLabel({ ...base, targetType: "project", projectName: "Acme Retail" }),
    ).toBe("Acme Retail");
    expect(targetLabel({ ...base, targetType: null })).toBe("—");
  });
});

describe("audit pagination", () => {
  const page = { offset: 50, limit: 50, total: 213 };

  it("summarises the visible window", () => {
    expect(paginationSummary(page)).toBe("51–100 of 213");
  });

  it("summarises a short final page", () => {
    expect(paginationSummary({ offset: 200, limit: 50, total: 213 })).toBe("201–213 of 213");
  });

  it("says so when nothing matched", () => {
    expect(paginationSummary({ offset: 0, limit: 50, total: 0 })).toBe("No matching events");
  });

  it("knows which direction it can page", () => {
    expect(hasPreviousPage(page)).toBe(true);
    expect(hasNextPage(page)).toBe(true);
    expect(hasPreviousPage({ offset: 0, limit: 50, total: 213 })).toBe(false);
    expect(hasNextPage({ offset: 200, limit: 50, total: 213 })).toBe(false);
    expect(hasNextPage({ offset: 0, limit: 50, total: 0 })).toBe(false);
  });
});

describe("audit timestamps", () => {
  it("formats an ISO timestamp for display without dropping the date", () => {
    const formatted = formatAuditTimestamp("2026-09-16T10:00:00.000Z");
    expect(formatted).toMatch(/2026/);
  });

  it("passes through an unparseable value rather than rendering Invalid Date", () => {
    expect(formatAuditTimestamp("not-a-date")).toBe("not-a-date");
  });
});
