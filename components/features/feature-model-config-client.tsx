"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useFeatureDetail } from "@/components/features/feature-detail-context";
import {
  canSaveCustomTriplet,
  catalogPickerEnabled,
  describeEffectiveModelConfig,
  emptyCustomTripletDraft,
  overrideForJobKind,
  removeOverride,
  upsertOverride,
  type CustomTripletDraft,
} from "@/lib/features/model-config";
import {
  IDLE_MODEL_LIST,
  canListConnectionModels,
  listUnavailableReason,
  modelListStateFrom,
  modelOptions,
  type ModelListState,
} from "@/lib/features/model-catalog";
import {
  clearFeatureJobModelOverride,
  clearFeatureModelSecrets,
  fetchFeatureJobModelOverrides,
  fetchFeatureModelConfig,
  fetchFeatureModelSecrets,
  fetchOrgModels,
  listModelsForConnection,
  saveFeatureModelSecrets,
  setFeatureJobModelOverride,
} from "@/lib/api";
import { AGENT_JOB_KINDS, AGENT_JOB_KIND_LABELS } from "@/lib/features/types";
import type {
  AgentJobKind,
  FeatureJobModelOverride,
  FeatureModelConfigResponse,
  OrgModel,
} from "@/lib/features/types";

/**
 * The feature tier of model configuration (ADR 018 amendment, issue #5): the
 * narrowest tier, which wins over the project's and the organization's for every
 * job this feature runs.
 *
 * Deliberately a page rather than a panel in the feature-detail header: five
 * job kinds plus a three-field custom connection is too much to inject into
 * every stage page, and the six-stage nav (lib/features/stage.ts) must not gain
 * a seventh entry — that list drives lifecycle progress math, and this is a
 * settings surface, not a stage. It reuses the project settings page's
 * job-kind-override data flow (same Select over fetchOrgModels) rather than
 * inventing a parallel one.
 */
