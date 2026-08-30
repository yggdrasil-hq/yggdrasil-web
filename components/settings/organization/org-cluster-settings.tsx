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
import {
  clearOrganizationCluster,
  fetchOrganization,
  fetchOrganizationCluster,
  setOrganizationCluster,
} from "@/lib/api";
import type { OrgClusterMetadata, Organization } from "@/lib/features/types";

export function OrgClusterSettings() {
  const orgParam = useOrgParam();
  const [org, setOrg] = useState<Organization | null>(null);
  const [cluster, setCluster] = useState<OrgClusterMetadata | null>(null);
  const [kubeconfig, setKubeconfig] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!orgParam) return;
    fetchOrganization(orgParam).then(setOrg).catch(() => undefined);
    fetchOrganizationCluster(orgParam).then(setCluster).catch(() => undefined);
  }

  useEffect(load, [orgParam]);

  async function saveCluster() {
    setError(null);
    setMessage(null);
    try {
      await setOrganizationCluster(orgParam, kubeconfig);
      setKubeconfig("");
      await load();
      setMessage("Cluster configured — this organization can now create projects.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save cluster.");
    }
  }

  async function clearCluster() {
    setError(null);
    setMessage(null);
    try {
      await clearOrganizationCluster(orgParam);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to clear cluster.");
    }
  }

  if (!orgParam) {
    return (
      <OrgSettingsLayout orgId="" activeTab="/settings/organization/cluster">
        <p className="text-sm text-mist">Select an organization to configure its cluster.</p>
      </OrgSettingsLayout>
    );
  }

  return (
    <OrgSettingsLayout orgId={orgParam} activeTab="/settings/organization/cluster">
      <Card>
        <CardHeader>
          <CardTitle>Kubernetes cluster</CardTitle>
          <CardDescription>
            {org?.status === "ready"
              ? "A cluster is configured — projects can be created under this organization."
              : "No cluster configured yet. Every project under this organization runs on this cluster; you must configure one before creating projects (there is no platform default)."}
          </CardDescription>
        </CardHeader>
        <div className="space-y-3 px-4 pb-4">
          {message ? <p className="text-sm text-bifrost">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {cluster ? (
            <p className="text-sm text-mist">
              Cluster configured ({new Date(cluster.updatedAt).toLocaleDateString()}).
            </p>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="kubeconfig" className="text-sm text-mist">
              Kubeconfig (stored encrypted)
            </label>
            <textarea
              id="kubeconfig"
              className="min-h-40 w-full rounded-md border border-rime bg-surface-01 px-3 py-2 font-mono text-xs text-frost"
              placeholder={"apiVersion: v1\nkind: Config\nclusters: [...]"}
              value={kubeconfig}
              onChange={(e) => setKubeconfig(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => void saveCluster()}>
              {cluster ? "Update cluster" : "Configure cluster"}
            </Button>
            {cluster ? (
              <Button variant="outline" onClick={() => void clearCluster()}>
                Clear configuration
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </OrgSettingsLayout>
  );
}