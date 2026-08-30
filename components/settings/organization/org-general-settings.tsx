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
  fetchOrganization,
  updateOrganization,
} from "@/lib/api";
import type { Organization } from "@/lib/features/types";

export function OrgGeneralSettings() {
  const orgParam = useOrgParam();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgParam) return;
    let active = true;
    fetchOrganization(orgParam)
      .then((o) => {
        if (!active) return;
        setOrg(o);
        setName(o.name);
        setDescription(o.description);
      })
      .catch(() => {
        if (active) setError("Unable to load this organization.");
      });
    return () => {
      active = false;
    };
  }, [orgParam]);

  if (!orgParam) {
    return (
      <OrgSettingsLayout orgId="" activeTab="/settings/organization/general">
        <p className="text-sm text-mist">Select an organization to configure.</p>
      </OrgSettingsLayout>
    );
  }

  async function save() {
    setError(null);
    setMessage(null);
    try {
      const updated = await updateOrganization(orgParam, { name, description });
      setOrg(updated);
      setMessage("Organization updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <OrgSettingsLayout orgId={orgParam} activeTab="/settings/organization/general">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Basic information about this organization.{" "}
            <span className="text-frost">
              Status: {org?.status === "ready" ? "ready" : "cluster not configured"}
            </span>
          </CardDescription>
        </CardHeader>
        <div className="space-y-4 px-4 pb-4">
          {message ? <p className="text-sm text-bifrost">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <label htmlFor="orgName" className="text-sm text-mist">
              Name
            </label>
            <Input id="orgName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="orgDesc" className="text-sm text-mist">
              Description
            </label>
            <textarea
              id="orgDesc"
              className="min-h-24 w-full rounded-md border border-rime bg-surface-01 px-3 py-2 text-sm text-frost"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button onClick={() => void save()}>Save changes</Button>
        </div>
      </Card>
    </OrgSettingsLayout>
  );
}