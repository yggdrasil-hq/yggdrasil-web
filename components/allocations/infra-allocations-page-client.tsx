"use client";

import { useCallback, useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActiveOrganization } from "@/components/usage/use-active-organization";
import {
  formatCpu,
  formatMemory,
  gibToMib,
  mibToGib,
  millicoresToVcpu,
  quotaSourceLabel,
  validateQuotaInput,
  vcpuToMillicores,
} from "@/lib/features/allocations";
import { fetchOrganizationAllocations, fetchOrganizations, setProjectResourceQuota } from "@/lib/api";
import type { ProjectAllocation } from "@/lib/features/types";
import { cn } from "@/lib/utils";

interface QuotaDraft {
  vcpu: string;
  gib: string;
  pods: string;
}

/**
 * ADR 030 §5: per-project Kubernetes resource limits, applied to each project's
 * namespace ResourceQuota (ADR 003 §5-6/§17).
 *
 * This makes configurable what the Orchestrator previously hardcoded. The three
 * cluster-capacity cards the design mock shows above the table are deliberately
 * NOT reproduced: there is no decided mechanism for the API or Orchestrator to
 * expose live cluster telemetry, so the mock's capacity/utilisation figures have
 * nothing to read from and would be invented numbers on a real page. The page's
 * own explanatory copy says so instead.
 *
 * Readable by any member; editing is admin-only, matching the API.
 */
