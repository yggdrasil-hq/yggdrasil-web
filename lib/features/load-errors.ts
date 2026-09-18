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
 * failure as `API error: <status> <statusText>`, so the status is the stable
 * part; matching the whole string would break the moment a proxy or a
 * `statusText` changed. An unrecognised message is passed through verbatim
 * rather than replaced — a message we cannot classify is still the only
 * diagnostic the user or their operator has, and inventing friendly copy for it
 * would be throwing away information.
 */

export interface LoadFailureCopy {
  /** Short heading. Never the raw error. */
  title: string;
  /** One sentence naming the likely cause, or the raw message when unknown. */
  detail: string;
  /** True when the message was recognised, so the UI can decide to show it too. */
  recognised: boolean;
}

/** Pulls the HTTP status out of the shape `lib/api.ts` produces. */
function statusFrom(message: string): number | null {
  const match = /^API error:\s*(\d{3})\b/.exec(message.trim());
  if (!match) return null;
  return Number(match[1]);
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
    return {
      title: "Something went wrong on our side",
      detail: `The server could not complete this request (${trimmed}). Trying again in a moment may work — if it keeps failing, this is worth reporting.`,
      recognised: true,
    };
  }

  if (status === 400 || status === 422) {
    return {
      title: "This request was rejected",
      detail: `${trimmed}. Reloading the page usually clears it; if not, something on this page sent a value the API would not accept.`,
      recognised: true,
    };
  }

  return {
    title: "Couldn't load this page",
    detail: trimmed || "The request failed without a message.",
    recognised: false,
  };
}

/**
 * Whether a load failure is worth offering a retry for.
 *
 * A 404 will not become a 200 by asking again — offering "Try again" there is a
 * button that lies. Everything else might, so the button is offered.
 */
export function isRetryable(message: string): boolean {
  return statusFrom(message.trim()) !== 404;
}
