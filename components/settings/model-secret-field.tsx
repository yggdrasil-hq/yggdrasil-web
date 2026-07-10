"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ModelSecretKey, ProjectSecretMetadata } from "@/lib/features/types";

interface ModelSecretFieldProps {
  secretKey: ModelSecretKey;
  label: string;
  description: string;
  placeholder: string;
  masked?: boolean;
  metadata: ProjectSecretMetadata | null;
  onChange: (metadata: ProjectSecretMetadata | null) => void;
  /** Persists a value for `secretKey` — bound to project- or account-scoped secrets by the caller. */
  onSave: (key: ModelSecretKey, value: string) => Promise<ProjectSecretMetadata>;
  /** Deletes the current value — bound to project- or account-scoped secrets by the caller. */
  onDelete: (secretId: string) => Promise<void>;
}

type FieldMode = "idle" | "editing" | "confirm-clear";

export function ModelSecretField({
  secretKey,
  label,
  description,
  placeholder,
  masked,
  metadata,
  onChange,
  onSave,
  onDelete,
}: ModelSecretFieldProps) {
  const [mode, setMode] = useState<FieldMode>("idle");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setError(null);
    setValue("");
    setMode("editing");
  }

  function cancel() {
    setError(null);
    setMode("idle");
  }

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Value is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await onSave(secretKey, trimmed);
      onChange(updated);
      setMode("idle");
      setValue("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save value");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!metadata) return;

    setSaving(true);
    setError(null);
    try {
      await onDelete(metadata.id);
      onChange(null);
      setMode("idle");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear value");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-rime px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-frost">{label}</p>
          <p className="text-sm text-mist">{description}</p>
        </div>
        <Badge variant={metadata ? "default" : "outline"}>
          {metadata ? "Configured" : "Not set"}
        </Badge>
      </div>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            {metadata ? "Update" : "Set value"}
          </Button>
          {metadata ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null);
                setMode("confirm-clear");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      {mode === "editing" ? (
        <div className="space-y-3 rounded-md border border-dashed border-rime p-3">
          <Input
            type={masked ? "password" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "confirm-clear" ? (
        <div className="space-y-3 rounded-md border border-rime bg-surface-02 p-3">
          <p className="text-sm text-mist">
            Clear <span className="text-frost">{label}</span>? Agent jobs will run without it
            until a new value is set — if all three model fields aren&apos;t configured, jobs
            will fail.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={saving}
              onClick={() => void handleClear()}
            >
              {saving ? "Clearing…" : "Clear"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
