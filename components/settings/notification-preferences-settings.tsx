"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  fetchNotificationPreferences,
  fetchOrganizations,
  setNotificationPreference,
} from "@/lib/api";
import {
  applyPreferenceUpdate,
  kindPreferences,
  masterPreference,
  summarizePreferences,
} from "@/lib/features/notification-preferences";
import type {
  NotificationPreferenceEntry,
  Organization,
} from "@/lib/features/types";

/**
 * Notification preferences (ADR 027) on the account settings page.
 *
 * Organization-scoped by construction: preferences are personal, but they are
 * keyed by organization (a user can belong to several, and which notifications
 * matter is org-relative), so the section opens with an org picker rather than
 * pretending there is one global setting.
 *
 * Every save refetches the whole list instead of patching local state. The API
 * returns each kind's *effective* state, so turning the org-wide row off or on
 * changes rows that were merely inheriting it — a local patch would leave those
 * switches stale. The refetch is one small request against an endpoint that
 * returns a handful of rows.
 */
export function NotificationPreferencesSettings() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKind, setSavingKind] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchOrganizations()
      .then((all) => {
        if (!active) return;
        setOrgs(all);
        setOrganizationId((current) => current || (all[0]?.id ?? ""));
      })
      .catch(() => {
        if (active) setError("Could not load your organizations.");
      });
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async (orgId: string) => {
    setLoading(true);
    try {
      const data = await fetchNotificationPreferences(orgId);
      setPreferences(data.preferences);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load notification preferences.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    void load(organizationId);
  }, [organizationId, load]);

  async function toggle(kind: string | null, enabled: boolean) {
    if (!organizationId) return;
    setSavingKind(kind);
    setError(null);
    // Optimistic: the switch moves with the click, then the refetch corrects
    // any inherited row the change also affects.
    setPreferences((current) => applyPreferenceUpdate(current, kind, enabled));
    try {
      await setNotificationPreference({ organizationId, kind, enabled });
      await load(organizationId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save.");
      await load(organizationId);
    } finally {
      setSavingKind(undefined);
    }
  }

  if (orgs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            You are not a member of any organization yet, so there is nothing to
            configure.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const master = masterPreference(preferences);
  const kinds = kindPreferences(preferences);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          {loading ? "Loading…" : summarizePreferences(preferences)}
        </CardDescription>
      </CardHeader>

      <div className="space-y-4 px-4 pb-4">
        <label className="block space-y-1 text-xs text-mist">
          Organization
          <Select
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </Select>
        </label>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!loading && preferences.length === 0 ? (
          <p className="text-sm text-mist">No preferences available.</p>
        ) : null}

        {master ? (
          <label className="flex items-start gap-3 rounded-md border border-rime bg-surface-02 p-3 text-sm text-frost">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-rime bg-surface-02"
              checked={master.enabled}
              disabled={savingKind !== undefined}
              onChange={(event) => void toggle(null, event.target.checked)}
            />
            <span>
              <span className="font-medium">{master.label}</span>
              {master.description ? (
                <span className="mt-0.5 block text-xs text-mist">
                  {master.description}
                </span>
              ) : null}
            </span>
          </label>
        ) : null}

        <div className="space-y-2">
          {kinds.map((entry) => (
            <label
              key={entry.kind}
              className="flex items-start gap-3 rounded-md border border-rime-soft bg-surface-01 p-3 text-sm text-frost"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-rime bg-surface-02"
                checked={entry.enabled}
                disabled={savingKind !== undefined}
                onChange={(event) =>
                  void toggle(entry.kind, event.target.checked)
                }
              />
              <span>
                <span className="font-medium">{entry.label}</span>
                {entry.description ? (
                  <span className="mt-0.5 block text-xs text-mist">
                    {entry.description}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>

        <p className="text-xs text-mist">
          Turning a kind back on does not bring back notifications that were
          skipped while it was off. Mute individual projects from that
          project&apos;s settings.
        </p>
      </div>
    </Card>
  );
}
