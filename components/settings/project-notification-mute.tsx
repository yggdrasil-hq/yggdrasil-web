"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchNotificationPreferences, setProjectNotificationMute } from "@/lib/api";
import { isProjectMuted } from "@/lib/features/notification-preferences";

interface ProjectNotificationMuteCardProps {
  projectId: string;
  organizationId: string;
}

/**
 * The per-project half of ADR 027, on the project settings page.
 *
 * A mute is absolute for this project regardless of kind, which is why it lives
 * here rather than being another switch on the kind list: "stop telling me about
 * this project" is a per-project decision, and an org-wide kind list cannot
 * express it.
 *
 * There is no organization picker: the muted set is keyed per user but read
 * through the org-scoped endpoint, and a project belongs to exactly one
 * organization, so the caller supplies it rather than asking the user.
 */
export function ProjectNotificationMuteCard({
  projectId,
  organizationId,
}: ProjectNotificationMuteCardProps) {
  const [muted, setMuted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setMuted(null);
    fetchNotificationPreferences(organizationId)
      .then((data) => {
        if (active) setMuted(isProjectMuted(data.mutedProjectIds, projectId));
      })
      .catch(() => {
        if (active) setError("Could not load this project's notification state.");
      });
    return () => {
      active = false;
    };
  }, [organizationId, projectId]);

  async function toggle(next: boolean) {
    setSaving(true);
    setError(null);
    setMuted(next);
    try {
      await setProjectNotificationMute(projectId, next);
    } catch (saveError) {
      setMuted(!next);
      setError(saveError instanceof Error ? saveError.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Mute this project to stop its notifications, whatever their kind.
        </CardDescription>
      </CardHeader>
      <div className="space-y-3 px-4 pb-4">
        <label className="flex items-start gap-3 text-sm text-frost">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-rime bg-surface-02"
            checked={muted ?? false}
            disabled={saving || muted === null}
            onChange={(event) => void toggle(event.target.checked)}
          />
          Mute this project&apos;s notifications
        </label>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </Card>
  );
}
