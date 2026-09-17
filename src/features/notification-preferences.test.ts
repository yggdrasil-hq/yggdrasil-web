import { describe, expect, it } from "vitest";
import {
  applyPreferenceUpdate,
  applyProjectMute,
  disabledKindCount,
  isProjectMuted,
  kindPreferences,
  masterPreference,
  summarizePreferences,
} from "@/lib/features/notification-preferences";
import type { NotificationPreferenceEntry } from "@/lib/features/types";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";

function entry(
  kind: string | null,
  enabled: boolean,
): NotificationPreferenceEntry {
  return {
    kind,
    label: kind ?? "All project activity",
    description: null,
    enabled,
  };
}

function sample(overrides: Partial<NotificationPreferenceEntry>[] = []) {
  const base = [
    entry(null, true),
    entry("project_created", true),
    entry("adr_approved", true),
  ];
  return base.map((row, index) => ({ ...row, ...(overrides[index] ?? {}) }));
}

describe("notification preference display helpers (ADR 027)", () => {
  it("splits the org-wide row from the per-kind rows", () => {
    const preferences = sample();
    expect(masterPreference(preferences)?.kind).toBeNull();
    expect(kindPreferences(preferences).map((row) => row.kind)).toEqual([
      "project_created",
      "adr_approved",
    ]);
  });

  it("returns null for a missing master row rather than inventing one", () => {
    expect(masterPreference([entry("adr_approved", true)])).toBeNull();
  });

  it("updates only the toggled row", () => {
    const preferences = sample();
    const updated = applyPreferenceUpdate(preferences, "adr_approved", false);
    expect(updated.find((row) => row.kind === "adr_approved")?.enabled).toBe(false);
    expect(updated.find((row) => row.kind === "project_created")?.enabled).toBe(true);
    // The input is not mutated in place.
    expect(preferences.find((row) => row.kind === "adr_approved")?.enabled).toBe(true);
  });

  it("updates the org-wide row when kind is null", () => {
    const updated = applyPreferenceUpdate(sample(), null, false);
    expect(updated.find((row) => row.kind === null)?.enabled).toBe(false);
  });
});

describe("project mutes", () => {
  it("detects and adds a mute once", () => {
    expect(isProjectMuted([], PROJECT_ID)).toBe(false);
    const once = applyProjectMute([], PROJECT_ID, true);
    expect(once).toEqual([PROJECT_ID]);
    expect(isProjectMuted(once, PROJECT_ID)).toBe(true);
    // Muting an already-muted project must not duplicate the id.
    expect(applyProjectMute(once, PROJECT_ID, true)).toEqual([PROJECT_ID]);
  });

  it("removes a mute without disturbing other projects", () => {
    const muted = [PROJECT_ID, OTHER_PROJECT_ID];
    expect(applyProjectMute(muted, PROJECT_ID, false)).toEqual([OTHER_PROJECT_ID]);
    expect(applyProjectMute([], PROJECT_ID, false)).toEqual([]);
  });
});

describe("summarizePreferences", () => {
  it("reports everything on when nothing is disabled", () => {
    expect(summarizePreferences(sample())).toBe(
      "Every notification kind is on for this organization.",
    );
  });

  it("counts disabled kinds", () => {
    const preferences = sample([{}, { enabled: false }, { enabled: false }]);
    expect(disabledKindCount(preferences)).toBe(2);
    expect(summarizePreferences(preferences)).toBe(
      "2 of 2 kinds turned off for this organization.",
    );
  });

  it("reports a fully muted organization as such", () => {
    const preferences = sample([{ enabled: false }, { enabled: false }, { enabled: false }]);
    expect(summarizePreferences(preferences)).toBe(
      "All project activity is turned off for this organization.",
    );
  });

  it("distinguishes an org-wide mute with kinds re-enabled from a full mute", () => {
    const preferences = sample([{ enabled: false }, {}, { enabled: false }]);
    expect(summarizePreferences(preferences)).toBe(
      "All project activity is off, except 1 kind turned back on.",
    );
  });
});
