import type { NotificationPreferenceEntry } from "./types";

/**
 * Presentation logic for the notification-preferences settings (ADR 027).
 *
 * The API returns each kind's **effective** state — it has already applied the
 * precedence (concrete kind row, else the org-wide row, else notify) — so this
 * module never re-derives that. It only splits the response for rendering,
 * summarises it, and applies the local edits the toggles make.
 */

/** The org-wide "all project activity" row, or null if the API omitted it. */
export function masterPreference(
  preferences: NotificationPreferenceEntry[],
): NotificationPreferenceEntry | null {
  return preferences.find((entry) => entry.kind === null) ?? null;
}

/** The per-kind rows, in the order the API returned them (registry order). */
export function kindPreferences(
  preferences: NotificationPreferenceEntry[],
): NotificationPreferenceEntry[] {
  return preferences.filter((entry) => entry.kind !== null);
}

/**
 * Applies one toggle locally so the switch responds immediately.
 *
 * Only this row is touched: a kind that is merely *inheriting* the org-wide
 * row has no row of its own to edit, and guessing at its new state locally
 * would duplicate the server's precedence rules. Callers refetch after a
 * successful save, which is what refreshes the inherited rows.
 */
export function applyPreferenceUpdate(
  preferences: NotificationPreferenceEntry[],
  kind: string | null,
  enabled: boolean,
): NotificationPreferenceEntry[] {
  return preferences.map((entry) =>
    entry.kind === kind ? { ...entry, enabled } : entry,
  );
}

export function isProjectMuted(
  mutedProjectIds: string[],
  projectId: string,
): boolean {
  return mutedProjectIds.includes(projectId);
}

/** Adds or removes a project id from the muted set, without duplicating it. */
export function applyProjectMute(
  mutedProjectIds: string[],
  projectId: string,
  muted: boolean,
): string[] {
  if (muted) {
    return isProjectMuted(mutedProjectIds, projectId)
      ? mutedProjectIds
      : [...mutedProjectIds, projectId];
  }
  return mutedProjectIds.filter((id) => id !== projectId);
}

/** How many kinds the user has switched off, for the collapsed summary line. */
export function disabledKindCount(preferences: NotificationPreferenceEntry[]): number {
  return kindPreferences(preferences).filter((entry) => !entry.enabled).length;
}

/**
 * One line describing the current state, so the section can say what it is
 * doing without the user reading every switch.
 *
 * The org-wide row is reported first and on its own: "all activity off" is a
 * materially different statement from "three kinds off", and collapsing the
 * two would hide the case where a user has muted everything.
 */
export function summarizePreferences(
  preferences: NotificationPreferenceEntry[],
): string {
  const master = masterPreference(preferences);
  const kinds = kindPreferences(preferences);
  const disabled = kinds.filter((entry) => !entry.enabled).length;

  if (master && !master.enabled) {
    return disabled === kinds.length
      ? "All project activity is turned off for this organization."
      : `All project activity is off, except ${kinds.length - disabled} kind${
          kinds.length - disabled === 1 ? "" : "s"
        } turned back on.`;
  }

  if (disabled === 0) return "Every notification kind is on for this organization.";
  return `${disabled} of ${kinds.length} kinds turned off for this organization.`;
}
