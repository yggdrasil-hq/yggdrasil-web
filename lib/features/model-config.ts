import {
  AGENT_JOB_KINDS,
  type AgentJobKind,
  type FeatureJobModelOverride,
  type FeatureModelConfigEntry,
  type FeatureModelConfigResponse,
  type ModelConfigSource,
} from "./types";

/**
 * Pure view-model logic for the feature-level model-config surface
 * (`/projects/:projectId/features/:featureId/model-config`, ADR 018 amendment /
 * issue #5). Kept out of the component so it's unit-testable in this repo's
 * node-only vitest setup, which has no React testing library — same split as
 * lib/features/lifecycle.ts.
 */

export type EffectiveModelConfigScope = "here" | "inherited" | "unset";

export interface EffectiveModelConfigView {
  scope: EffectiveModelConfigScope;
  /** The tier in one short phrase — the "where does this come from" answer. */
  tierLabel: string;
  /** The concrete model, when the tier is catalog-based; a human sentence otherwise. */
  valueLabel: string;
}

const TIER_LABELS: Record<ModelConfigSource, string> = {
  feature_custom: "This feature",
  feature_override: "This feature",
  project_custom: "Inherited · project",
  project_override: "Inherited · project",
  organization_default: "Inherited · organization",
  none: "Not configured",
};

/**
 * Turns one API entry into the two things the UI must always show together:
 * which tier wins, and what that tier actually resolves to. Showing them
 * separately is what keeps "inherit" from being ambiguous — "Inherited ·
 * organization" plus the model's name is a complete answer, whereas either half
 * alone is not.
 */
export function describeEffectiveModelConfig(
  entry: FeatureModelConfigEntry,
): EffectiveModelConfigView {
  const tierLabel = TIER_LABELS[entry.source];
  const scope: EffectiveModelConfigScope =
    entry.source === "feature_custom" || entry.source === "feature_override"
      ? "here"
      : entry.source === "none"
        ? "unset"
        : "inherited";

  switch (entry.source) {
    case "feature_custom":
      return { scope, tierLabel, valueLabel: "Custom connection set on this feature" };
    case "project_custom":
      return { scope, tierLabel, valueLabel: "Custom connection set in project settings" };
    case "none":
      return {
        scope,
        tierLabel,
        valueLabel: "No model configuration resolves — jobs will be refused",
      };
    default:
      return {
        scope,
        tierLabel,
        valueLabel: entry.modelDisplayName
          ? entry.modelDisplayName + (entry.providerName ? ` — ${entry.providerName}` : "")
          : "Model unavailable",
      };
  }
}

export interface CustomTripletDraft {
  modelBaseUrl: string;
  modelApiKey: string;
  modelId: string;
}

export function emptyCustomTripletDraft(): CustomTripletDraft {
  return { modelBaseUrl: "", modelApiKey: "", modelId: "" };
}

/**
 * Mirrors the API's all-or-nothing rule (a partial triplet is a 400) so the
 * form can disable Save instead of round-tripping to find out. Whitespace-only
 * counts as empty, matching the API's trimmed validation.
 */
export function canSaveCustomTriplet(draft: CustomTripletDraft): boolean {
  return (
    draft.modelBaseUrl.trim().length > 0 &&
    draft.modelApiKey.trim().length > 0 &&
    draft.modelId.trim().length > 0
  );
}

/** True only when every MODEL_* key came back as set — the same test the API applies. */
export function isCustomTripletSet(config: FeatureModelConfigResponse | null): boolean {
  return config?.customTripletSet ?? false;
}

export function overrideForJobKind(
  overrides: FeatureJobModelOverride[],
  jobKind: AgentJobKind,
): FeatureJobModelOverride | null {
  return overrides.find((override) => override.jobKind === jobKind) ?? null;
}

/** Replaces (or adds) one job kind's catalog override, leaving the others untouched. */
export function upsertOverride(
  overrides: FeatureJobModelOverride[],
  override: FeatureJobModelOverride,
): FeatureJobModelOverride[] {
  return [...overrides.filter((existing) => existing.jobKind !== override.jobKind), override];
}

/** Drops one job kind's override — i.e. back to inheriting the project/org tier. */
export function removeOverride(
  overrides: FeatureJobModelOverride[],
  jobKind: AgentJobKind,
): FeatureJobModelOverride[] {
  return overrides.filter((existing) => existing.jobKind !== jobKind);
}

/**
 * The tiers that only the org's own catalog can satisfy, i.e. the ones whose
 * effective value the catalog picker can express. A custom triplet can't be
 * "picked", so the picker is disabled while one is set.
 */
export function catalogPickerEnabled(config: FeatureModelConfigResponse | null): boolean {
  return !isCustomTripletSet(config);
}

/** Every entry the API should have returned, in the canonical job-kind order. */
export function missingJobKinds(config: FeatureModelConfigResponse | null): AgentJobKind[] {
  if (!config) return [...AGENT_JOB_KINDS];
  const present = new Set(config.jobKinds.map((entry) => entry.jobKind));
  return AGENT_JOB_KINDS.filter((jobKind) => !present.has(jobKind));
}
