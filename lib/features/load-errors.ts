/**
 * What a page says when it could not load its data.
 *
 * **Why this exists.** Every project-scoped client in this app renders its load
 * failure as a bare centred `<div>` with the thrown message in it — no app
 * shell, so no sidebar, no way back except the browser's back button, and the
 * message is whatever `lib/api.ts` threw. Against a real failure that reads
 * `API error: 404 Not Found`, which is a fact about HTTP rather than something
 * a person can act on.
 *
 * This is the pure half of the fix: turning a thrown message into a heading and
 * a sentence that says what to do. The component that renders it
 * (`components/ui/load-failure.tsx`) adds no logic, which is the convention here
 * — vitest runs in a `node` environment with no React testing library, so
 * anything worth asserting belongs in a module like this one.
 *
 * **The rewrites are keyed on status, not on prose.** `api.ts` builds every
 * failure through `formatApiError` so the status is always present and always
 * the stable part; matching the whole string would break the moment a proxy or a
 * `statusText` changed. An unrecognised message is passed through verbatim
 * rather than replaced — a message we cannot classify is still the only
 * diagnostic the user or their operator has, and inventing friendly copy for it
 * would be throwing away information.
 *
 * **Where the status sits in the string matters, and it was got wrong once.**
 * The status used to be included only as a *fallback*, when the API sent no JSON
 * error body:
 *
 * ```ts
 * throw new Error(body?.error ?? `API error: ${status} ${statusText}`);
 * ```
 *
 * Every API 404 carries `{"error":"Project not found"}`, so in practice the
 * thrown message was the prose and the status was **dropped** — which meant
 * `statusFrom` returned null for exactly the failures this module exists to
 * classify. The copy fell through to the unrecognised branch (a generic heading
 * and the raw API sentence) and, worse, `isRetryable` returned `true`, because
 * `null !== 404`. So a page saying "Project not found" also offered "Try
 * again", which is the button this module's own comment calls a lie.
 *
 * The fix is that the status is now *always* in the string — appended after the
 * prose rather than replacing it, so the inline error displays elsewhere in the
 * app keep leading with the human-readable part — and `statusFrom` looks for the
 * marker anywhere rather than only at the start.
 */

export interface LoadFailureCopy {
  /** Short heading. Never the raw error. */
  title: string;
  /** One sentence naming the likely cause, or the raw message when unknown. */
  detail: string;
  /** True when the message was recognised, so the UI can decide to show it too. */
  recognised: boolean;
}

/**
 * The marker `formatApiError` puts on every failure it builds. Exported because
 * both the producer (`lib/api.ts`) and this module's own tests need one spelling
 * of it.
 */
export const API_ERROR_MARKER = "API error:";

/**
 * The one place an API failure's message is built. `lib/api.ts` calls this for
 * every non-ok response, so the status is structurally present rather than
 * merely likely.
 *
 * The API's own prose comes **first** and the status is appended in brackets,
 * which is a deliberate ordering rather than an accident: several dozen places
 * in this app render `error.message` straight into a form's error slot, and
 * those read far better as "Project not found (API error: 404 Not Found)" than
 * as a status line with the useful sentence buried after it. `statusFrom` still
 * finds it either way.
 */
export function formatApiError(
  status: number,
  statusText: string,
  detail?: string | null,
): string {
  const statusLine = `${API_ERROR_MARKER} ${status}${statusText ? ` ${statusText}` : ""}`;
  const prose = detail?.trim();
  return prose ? `${prose} (${statusLine})` : statusLine;
}

/**
 * Pulls the HTTP status out of anything `formatApiError` produced.
 *
 * Deliberately not anchored to the start of the string: the status is appended
 * after the API's prose so the prose can lead. This is the only pattern that
 * knows the message shape, which is why it is here next to the producer rather
 * than duplicated at each call site.
 */
export function statusFrom(message: string): number | null {
  const match = /API error:\s*(\d{3})\b/.exec(message);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * The API's own words, with this module's status marker stripped back off.
 *
 * `describeLoadFailure` echoes the raw message in the branches where friendly
 * copy would be inventing a cause (a 5xx, a rejected request, anything
 * unrecognised). Echoing the whole thing would print the status line twice once
 * the status is always present, so the readable half is separated out here.
 * Returns an empty string when there is nothing but the status — a caller can
 * then treat "no detail" as "nothing worth quoting".
 */
export function apiErrorDetail(message: string): string {
  const trimmed = message.trim();
  const bracket = /\s*\((?:API error:[^)]*)\)\s*$/.exec(trimmed);
  if (bracket) return trimmed.slice(0, bracket.index).trim();
  if (trimmed.startsWith(API_ERROR_MARKER)) {
    // Safe to treat the whole string as ours: `formatApiError` only ever puts
    // the marker at the start when there is no prose at all, so a message that
    // begins with it carries nothing worth quoting. A string that merely
    // *mentions* the marker mid-sentence falls through to the `return` below and
    // is echoed unchanged, which is the conservative direction.
    return "";
  }
  return trimmed;
}