export function FeatureModelConfigClient() {
  const { projectId, featureId, project } = useFeatureDetail();
  const [config, setConfig] = useState<FeatureModelConfigResponse | null>(null);
  const [overrides, setOverrides] = useState<FeatureJobModelOverride[]>([]);
  const [orgModels, setOrgModels] = useState<OrgModel[]>([]);
  const [draft, setDraft] = useState<CustomTripletDraft>(emptyCustomTripletDraft);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState<AgentJobKind | null>(null);
  const [savingTriplet, setSavingTriplet] = useState(false);
  const [clearingTriplet, setClearingTriplet] = useState(false);
  /**
   * Issue #36: the provider's model list for the typed triplet. Admin-only at
   * the API, so the field explains that and stays free text for everyone else —
   * the required-credentials rule is the same one the API applies, checked here
   * so the button is never offered when it can only fail.
   */
  const [tripletModelList, setTripletModelList] = useState<ModelListState>(IDLE_MODEL_LIST);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [configData, overrideData, modelData] = await Promise.all([
          fetchFeatureModelConfig(projectId, featureId),
          fetchFeatureJobModelOverrides(projectId, featureId),
          fetchOrgModels(project.organizationId),
        ]);
        if (!active) return;
        setConfig(configData);
        setOverrides(overrideData);
        setOrgModels(modelData);
        // Metadata only — the values themselves are never sent back, so an
        // already-set triplet shows as "set" rather than pre-filled.
        await fetchFeatureModelSecrets(projectId, featureId);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load model configuration",
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [projectId, featureId, project.organizationId]);

  /** Re-reads the effective tier after any change, so the labels can never go stale. */
  async function refresh() {
    const configData = await fetchFeatureModelConfig(projectId, featureId);
    setConfig(configData);
  }

  async function handleSelectOverride(jobKind: AgentJobKind, modelId: string) {
    setSavingOverride(jobKind);
    setActionError(null);
    try {
      if (!modelId) {
        await clearFeatureJobModelOverride(projectId, featureId, jobKind);
        setOverrides((current) => removeOverride(current, jobKind));
      } else {
        const updated = await setFeatureJobModelOverride(projectId, featureId, jobKind, modelId);
        setOverrides((current) => upsertOverride(current, updated));
      }
      await refresh();
    } catch (saveError) {
      setActionError(
        saveError instanceof Error ? saveError.message : "Failed to set override",
      );
    } finally {
      setSavingOverride(null);
    }
  }

  async function handleSaveTriplet() {
    if (!canSaveCustomTriplet(draft)) return;
    setSavingTriplet(true);
    setActionError(null);
    try {
      await saveFeatureModelSecrets(projectId, featureId, {
        modelBaseUrl: draft.modelBaseUrl.trim(),
        modelApiKey: draft.modelApiKey.trim(),
        modelId: draft.modelId.trim(),
      });
      setDraft(emptyCustomTripletDraft());
      await refresh();
    } catch (saveError) {
      setActionError(
        saveError instanceof Error ? saveError.message : "Failed to save the connection",
      );
    } finally {
      setSavingTriplet(false);
    }
  }

  /**
   * Issue #36: list what the typed connection serves, so the Model ID field does
   * not have to be guessed. Nothing here is stored — the API uses the supplied
   * base URL and key for exactly one request — so the listing is always the
   * provider's current answer, which is the question an admin asks after
   * rotating a key.
   */
  async function handleListTripletModels() {
    setTripletModelList({ status: "loading" });
    try {
      const result = await listModelsForConnection(project.organizationId, {
        baseUrl: draft.modelBaseUrl.trim(),
        apiKey: draft.modelApiKey.trim(),
      });
      setTripletModelList(modelListStateFrom(result));
    } catch (listError) {
      setTripletModelList({
        status: "failed",
        error:
          listError instanceof Error
            ? listError.message
            : "Could not list the provider's models",
      });
    }
  }

  async function handleClearTriplet() {
    setClearingTriplet(true);
    setActionError(null);
    try {
      await clearFeatureModelSecrets(projectId, featureId);
      await refresh();
    } catch (clearError) {
      setActionError(
        clearError instanceof Error ? clearError.message : "Failed to remove the connection",
      );
    } finally {
      setClearingTriplet(false);
    }
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!config) {
    return <p className="text-sm text-mist">Loading model configuration…</p>;
  }

  const tripletSet = config.customTripletSet;
  const pickerEnabled = catalogPickerEnabled(config);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Model configuration</CardTitle>
          <CardDescription>
            Which model this feature&apos;s jobs run on. A feature value wins over the
            project&apos;s and the organization&apos;s — resolution order is feature, then project,
            then organization.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-job-kind override</CardTitle>
          <CardDescription>
            {tripletSet
              ? "A custom connection is set below and wins over every catalog pick here — remove it to use these instead."
              : "Pick a model from your organization's catalog for one job kind, or leave it inheriting the project and organization."}
          </CardDescription>
        </CardHeader>
        <div className="space-y-3 px-4 pb-4">
          {AGENT_JOB_KINDS.map((jobKind) => {
            const current = overrideForJobKind(overrides, jobKind);
            const effective = config.jobKinds.find((entry) => entry.jobKind === jobKind);
            const view = effective ? describeEffectiveModelConfig(effective) : null;
            return (
              <div key={jobKind} className="rounded-md border border-rime p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-frost">
                      {AGENT_JOB_KIND_LABELS[jobKind]}
                    </span>
                    <span className="font-mono text-xs text-shadow">{jobKind}</span>
                  </div>
                  {view ? (
                    <span
                      className={
                        view.scope === "here"
                          ? "text-xs font-medium text-bifrost"
                          : "text-xs text-shadow"
                      }
                    >
                      {view.tierLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-mist">
                  {view ? view.valueLabel : "No configuration reported for this job kind."}
                </p>
                <Select
                  className="mt-3"
                  // The visible label is the `<span>` above, which is not
                  // programmatically associated with this control — so without
                  // this the picker has no accessible name at all and a screen
                  // reader announces five identical "combo box" entries on this
                  // page. Named from the same label the sighted user reads.
                  aria-label={`Model for ${AGENT_JOB_KIND_LABELS[jobKind]}`}
                  value={current?.modelId ?? ""}
                  disabled={savingOverride === jobKind || !pickerEnabled}
                  onChange={(e) => void handleSelectOverride(jobKind, e.target.value)}
                >
                  <option value="">Inherit project and organization</option>
                  {orgModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName} — {model.providerName}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom connection</CardTitle>
          <CardDescription>
            Point this feature at a connection independent of any provider your organization has
            configured. All three values are required — a partial connection is rejected.{" "}
            {tripletSet ? "Saved values are encrypted and never shown again." : ""}
          </CardDescription>
        </CardHeader>
        <div className="space-y-3 px-4 pb-4">
          {tripletSet ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rime p-3">
              <p className="text-sm text-mist">
                This feature uses a custom connection, which wins over every catalog pick above.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={clearingTriplet}
                onClick={() => void handleClearTriplet()}
              >
                {clearingTriplet ? "Removing…" : "Remove and inherit"}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium text-frost" htmlFor="feature-model-base-url">
                  Model base URL
                </label>
                <Input
                  id="feature-model-base-url"
                  placeholder="https://api.openai.com/v1"
                  value={draft.modelBaseUrl}
                  disabled={savingTriplet}
                  onChange={(e) => setDraft((d) => ({ ...d, modelBaseUrl: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-frost" htmlFor="feature-model-api-key">
                  Model API key
                </label>
                <Input
                  id="feature-model-api-key"
                  type="password"
                  placeholder="sk-…"
                  value={draft.modelApiKey}
                  disabled={savingTriplet}
                  onChange={(e) => setDraft((d) => ({ ...d, modelApiKey: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-frost" htmlFor="feature-model-id">
                  Model ID
                </label>
                <div className="flex items-end gap-2">
                  {tripletModelList.status === "loaded" &&
                  tripletModelList.models.length > 0 ? (
                    <Select
                      id="feature-model-id"
                      value={draft.modelId}
                      disabled={savingTriplet}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, modelId: e.target.value }))
                      }
                    >
                      <option value="">Select a model…</option>
                      {modelOptions({
                        models: tripletModelList.models,
                        selected: draft.modelId,
                      }).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id="feature-model-id"
                      placeholder="gpt-4.1"
                      value={draft.modelId}
                      disabled={savingTriplet}
                      onChange={(e) => setDraft((d) => ({ ...d, modelId: e.target.value }))}
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      savingTriplet ||
                      tripletModelList.status === "loading" ||
                      !canListConnectionModels({
                        baseUrl: draft.modelBaseUrl,
                        apiKey: draft.modelApiKey,
                      })
                    }
                    onClick={() => void handleListTripletModels()}
                  >
                    {tripletModelList.status === "loading" ? "Listing…" : "List models"}
                  </Button>
                </div>
                {tripletModelList.status === "failed" ? (
                  <p className="text-xs text-destructive">{tripletModelList.error}</p>
                ) : null}
                {tripletModelList.status === "idle" ? (
                  <p className="text-xs text-shadow">
                    {listUnavailableReason({
                      baseUrl: draft.modelBaseUrl,
                      apiKey: draft.modelApiKey,
                      canUseProviderApi: true,
                    }) ?? "You can pick from the provider's list, or type an ID."}
                  </p>
                ) : null}
                {/* Free text stays reachable after a successful listing: an
                    unlisted or not-yet-released model must still be usable. */}
                {tripletModelList.status === "loaded" ? (
                  <Input
                    id="feature-model-id-typed"
                    placeholder="…or type a model ID the provider does not list"
                    value={draft.modelId}
                    disabled={savingTriplet}
                    onChange={(e) => setDraft((d) => ({ ...d, modelId: e.target.value }))}
                  />
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={savingTriplet || !canSaveCustomTriplet(draft)}
                  onClick={() => void handleSaveTriplet()}
                >
                  {savingTriplet ? "Saving…" : "Save connection"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={savingTriplet}
                  onClick={() => setDraft(emptyCustomTripletDraft())}
                >
                  Clear
                </Button>
              </div>
            </>
          )}
          {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
        </div>
      </Card>
    </div>
  );
}
