"use client";

import { useEffect, useState } from "react";
import { OrgSettingsLayout } from "./org-settings-layout";
import { useOrgParam } from "./use-org-param";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteOrganizationSecret,
  fetchOrganizationSecrets,
  upsertOrganizationSecret,
} from "@/lib/api";
import type { ProjectSecretMetadata } from "@/lib/features/types";

export function OrgSecretsSettings() {
  const orgParam = useOrgParam();
  const [secrets, setSecrets] = useState<ProjectSecretMetadata[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    if (!orgParam) return;
    fetchOrganizationSecrets(orgParam).then(setSecrets).catch(() => undefined);
  }

  useEffect(load, [orgParam]);

  async function addSecret() {
    setMessage(null);
    if (!orgParam || !key.trim()) return;
    try {
      await upsertOrganizationSecret(orgParam, key.trim(), value);
      setKey("");
      setValue("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save secret.");
    }
  }

  if (!orgParam) {
    return (
      <OrgSettingsLayout orgId="" title="Secrets">
        <p className="text-sm text-mist">Select an organization to configure secrets.</p>
      </OrgSettingsLayout>
    );
  }

  return (
    <OrgSettingsLayout
      orgId={orgParam}
      title="Secrets"
      description="Shared across every project in this organization. A project can reference one of these instead of duplicating it, or add its own project-only secrets in that project's own Settings."
    >
      <Card>
        <CardHeader>
          <CardTitle>Secrets</CardTitle>
          <CardDescription>
            Delivered to every job under this organization. A project can add its own on top;
            on a key-name collision the project&apos;s value wins.
          </CardDescription>
        </CardHeader>
        <div className="space-y-3 px-4 pb-4">
          {message ? <p className="text-sm text-mist">{message}</p> : null}
          <div className="flex gap-3">
            {/*
             * Both inputs are labelled for assistive tech only — the placeholder
             * is not an accessible name, and this row is composed for the eye
             * (a key beside its value) so a visible label on each would break the
             * pairing it is expressing. Same choice as the sibling settings
             * pages, which use `aria-label` on their unlabelled-row inputs
             * (`org-providers-settings.tsx`). "Key"/"Value" rather than the
             * visible placeholders because a screen reader reads the label, not
             * the example, and "Value" alone would be meaningless read aloud
             * without saying of what.
             */}
            <Input
              placeholder="KEY_NAME"
              aria-label="Secret key name"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Input
              placeholder="Value"
              aria-label="Secret value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button onClick={() => void addSecret()}>Add</Button>
          </div>

          {secrets.length === 0 ? (
            <p className="text-sm text-mist">No organization secrets yet.</p>
          ) : (
            <ul className="space-y-2">
              {secrets.map((secret) => (
                <li
                  key={secret.id}
                  className="flex items-center justify-between rounded-md border border-rime px-3 py-2"
                >
                  <span className="font-mono text-sm text-frost">{secret.key}</span>
                  {/* Named per row: several of these render at once, so a bare
                      "Delete" is ambiguous read out of context — a screen-reader
                      user hears the same label for every one of them. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${secret.key}`}
                    onClick={() => void deleteOrganizationSecret(orgParam, secret.id).then(load)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </OrgSettingsLayout>
  );
}