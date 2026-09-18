import type { ProviderModel, ProviderModelsResult } from "./types";

/**
 * ADR 018 / issue #36: the pure half of "list the provider's models and offer
 * them as a dropdown".
 *
 * Same split as the rest of this directory — vitest runs in a `node` environment
 * with no React testing library, so the decisions live here. The decisions worth
 * testing are all about *when the field stops being free text*: a listing that
 * fails must leave the admin able to type an id, a listing that succeeds must
 * not silently drop a model the admin already chose, and neither must block
 * saving.
 */

/** What the model field is currently offering. */
export type ModelFieldMode =
  /** Free text only — the default, and the fallback whenever listing is impossible. */
  | "typed"
  /** A dropdown of what the provider listed. */
  | "listed";

export type ModelListState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; models: ProviderModel[] }
  | { status: "failed"; error: string };

export const IDLE_MODEL_LIST: ModelListState = { status: "idle" };

/**
 * The reason shown when the API refuses a listing for lack of org-admin rights.
 *
 * A constant rather than a string built in two places, because the api client
 * has to recognise the 403 to produce it and the field has to render it — and
 * "Admin role required" is the API's wording for an API reader, not for somebody
 * looking at a form.
 */
export const LISTING_NEEDS_ADMIN =
  "Listing models needs organization admin access — type the model ID instead.";

/** Turns a listing response into the field's state. */
export function modelListStateFrom(result: ProviderModelsResult): ModelListState {
  if (!result.ok) return { status: "failed", error: result.error };
  return { status: "loaded", models: result.models };
}

/**
 * Whether a listing can even be attempted for a custom connection.
 *
 * Both halves are required, and the same rule the API applies: a listing with no
 * key is a 401, and with no base URL there is nothing to call. The field must
 * therefore stay free text until both are filled — not offer a button that can
 * only fail.
 */
export function canListConnectionModels(input: { baseUrl: string; apiKey: string }): boolean {
  return input.baseUrl.trim().length > 0 && input.apiKey.trim().length > 0;
}

/**
 * Why a listing is unavailable, phrased for the admin looking at the field, or
 * null when it is available. The point is that the field never renders a
 * disabled button with no explanation.
 */
export function listUnavailableReason(input: {
  baseUrl: string;
  apiKey: string;
  /** False for a non-admin, who cannot spend the org's credential. */
  canUseProviderApi: boolean;
}): string | null {
  if (!input.canUseProviderApi) {
    return "Listing models needs organization admin access — type the model ID instead.";
  }
  if (!input.baseUrl.trim() || !input.apiKey.trim()) {
    return "Fill in the base URL and API key first, then you can pick from the provider's list.";
  }
  return null;
}

/**
 * The value the field should hold after a successful listing, and whether the
 * admin needs telling about it.
 *
 * A model that was already typed but is absent from the list is **kept**, with a
 * note. Replacing it with the first listed model would silently change what the
 * form is about to save — the unlisted case being exactly what #36 says must
 * keep working (an unlisted or not-yet-released model added by hand).
 */
export function reconcileModelSelection(input: {
  current: string;
  models: ProviderModel[];
}): { value: string; note: string | null } {
  const current = input.current.trim();
  if (current && input.models.some((model) => model.id === current)) {
    return { value: current, note: null };
  }
  if (current) {
    return {
      value: current,
      note: "The id you typed is not in the provider's list. It has been kept as typed.",
    };
  }
  return { value: "", note: null };
}

/**
 * The dropdown's options, with the admin's typed id included when it is not
 * among them.
 *
 * Without this the control would render with a value that matches no option, and
 * a browser shows that as an empty field — the typed id would appear to have
 * been erased even though it is still what would be saved.
 */
export function modelOptions(input: {
  models: ProviderModel[];
  selected: string;
}): Array<{ value: string; label: string }> {
  const options = input.models.map((model) => ({
    value: model.id,
    label: model.displayName ? `${model.displayName} (${model.id})` : model.id,
  }));
  const selected = input.selected.trim();
  if (selected && !input.models.some((model) => model.id === selected)) {
    return [{ value: selected, label: `${selected} (not listed)` }, ...options];
  }
  return options;
}

/**
 * What to pre-fill the display name with when the admin picks from the list.
 *
 * The issue leaves this open — "whether adding from the list pre-fills
 * `displayName` from the provider or leaves it for the admin to write". Filling
 * from the provider when it gave a label saves a step; when it gave none, the id
 * is used *as the display name* rather than left empty, because an empty
 * required field would make the pick feel like it had failed. Either way the
 * admin can overwrite it, and it is never touched once they have typed one.
 */
export function suggestedDisplayName(input: {
  models: ProviderModel[];
  modelId: string;
  currentDisplayName: string;
}): string {
  if (input.currentDisplayName.trim()) return input.currentDisplayName;
  const match = input.models.find((model) => model.id === input.modelId);
  if (!match) return input.currentDisplayName;
  return match.displayName ?? match.id;
}