export function InfraAllocationsPageClient() {
  const { orgId, loaded: orgLoaded } = useActiveOrganization();
  const [projects, setProjects] = useState<ProjectAllocation[] | null>(null);
  const [defaults, setDefaults] = useState<{ cpuMillicores: number; memoryMib: number; pods: number } | null>(
    null,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, QuotaDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await fetchOrganizationAllocations(orgId);
      setProjects(data.projects);
      setDefaults(data.defaults);
      setError(null);
      setDrafts(
        Object.fromEntries(
          data.projects.map((project) => [
            project.projectId,
            {
              vcpu: String(millicoresToVcpu(project.quota.cpuMillicores)),
              gib: String(mibToGib(project.quota.memoryMib)),
              pods: String(project.quota.pods),
            },
          ]),
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load allocations");
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    fetchOrganizations()
      .then((orgs) => {
        if (active) setIsAdmin(orgs.find((org) => org.id === orgId)?.role === "admin");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [orgId]);

  async function handleSave(project: ProjectAllocation) {
    if (!orgId) return;
    const draft = drafts[project.projectId];
    if (!draft) return;

    const parsed = {
      vcpu: Number(draft.vcpu),
      gib: Number(draft.gib),
      pods: Number(draft.pods),
    };
    const invalid = validateQuotaInput(parsed);
    if (invalid) {
      setFormError(invalid);
      return;
    }

    setSavingId(project.projectId);
    setFormError(null);
    try {
      await setProjectResourceQuota(orgId, project.projectId, {
        cpuMillicores: vcpuToMillicores(parsed.vcpu),
        memoryMib: gibToMib(parsed.gib),
        pods: parsed.pods,
      });
      await load();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Failed to save the limits");
    } finally {
      setSavingId(null);
    }
  }

  if (!orgLoaded) {
    return (
      <HubLayout title="Infra allocations" description="Loading…">
        <p className="text-sm text-mist">Loading organization…</p>
      </HubLayout>
    );
  }

  if (!orgId) {
    return (
      <HubLayout title="Infra allocations" description="Per-project resource limits.">
        <p className="text-sm text-mist">Select an organization to configure allocations.</p>
      </HubLayout>
    );
  }

  return (
    <HubLayout
      title="Infra allocations"
      description="Per-project Kubernetes resource limits on your organization's shared cluster."
    >
      <p className="mb-6 rounded-md border border-rime bg-surface-01 px-4 py-3 text-xs leading-relaxed text-mist">
        These limits are applied by the Orchestrator to each project&apos;s own namespace as a Kubernetes
        ResourceQuota, so Kubernetes enforces them rather than Yggdrasil. Cluster capacity and live utilisation
        are not shown: nothing in the system exposes cluster telemetry yet, so any such figures would be
        invented.
      </p>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {formError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Card className="p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-frost">Per-project limits</div>
        <div className="mb-4 mt-1 text-xs text-shadow">
          Applied to each project&apos;s namespace. A project with no override uses the platform default
          {defaults
            ? ` (${formatCpu(defaults.cpuMillicores)}, ${formatMemory(defaults.memoryMib)}, ${defaults.pods} pods)`
            : ""}
          . The pod limit bounds how much can run in the namespace at once, including the primary deployment
          and any ephemeral previews.
        </div>

        {projects === null && <p className="text-sm text-mist">Loading…</p>}
        {projects?.length === 0 && (
          <p className="text-sm text-mist">This organization has no projects yet.</p>
        )}

        {projects !== null && projects.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                    Project
                  </th>
                  <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                    CPU limit
                  </th>
                  <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                    Memory limit
                  </th>
                  <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                    Pod limit
                  </th>
                  <th className="border-b border-rime-soft px-2.5 py-2 text-left text-[11px] uppercase tracking-wide text-shadow">
                    Source
                  </th>
                  {isAdmin && (
                    <th className="border-b border-rime-soft px-2.5 py-2 text-right text-[11px] uppercase tracking-wide text-shadow">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const draft = drafts[project.projectId] ?? { vcpu: "", gib: "", pods: "" };
                  return (
                    <tr key={project.projectId}>
                      <td className="border-b border-rime-soft px-2.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-surface-03 font-mono text-[11px] font-semibold text-bifrost">
                            {project.projectName.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="text-sm text-frost">{project.projectName}</span>
                        </div>
                      </td>
                      <td className="border-b border-rime-soft px-2.5 py-2.5">
                        {isAdmin ? (
                          <Input
                            value={draft.vcpu}
                            inputMode="decimal"
                            aria-label={`CPU limit in vCPU for ${project.projectName}`}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [project.projectId]: { ...draft, vcpu: event.target.value },
                              }))
                            }
                            className="h-8 w-[92px] text-sm"
                          />
                        ) : (
                          <span className="text-sm text-mist">{formatCpu(project.quota.cpuMillicores)}</span>
                        )}
                      </td>
                      <td className="border-b border-rime-soft px-2.5 py-2.5">
                        {isAdmin ? (
                          <Input
                            value={draft.gib}
                            inputMode="decimal"
                            aria-label={`Memory limit in GiB for ${project.projectName}`}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [project.projectId]: { ...draft, gib: event.target.value },
                              }))
                            }
                            className="h-8 w-[92px] text-sm"
                          />
                        ) : (
                          <span className="text-sm text-mist">{formatMemory(project.quota.memoryMib)}</span>
                        )}
                      </td>
                      <td className="border-b border-rime-soft px-2.5 py-2.5">
                        {isAdmin ? (
                          <Input
                            value={draft.pods}
                            inputMode="numeric"
                            aria-label={`Pod limit for ${project.projectName}`}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [project.projectId]: { ...draft, pods: event.target.value },
                              }))
                            }
                            className="h-8 w-[92px] text-sm"
                          />
                        ) : (
                          <span className="text-sm text-mist">{project.quota.pods}</span>
                        )}
                      </td>
                      <td className="border-b border-rime-soft px-2.5 py-2.5">
                        <span
                          className={cn(
                            "text-xs",
                            project.quota.fromOverride ? "text-bifrost" : "text-shadow",
                          )}
                        >
                          {quotaSourceLabel(project.quota)}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="border-b border-rime-soft px-2.5 py-2.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={savingId === project.projectId}
                            onClick={() => void handleSave(project)}
                          >
                            {savingId === project.projectId ? "Saving…" : "Save"}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isAdmin && projects !== null && projects.length > 0 && (
          <p className="mt-4 text-xs text-shadow">Only organization admins can change limits.</p>
        )}
      </Card>
    </HubLayout>
  );
}
