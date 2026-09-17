import { describe, expect, it } from "vitest";
import {
  TRUST_ACKNOWLEDGEMENT,
  TRUST_WARNING,
  TRUST_WARNING_SHORT,
  detailTotalBytes,
  draftBundleIssue,
  enabledProjectsLabel,
  extensionStatus,
  extensionStatusLabel,
  fileCountLabel,
  formatBytes,
  formatExtensionTimestamp,
  projectLoadState,
  shortDigest,
  summarizeExtensions,
  uploaderLabel,
} from "@/lib/features/extensions";
import type { OrgExtension, OrgExtensionDetail } from "@/lib/features/types";

function extension(overrides: Partial<OrgExtension> = {}): OrgExtension {
  return {
    id: "ext_1",
    slug: "my-ext",
    name: "My extension",
    entryPath: "src/index.ts",
    sourceSha256: "a".repeat(64),
    active: true,
    uploadedBy: { username: "sarat", displayName: "Sarat" },
    enabledProjectCount: 0,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("trust warning copy", () => {
  // The warning is the product's only control over what an upload can do, so
  // its wording is asserted rather than left to drift silently.
  it("names the concrete access an extension gets", () => {
    expect(TRUST_WARNING).toContain("GitHub installation token");
    expect(TRUST_WARNING).toContain("model API key");
    expect(TRUST_WARNING).toContain("arbitrary code");
  });

  it("says plainly that there is no sandbox", () => {
    expect(TRUST_WARNING).toContain("no sandbox");
  });

  it("keeps the short form short and still about code execution", () => {
    expect(TRUST_WARNING_SHORT).toContain("arbitrary code");
    expect(TRUST_WARNING_SHORT.length).toBeLessThan(TRUST_WARNING.length);
  });

  it("asks for an explicit acknowledgement before upload", () => {
    expect(TRUST_ACKNOWLEDGEMENT).toContain("read");
    expect(TRUST_ACKNOWLEDGEMENT).toContain("credentials");
  });
});

describe("status", () => {
  it("maps the active flag to a status", () => {
    expect(extensionStatus({ active: true })).toBe("active");
    expect(extensionStatus({ active: false })).toBe("disabled");
  });

  it("labels both states", () => {
    expect(extensionStatusLabel({ active: true })).toBe("Active");
    expect(extensionStatusLabel({ active: false })).toBe("Disabled");
  });
});

describe("summarizeExtensions", () => {
  it("counts totals and actives", () => {
    const summary = summarizeExtensions([
      extension({ id: "a", active: true }),
      extension({ id: "b", active: false }),
    ]);
    expect(summary.total).toBe(2);
    expect(summary.active).toBe(1);
  });

  it("takes the max enabled-project count rather than summing it", () => {
    // A project loads all active extensions or none, so every row reports the
    // same count; summing would multiply one project by the row count.
    const summary = summarizeExtensions([
      extension({ id: "a", enabledProjectCount: 3 }),
      extension({ id: "b", enabledProjectCount: 3 }),
    ]);
    expect(summary.enabledProjects).toBe(3);
  });

  it("handles an empty list", () => {
    expect(summarizeExtensions([])).toEqual({
      total: 0,
      active: 0,
      enabledProjects: 0,
      totalBytes: 0,
    });
  });

  it("sums stored bytes when the caller supplies them", () => {
    const summary = summarizeExtensions([
      { ...extension({ id: "a" }), totalBytes: 100 },
      { ...extension({ id: "b" }), totalBytes: 250 },
    ]);
    expect(summary.totalBytes).toBe(350);
  });
});

describe("formatting", () => {
  it("formats bytes across unit boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KiB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MiB");
  });

  it("pluralizes file counts", () => {
    expect(fileCountLabel(1)).toBe("1 file");
    expect(fileCountLabel(0)).toBe("0 files");
    expect(fileCountLabel(4)).toBe("4 files");
  });

  it("says explicitly when nothing is enabled", () => {
    expect(enabledProjectsLabel(0)).toBe("Not enabled in any project");
    expect(enabledProjectsLabel(1)).toBe("Enabled in 1 project");
    expect(enabledProjectsLabel(5)).toBe("Enabled in 5 projects");
  });

  it("shortens a digest for display without losing the distinction", () => {
    expect(shortDigest("abcdef1234567890")).toBe("abcdef123456");
  });

  it("handles an unknown uploader", () => {
    expect(uploaderLabel({ uploadedBy: null })).toBe("Unknown (uploader removed)");
    expect(uploaderLabel({ uploadedBy: { username: "sarat", displayName: null } })).toBe("sarat");
    expect(uploaderLabel({ uploadedBy: { username: null, displayName: null } })).toBe("Unknown");
  });

  it("totals a detail response's files", () => {
    const detail = {
      files: [
        { path: "a.ts", content: "x", sizeBytes: 1 },
        { path: "b.ts", content: "yy", sizeBytes: 2 },
      ],
    } as OrgExtensionDetail;
    expect(detailTotalBytes(detail)).toBe(3);
  });

  it("falls back to the raw value for an unparseable timestamp", () => {
    expect(formatExtensionTimestamp("not-a-date")).toBe("not-a-date");
  });
});

