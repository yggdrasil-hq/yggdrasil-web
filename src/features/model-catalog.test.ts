import { describe, expect, it } from "vitest";
import {
  IDLE_MODEL_LIST,
  LISTING_NEEDS_ADMIN,
  canListConnectionModels,
  listUnavailableReason,
  modelListStateFrom,
  modelOptions,
  reconcileModelSelection,
  suggestedDisplayName,
} from "@/lib/features/model-catalog";
import type { ProviderModel } from "@/lib/features/types";

/**
 * Issue #36: when the model field stops being free text. The rule the issue
 * makes explicit is that the dropdown is a convenience — a listing that fails,
 * returns nothing, or is unavailable must all leave the admin able to type an id
 * and save.
 */

const MODELS: ProviderModel[] = [
  { id: "gpt-5", displayName: "GPT-5" },
  { id: "gpt-5-mini", displayName: null },
];

describe("modelListStateFrom", () => {
  it("carries a failed listing through as a reason", () => {
    expect(modelListStateFrom({ ok: false, error: "The provider rejected the API key" })).toEqual({
      status: "failed",
      error: "The provider rejected the API key",
    });
  });

  it("carries a successful listing through", () => {
    expect(modelListStateFrom({ ok: true, models: MODELS })).toEqual({
      status: "loaded",
      models: MODELS,
    });
  });

  it("treats an empty listing as loaded, not as a failure", () => {
    // An empty dropdown and a failed listing are different problems and only one
    // of them is the provider's fault, so they must not collapse into each other.
    expect(modelListStateFrom({ ok: true, models: [] })).toEqual({
      status: "loaded",
      models: [],
    });
  });
});

describe("canListConnectionModels", () => {
  it("requires both halves of the tuple the API requires", () => {
    expect(canListConnectionModels({ baseUrl: "https://x.test", apiKey: "sk" })).toBe(true);
    expect(canListConnectionModels({ baseUrl: "https://x.test", apiKey: "" })).toBe(false);
    expect(canListConnectionModels({ baseUrl: "", apiKey: "sk" })).toBe(false);
    expect(canListConnectionModels({ baseUrl: "  ", apiKey: "  " })).toBe(false);
  });
});

describe("listUnavailableReason", () => {
  it("explains a permissions gap differently from a missing input", () => {
    // One is fixed by an admin, the other by typing two fields — sending the
    // reader to the wrong fix is the point of asserting both.
    expect(
      listUnavailableReason({ baseUrl: "", apiKey: "", canUseProviderApi: false }),
    ).toBe(LISTING_NEEDS_ADMIN);
    expect(
      listUnavailableReason({ baseUrl: "", apiKey: "sk", canUseProviderApi: true }),
    ).toContain("base URL and API key");
  });

  it("says nothing when listing is available", () => {
    expect(
      listUnavailableReason({
        baseUrl: "https://x.test",
        apiKey: "sk",
        canUseProviderApi: true,
      }),
    ).toBeNull();
  });
});

describe("reconcileModelSelection", () => {
  it("keeps a typed id that is in the list", () => {
    expect(reconcileModelSelection({ current: "gpt-5", models: MODELS })).toEqual({
      value: "gpt-5",
      note: null,
    });
  });

  // Replacing a typed id with the first listed model would silently change what
  // the form is about to save, and the unlisted case is exactly what must keep
  // working.
  it("keeps an unlisted id and says so", () => {
    const result = reconcileModelSelection({ current: "not-yet-released", models: MODELS });

    expect(result.value).toBe("not-yet-released");
    expect(result.note).toContain("kept as typed");
  });

  it("selects nothing when the field was empty", () => {
    expect(reconcileModelSelection({ current: "", models: MODELS })).toEqual({
      value: "",
      note: null,
    });
  });
});

describe("modelOptions", () => {
  it("labels an id with its display name when the provider gave one", () => {
    expect(modelOptions({ models: MODELS, selected: "" })).toEqual([
      { value: "gpt-5", label: "GPT-5 (gpt-5)" },
      { value: "gpt-5-mini", label: "gpt-5-mini" },
    ]);
  });

  // Without this the control renders with a value matching no option, which a
  // browser shows as an empty field — the typed id would look erased.
  it("includes the typed id when the provider does not list it", () => {
    const options = modelOptions({ models: MODELS, selected: "custom-thing" });

    expect(options[0]).toEqual({ value: "custom-thing", label: "custom-thing (not listed)" });
    expect(options).toHaveLength(3);
  });

  it("does not duplicate a typed id the provider does list", () => {
    expect(modelOptions({ models: MODELS, selected: "gpt-5" })).toHaveLength(2);
  });
});

describe("suggestedDisplayName", () => {
  it("uses the provider's label, saving the admin a step", () => {
    expect(
      suggestedDisplayName({ models: MODELS, modelId: "gpt-5", currentDisplayName: "" }),
    ).toBe("GPT-5");
  });

  it("falls back to the id when the provider gave no label", () => {
    // Leaving it empty would put a required field in a failing state the moment
    // the admin picks, which reads as though the pick went wrong.
    expect(
      suggestedDisplayName({ models: MODELS, modelId: "gpt-5-mini", currentDisplayName: "" }),
    ).toBe("gpt-5-mini");
  });

  it("never overwrites a name the admin wrote", () => {
    expect(
      suggestedDisplayName({
        models: MODELS,
        modelId: "gpt-5",
        currentDisplayName: "My GPT",
      }),
    ).toBe("My GPT");
  });

  it("leaves the name alone for a model that is not in the list", () => {
    expect(
      suggestedDisplayName({ models: MODELS, modelId: "custom", currentDisplayName: "" }),
    ).toBe("");
  });
});

describe("IDLE_MODEL_LIST", () => {
  it("starts idle, so the field is free text until something is fetched", () => {
    expect(IDLE_MODEL_LIST).toEqual({ status: "idle" });
  });
});