export function describeLoadFailure(
  message: string,
  subject: "project" | "feature" | "test" | "design" | "page" = "page",
): LoadFailureCopy {
  const trimmed = message.trim();
  const status = statusFrom(trimmed);

  if (status === 404) {
    // The most common cause in this app by a distance, and the one where the
    // raw status is actively misleading: a project that was deleted and a
    // project the caller is not a member of are indistinguishable here on
    // purpose (the API returns 404 rather than 403 so it cannot be used to
    // probe for existence), and "not found" reads like the URL was wrong.
    const noun =
      subject === "project"
        ? "project"
        : subject === "feature"
          ? "feature"
          : subject === "test"
            ? "test"
            : subject === "design"
              ? "design"
              : "page";
    return {
      title: `This ${noun} isn't available`,
      detail: `It may have been deleted, or your account may not have access to it. If you followed a link, ask whoever sent it to check it still points at something you can open.`,
      recognised: true,
    };
  }

  if (status === 401 || status === 403) {
    return {
      title: "You don't have access to this",
      detail:
        "Your session may have expired. Signing in again usually fixes it; if not, ask an organization admin for access.",
      recognised: true,
    };
  }

  if (status !== null && status >= 500) {
    // Worth separating from the rest: a 5xx is the server's problem, and
    // telling the user that stops them hunting for a mistake they did not make.
    // The status stays visible — it is the one detail that makes a report
    // actionable — but composed as `HTTP 500` rather than by echoing the raw
    // message, which would nest brackets and print our own marker at the user.
    const quoted = apiErrorDetail(trimmed);
    const fault = quoted ? `HTTP ${status}: ${quoted}` : `HTTP ${status}`;
    return {
      title: "Something went wrong on our side",
      detail: `The server could not complete this request (${fault}). Trying again in a moment may work — if it keeps failing, this is worth reporting.`,
      recognised: true,
    };
  }

  if (status === 400 || status === 422) {
    const quoted = apiErrorDetail(trimmed);
    return {
      title: "This request was rejected",
      detail: quoted
        ? `${quoted}. Reloading the page usually clears it; if not, something on this page sent a value the API would not accept.`
        : "The API would not accept this request. Reloading the page usually clears it; if not, something on this page sent a value the API would not accept.",
      recognised: true,
    };
  }

  return {
    title: "Couldn't load this page",
    // The raw message is kept verbatim when it has anything to say — an
    // unclassified failure's own words are the only diagnostic the user or their
    // operator has, and replacing them with friendly copy would throw that away.
    // `apiErrorDetail` only removes our own status marker, so a message that is
    // *nothing but* the marker falls back to the neutral sentence rather than
    // rendering a bare "API error: 500".
    detail: apiErrorDetail(trimmed) || "The request failed without a message.",
    recognised: false,
  };
}

/**
 * Whether a load failure is worth offering a retry for.
 *
 * A 404 will not become a 200 by asking again — offering "Try again" there is a
 * button that lies. Everything else might, so the button is offered.
 *
 * **The `!==` is deliberately conservative about a missing status now.** It used
 * to read `statusFrom(...) !== 404`, which is `true` when the status cannot be
 * parsed at all — so every API 404, whose message lost its status (see this
 * module's header), got a retry button. The two failure kinds are genuinely
 * different and are now spelled separately:
 *
 * - a **recognised** status is retryable unless it is 404 (a 500 really may
 *   clear, and a 401 after re-authenticating may too);
 * - an **unrecognised** failure is retryable, because the commonest cause is a
 *   transport problem — `Failed to fetch` when the API is briefly unreachable —
 *   and retry is exactly the right affordance there.
 *
 * So the outcome for an unparseable message is unchanged, and that is on
 * purpose: it is the *status-carried* case that was wrong, and it is fixed
 * where the status is produced (`formatApiError`) rather than by guessing less
 * here.
 */
export function isRetryable(message: string): boolean {
  const status = statusFrom(message.trim());
  if (status === null) return true;
  return status !== 404;
}