describe("draftBundleIssue", () => {
  // Mirrors the API's rules for *feedback* only; the API stays authoritative.
  it("accepts a minimal valid bundle", () => {
    expect(
      draftBundleIssue([{ path: "src/index.ts", content: "export default () => {};" }], "src/index.ts"),
    ).toBeNull();
  });

  it("requires at least one file", () => {
    expect(draftBundleIssue([], "src/index.ts")).toContain("at least one file");
  });

  it("flags an absolute path", () => {
    expect(draftBundleIssue([{ path: "/etc/passwd.ts", content: "x" }], "/etc/passwd.ts")).toContain(
      "absolute",
    );
  });

  it("flags backslashes and dot segments", () => {
    expect(draftBundleIssue([{ path: "src\\a.ts", content: "x" }], "src\\a.ts")).toContain("/");
    expect(draftBundleIssue([{ path: "../a.ts", content: "x" }], "../a.ts")).toContain("..");
  });

  it("flags a disallowed extension", () => {
    expect(draftBundleIssue([{ path: "run.sh", content: "x" }], "run.sh")).toContain(".ts, .js or .json");
  });

  it("flags an entry path that is not in the file list", () => {
    expect(
      draftBundleIssue([{ path: "src/other.ts", content: "x" }], "src/index.ts"),
    ).toContain("not one of the files");
  });

  it("flags an empty path", () => {
    expect(draftBundleIssue([{ path: "   ", content: "x" }], "src/index.ts")).toContain("needs a path");
  });
});

describe("projectLoadState", () => {
  it("reports disabled when the project has not opted in", () => {
    const state = projectLoadState({ uploadedExtensionsEnabled: false }, 3);
    expect(state.loading).toBe(false);
    expect(state.label).toContain("do not load");
  });

  it("reports loading when opted in with extensions available", () => {
    const state = projectLoadState({ uploadedExtensionsEnabled: true }, 2);
    expect(state.loading).toBe(true);
    expect(state.label).toContain("2 extensions");
  });

  it("says 'extension' for exactly one", () => {
    expect(projectLoadState({ uploadedExtensionsEnabled: true }, 1).label).toContain("1 extension");
  });

  it("states only what is certain when the count is unknown", () => {
    // The extension list is admin-only, so a project owner who is not an org
    // admin cannot see it. Claiming "no extensions" there would be a wrong
    // statement about someone else's organization.
    const state = projectLoadState({ uploadedExtensionsEnabled: true }, null);
    expect(state.loading).toBe(true);
    expect(state.label).not.toContain("no active extensions");
    expect(state.label).toContain("organization admin");
  });

  it("explains an opted-in project with nothing to load", () => {
    // Otherwise the toggle looks broken: on, but nothing happens.
    const state = projectLoadState({ uploadedExtensionsEnabled: true }, 0);
    expect(state.loading).toBe(false);
    expect(state.label).toContain("no active extensions yet");
  });
});
