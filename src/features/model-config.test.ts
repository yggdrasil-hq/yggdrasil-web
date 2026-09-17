import { describe, expect, it } from "vitest";
import {
  canSaveCustomTriplet,
  catalogPickerEnabled,
  describeEffectiveModelConfig,
  emptyCustomTripletDraft,
  isCustomTripletSet,
  missingJobKinds,
  overrideForJobKind,
  removeOverride,
  upsertOverride,
} from "@/lib/features/model-config";
import { AGENT_JOB_KINDS } from "@/lib/features/types";
import type {
  AgentJobKind,
  FeatureJobModelOverride,
  FeatureModelConfigEntry,
  FeatureModelConfigResponse,
  ModelConfigSource,
} from "@/lib/features/types";

function entry(
  source: ModelConfigSource,
  overrides: Partial<FeatureModelConfigEntry> = {},
): FeatureModelConfigEntry {
  return {
    jobKind: "spec_grill",
    source,
    modelId: null,
    modelDisplayName: null,
    providerName: null,
    ...overrides,
  };
}

function override(jobKind: AgentJobKind, modelId: string): FeatureJobModelOverride {
  return {
    featureId: "feat_1",
    jobKind,
    modelId,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
}

describe("describeEffectiveModelConfig (ADR 018 amendment, issue #5)", () => {
  it("marks a feature catalog override as configured here, naming the model", () => {
    const view = describeEffectiveModelConfig(
      entry("feature_override", { modelDisplayName: "Claude Sonnet 5", providerName: "OpenRouter" }),
    );

    expect(view.scope).toBe("here");
    expect(view.tierLabel).toBe("This feature");
    expect(view.valueLabel).toBe("Claude Sonnet 5 — OpenRouter");
  });

  it("marks a feature custom triplet as configured here without exposing values", () => {
    const view = describeEffectiveModelConfig(entry("feature_custom"));

    expect(view.scope).toBe("here");
    expect(view.valueLabel).toBe("Custom connection set on this feature");
  });

  it("labels a project catalog override as inherited, naming the model", () => {
    const view = describeEffectiveModelConfig(
      entry("project_override", { modelDisplayName: "GPT-4.1", providerName: "OpenRouter" }),
    );

    expect(view.scope).toBe("inherited");
    expect(view.tierLabel).toBe("Inherited · project");
    expect(view.valueLabel).toBe("GPT-4.1 — OpenRouter");
  });

  it("labels a project custom triplet as inherited without naming a model", () => {
    const view = describeEffectiveModelConfig(entry("project_custom"));

    expect(view.scope).toBe("inherited");
    expect(view.valueLabel).toBe("Custom connection set in project settings");
  });

  it("labels the org default as the last inherited tier", () => {
    const view = describeEffectiveModelConfig(
      entry("organization_default", { modelDisplayName: "GPT-4.1" }),
    );

    expect(view.scope).toBe("inherited");
    expect(view.tierLabel).toBe("Inherited · organization");
    expect(view.valueLabel).toBe("GPT-4.1");
  });

  it("says so plainly when nothing resolves at all", () => {
    const view = describeEffectiveModelConfig(entry("none"));

    expect(view.scope).toBe("unset");
    expect(view.tierLabel).toBe("Not configured");
    expect(view.valueLabel).toMatch(/refused/);
  });

  it("falls back to a readable label if a catalog model vanished from the catalog", () => {
    const view = describeEffectiveModelConfig(entry("feature_override"));

    expect(view.valueLabel).toBe("Model unavailable");
  });
});

describe("canSaveCustomTriplet", () => {
  it("accepts a complete triplet", () => {
    expect(
      canSaveCustomTriplet({
        modelBaseUrl: "https://api.example/v1",
        modelApiKey: "sk-abc",
        modelId: "gpt-4.1",
      }),
    ).toBe(true);
  });

  it("rejects a partial triplet — mirroring the API's all-or-nothing rule", () => {
    expect(
      canSaveCustomTriplet({
        modelBaseUrl: "https://api.example/v1",
        modelApiKey: "",
        modelId: "gpt-4.1",
      }),
    ).toBe(false);
  });

  it("treats whitespace-only values as missing", () => {
    expect(
      canSaveCustomTriplet({
        modelBaseUrl: "https://api.example/v1",
        modelApiKey: "   ",
        modelId: "gpt-4.1",
      }),
    ).toBe(false);
  });

  it("rejects an empty draft", () => {
    expect(canSaveCustomTriplet(emptyCustomTripletDraft())).toBe(false);
  });
});

describe("custom triplet state", () => {
  const config = (customTripletSet: boolean): FeatureModelConfigResponse => ({
    customTripletSet,
    jobKinds: [],
  });

  it("treats a missing response as not set", () => {
    expect(isCustomTripletSet(null)).toBe(false);
  });

  it("reads the API's flag rather than inferring it", () => {
    expect(isCustomTripletSet(config(true))).toBe(true);
    expect(isCustomTripletSet(config(false))).toBe(false);
  });

  it("disables the catalog picker while a custom triplet is set, since it wins outright", () => {
    expect(catalogPickerEnabled(config(true))).toBe(false);
    expect(catalogPickerEnabled(config(false))).toBe(true);
  });
});

describe("override list helpers", () => {
  it("finds an override by job kind", () => {
    const overrides = [override("spec_grill", "model_a"), override("feature_build", "model_b")];

    expect(overrideForJobKind(overrides, "feature_build")?.modelId).toBe("model_b");
    expect(overrideForJobKind(overrides, "test_run")).toBeNull();
  });

  it("replaces an existing override for the same job kind without duplicating it", () => {
    const updated = upsertOverride([override("spec_grill", "model_a")], override("spec_grill", "model_b"));

    expect(updated).toHaveLength(1);
    expect(updated[0].modelId).toBe("model_b");
  });

  it("adds an override for a job kind that had none", () => {
    const updated = upsertOverride([override("spec_grill", "model_a")], override("test_run", "model_b"));

    expect(updated).toHaveLength(2);
    expect(overrideForJobKind(updated, "test_run")?.modelId).toBe("model_b");
  });

  it("removes exactly one job kind's override, leaving the rest", () => {
    const remaining = removeOverride(
      [override("spec_grill", "model_a"), override("test_run", "model_b")],
      "spec_grill",
    );

    expect(remaining).toHaveLength(1);
    expect(remaining[0].jobKind).toBe("test_run");
  });

  it("removing a job kind with no override is a no-op", () => {
    const overrides = [override("spec_grill", "model_a")];

    expect(removeOverride(overrides, "test_run")).toEqual(overrides);
  });
});

describe("missingJobKinds", () => {
  const full: FeatureModelConfigResponse = {
    customTripletSet: false,
    jobKinds: AGENT_JOB_KINDS.map((jobKind) => entry("organization_default", { jobKind })),
  };

  it("reports nothing missing for a complete response", () => {
    expect(missingJobKinds(full)).toEqual([]);
  });

  it("reports every job kind missing when there's no response yet", () => {
    expect(missingJobKinds(null)).toEqual([...AGENT_JOB_KINDS]);
  });

  it("reports the specific gap in a partial response", () => {
    const partial: FeatureModelConfigResponse = {
      customTripletSet: false,
      jobKinds: full.jobKinds.filter((item) => item.jobKind !== "agentic_review"),
    };

    expect(missingJobKinds(partial)).toEqual(["agentic_review"]);
  });
});
