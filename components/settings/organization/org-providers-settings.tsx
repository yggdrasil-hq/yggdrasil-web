"use client";

import { useEffect, useState } from "react";
import { OrgSettingsLayout } from "./org-settings-layout";
import { useOrgParam } from "./use-org-param";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createOrgModel,
  createOrgProvider,
  clearOrgJobModelDefault,
  deleteOrgModel,
  deleteOrgProvider,
  fetchOrganizations,
  fetchOrgJobModelDefaults,
  fetchOrgModels,
  fetchOrgProviders,
  setOrgJobModelDefault,
  testOrgProvider,
  testOrgProviderConnection,
  updateOrgProvider,
  type ProviderConnectionTestResult,
} from "@/lib/api";
import {
  AGENT_JOB_KINDS,
  AGENT_JOB_KIND_LABELS,
  DEFAULT_PROVIDER_BASE_URLS,
  PROVIDER_TYPES,
  PROVIDER_TYPE_LABELS,
} from "@/lib/features/types";
import type {
  AgentJobKind,
  JobModelDefault,
  OrgModel,
  OrgProvider,
  OrgRole,
  ProviderType,
} from "@/lib/features/types";

export function OrgProvidersSettings() {
  const orgParam = useOrgParam();
  const [role, setRole] = useState<OrgRole | null>(null);
  const [providers, setProviders] = useState<OrgProvider[]>([]);
  const [models, setModels] = useState<OrgModel[]>([]);
  const [jobDefaults, setJobDefaults] = useState<JobModelDefault[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!orgParam) return;
    let active = true;
    Promise.all([
      fetchOrganizations(),
      fetchOrgProviders(orgParam),
      fetchOrgModels(orgParam),
      fetchOrgJobModelDefaults(orgParam),
    ])
      .then(([orgs, providerList, modelList, defaults]) => {
        if (!active) return;
        setRole(orgs.find((o) => o.id === orgParam)?.role ?? null);
        setProviders(providerList);
        setModels(modelList);
        setJobDefaults(defaults);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [orgParam]);

  if (!orgParam) {
    return (
      <OrgSettingsLayout orgId="" title="Providers & Models">
        <p className="text-sm text-mist">Select an organization to configure providers.</p>
      </OrgSettingsLayout>
    );
  }

  const isAdmin = role === "admin";

  return (
    <OrgSettingsLayout
      orgId={orgParam}
      title="Providers & Models"
      description="Configured by organization admins. Connected providers and models are available to every project in this organization — other members can pick from them but can't view or change the underlying connection."
    >
      {!loaded ? (
        <p className="text-sm text-mist">Loading…</p>
      ) : (
        <div className="space-y-6">
          <ProvidersCard
            orgId={orgParam}
            providers={providers}
            isAdmin={isAdmin}
            onChange={setProviders}
          />
          <ModelsCard
            orgId={orgParam}
            providers={providers}
            models={models}
            isAdmin={isAdmin}
            onChange={setModels}
          />
          <JobDefaultsCard
            orgId={orgParam}
            models={models}
            jobDefaults={jobDefaults}
            isAdmin={isAdmin}
            onChange={setJobDefaults}
          />
        </div>
      )}
    </OrgSettingsLayout>
  );
}

function ProvidersCard({
  orgId,
  providers,
  isAdmin,
  onChange,
}: {
  orgId: string;
  providers: OrgProvider[];
  isAdmin: boolean;
  onChange: (providers: OrgProvider[]) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState<ProviderType>("openrouter");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null);

  const baseUrlIsFixed = providerType !== "custom_openai_compatible";

  function resetForm() {
    setName("");
    setProviderType("openrouter");
    setBaseUrl(DEFAULT_PROVIDER_BASE_URLS.openrouter);
    setApiKey("");
    setError(null);
    setTestResult(null);
  }

  function startAdd() {
    resetForm();
    setEditingId(null);
    setDialogOpen(true);
  }

  function startEdit(provider: OrgProvider) {
    resetForm();
    setName(provider.name);
    setProviderType(provider.providerType);
    setBaseUrl(provider.baseUrl);
    setEditingId(provider.id);
    setDialogOpen(true);
  }

  function cancel() {
    setDialogOpen(false);
    setEditingId(null);
    resetForm();
  }

  function selectProviderType(type: ProviderType) {
    setProviderType(type);
    setTestResult(null);
    if (type !== "custom_openai_compatible") {
      setBaseUrl(DEFAULT_PROVIDER_BASE_URLS[type]);
    } else if (baseUrlIsFixed) {
      setBaseUrl("");
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result =
        editingId && !apiKey
          ? await testOrgProvider(orgId, editingId)
          : await testOrgProviderConnection(orgId, {
              providerType,
              baseUrl: providerType === "custom_openai_compatible" ? baseUrl : baseUrl || undefined,
              apiKey,
            });
      setTestResult(result);
    } catch (testError) {
      setTestResult({
        ok: false,
        error: testError instanceof Error ? testError.message : "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const created = await createOrgProvider(orgId, {
        name,
        providerType,
        baseUrl: providerType === "custom_openai_compatible" ? baseUrl : baseUrl || undefined,
        apiKey,
      });
      onChange([...providers, created].sort((a, b) => a.name.localeCompare(b.name)));
      cancel();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add provider");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(providerId: string) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateOrgProvider(orgId, providerId, {
        name,
        baseUrl,
        apiKey: apiKey || undefined,
      });
      onChange(providers.map((p) => (p.id === providerId ? updated : p)));
      cancel();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update provider");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(providerId: string) {
    setSaving(true);
    setError(null);
    try {
      await deleteOrgProvider(orgId, providerId);
      onChange(providers.filter((p) => p.id !== providerId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to remove provider");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Providers</CardTitle>
        <CardDescription>Connections your organization's models are served through.</CardDescription>
      </CardHeader>
      <div className="space-y-3 px-4 pb-4">
        {providers.map((provider) => (
          <div key={provider.id} className="space-y-3 rounded-md border border-rime px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-frost">{provider.name}</p>
                <p className="text-sm text-mist">
                  {PROVIDER_TYPE_LABELS[provider.providerType]} · {provider.baseUrl}
                </p>
              </div>
              <Badge>Connected</Badge>
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => startEdit(provider)}>
                  Update
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleDelete(provider.id)}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
        ))}

        {isAdmin ? (
          <Button type="button" variant="outline" size="sm" onClick={startAdd}>
            + Add custom provider
          </Button>
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : cancel())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Update provider" : "Add provider"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update this provider's connection details."
                : "Connect a provider so its models are available to projects in this organization."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            {!editingId ? (
              <Select
                value={providerType}
                onChange={(e) => selectProviderType(e.target.value as ProviderType)}
              >
                {PROVIDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PROVIDER_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            ) : null}
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={baseUrlIsFixed}
              placeholder={
                providerType === "custom_openai_compatible"
                  ? "Base URL (required)"
                  : "Base URL (optional — uses the provider's default)"
              }
            />
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
              placeholder={editingId ? "Leave blank to keep the current key" : "API key"}
            />

            {testResult ? (
              <Alert variant={testResult.ok ? "success" : "destructive"}>
                {testResult.ok ? (
                  <CheckCircle2 />
                ) : (
                  <AlertCircle />
                )}
                <AlertDescription>
                  {testResult.ok ? "Connection succeeded" : testResult.error ?? "Connection failed"}
                </AlertDescription>
              </Alert>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className="sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing || (!apiKey && !editingId)}
              onClick={() => void handleTest()}
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={cancel}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void (editingId ? handleUpdate(editingId) : handleCreate())}
              >
                {saving ? "Saving…" : editingId ? "Save" : "Add provider"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ModelsCard({
  orgId,
  providers,
  models,
  isAdmin,
  onChange,
}: {
  orgId: string;
  providers: OrgProvider[];
  models: OrgModel[];
  isAdmin: boolean;
  onChange: (models: OrgModel[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [modelId, setModelId] = useState("");
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const created = await createOrgModel(orgId, { providerId, displayName, modelId });
      onChange([...models, created].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setAdding(false);
      setDisplayName("");
      setModelId("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add model");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      await deleteOrgModel(orgId, id);
      onChange(models.filter((m) => m.id !== id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Failed to remove model",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Models</CardTitle>
        <CardDescription>The catalog available to projects in this organization.</CardDescription>
      </CardHeader>
      <div className="space-y-3 px-4 pb-4">
        {models.map((model) => (
          <div
            key={model.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rime px-3 py-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-frost">{model.displayName}</span>
                <Badge variant="outline">{model.providerName}</Badge>
              </div>
              <p className="font-mono text-xs text-mist">{model.modelId}</p>
            </div>
            {isAdmin ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => void handleDelete(model.id)}
                aria-label="Remove model"
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}

        {isAdmin && adding ? (
          <div className="space-y-3 rounded-md border border-dashed border-rime p-3">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
            />
            <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </Select>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="claude-sonnet-5"
              className="font-mono"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={saving || !providerId}
                onClick={() => void handleCreate()}
              >
                {saving ? "Saving…" : "Add model"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {isAdmin && !adding ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={providers.length === 0}
            onClick={() => {
              setProviderId(providers[0]?.id ?? "");
              setAdding(true);
            }}
          >
            + Add model
          </Button>
        ) : null}
        {isAdmin && providers.length === 0 ? (
          <p className="text-sm text-mist">Add a provider above before adding a model.</p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Card>
  );
}

function JobDefaultsCard({
  orgId,
  models,
  jobDefaults,
  isAdmin,
  onChange,
}: {
  orgId: string;
  models: OrgModel[];
  jobDefaults: JobModelDefault[];
  isAdmin: boolean;
  onChange: (jobDefaults: JobModelDefault[]) => void;
}) {
  const [saving, setSaving] = useState<AgentJobKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(jobKind: AgentJobKind, modelId: string) {
    setSaving(jobKind);
    setError(null);
    try {
      if (!modelId) {
        await clearOrgJobModelDefault(orgId, jobKind);
        onChange(jobDefaults.filter((d) => d.jobKind !== jobKind));
        return;
      }
      const updated = await setOrgJobModelDefault(orgId, jobKind, modelId);
      onChange([...jobDefaults.filter((d) => d.jobKind !== jobKind), updated]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to set default");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default models per job</CardTitle>
        <CardDescription>
          The model each kind of agent job uses by default, unless a project overrides it.
        </CardDescription>
      </CardHeader>
      <div className="space-y-3 px-4 pb-4">
        {AGENT_JOB_KINDS.map((jobKind) => {
          const current = jobDefaults.find((d) => d.jobKind === jobKind);
          return (
            <div key={jobKind} className="rounded-md border border-rime p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-frost">
                  {AGENT_JOB_KIND_LABELS[jobKind]}
                </span>
                <span className="font-mono text-xs text-shadow">{jobKind}</span>
              </div>
              {isAdmin ? (
                <Select
                  className="mt-3"
                  value={current?.modelId ?? ""}
                  disabled={saving === jobKind}
                  onChange={(e) => void handleSelect(jobKind, e.target.value)}
                >
                  <option value="">Not set</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName} — {model.providerName}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="mt-2 text-sm text-frost">
                  {current
                    ? (() => {
                        const model = models.find((m) => m.id === current.modelId);
                        return model ? `${model.displayName} — ${model.providerName}` : "Configured";
                      })()
                    : "Not set"}
                </p>
              )}
            </div>
          );
        })}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Card>
  );
}
