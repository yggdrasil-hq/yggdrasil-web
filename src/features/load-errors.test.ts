import { describe, expect, it } from "vitest";
import {
  apiErrorDetail,
  describeLoadFailure,
  formatApiError,
  isRetryable,
  statusFrom,
} from "@/lib/features/load-errors";

/**
 * The copy a page shows when it could not load.
 *
 * The case that motivated this: the project usage page rendered exactly
 * `API error: 404 Not Found` — no shell, no navigation, and a message about
 * HTTP rather than about the user's situation.
 */

describe("describeLoadFailure", () => {
  it("turns a 404 into something a person can act on", () => {
    const copy = describeLoadFailure("API error: 404 Not Found", "project");

    expect(copy.recognised).toBe(true);
    expect(copy.title).toBe("This project isn't available");
    // The two causes are indistinguishable through the API on purpose, so the
    // sentence names both rather than guessing one.
    expect(copy.detail).toContain("deleted");
    expect(copy.detail).toContain("access");
  });

  it("names the subject, so the heading is not generic", () => {
    expect(describeLoadFailure("API error: 404 Not Found", "feature").title).toBe(
      "This feature isn't available",
    );
    expect(describeLoadFailure("API error: 404 Not Found", "test").title).toBe(
      "This test isn't available",
    );
    expect(describeLoadFailure("API error: 404 Not Found", "design").title).toBe(
      "This design isn't available",
    );
    expect(describeLoadFailure("API error: 404 Not Found").title).toBe(
      "This page isn't available",
    );
  });

  // A 5xx is the server's problem. Saying so is the difference between a user
  // waiting and a user hunting for a mistake they did not make.
  it("separates a server fault from a user-facing one", () => {
    const copy = describeLoadFailure("API error: 500 Internal Server Error", "project");

    expect(copy.title).toBe("Something went wrong on our side");
    expect(copy.detail).toContain("500");
  });

  it("handles an expired session as its own case", () => {
    expect(describeLoadFailure("API error: 401 Unauthorized").detail).toContain(
      "Signing in again",
    );
    expect(describeLoadFailure("API error: 403 Forbidden").title).toBe(
      "You don't have access to this",
    );
  });

  it("handles a rejected request without pretending it was a network fault", () => {
    expect(describeLoadFailure("API error: 400 Bad Request").title).toBe(
      "This request was rejected",
    );
  });

  // The important negative: an unrecognised failure must not be replaced with
  // friendly copy, because the raw text is the only diagnostic there is.
  it("passes an unrecognised message through verbatim", () => {
    const copy = describeLoadFailure("Failed to fetch");

    expect(copy.recognised).toBe(false);
    expect(copy.detail).toBe("Failed to fetch");
  });

  it("does not mistake a non-status message that merely starts with numbers", () => {
    expect(describeLoadFailure("500 things went wrong").recognised).toBe(false);
  });

  it("survives an empty message rather than rendering nothing", () => {
    const copy = describeLoadFailure("");

    expect(copy.recognised).toBe(false);
    expect(copy.detail.length).toBeGreaterThan(0);
  });

  it("reads the status out of the shape lib/api.ts actually throws", () => {
    // Pinned because the whole module keys on this shape; if api.ts changes its
    // wording, every rewrite above silently stops applying.
    expect(describeLoadFailure("API error: 404 Not Found").recognised).toBe(true);
    expect(describeLoadFailure("API error:404 Not Found").recognised).toBe(true);
  });
});

describe("isRetryable", () => {
  // A 404 will not become a 200 by asking again, so offering "Try again" would
  // be a button that lies.
  it("does not offer a retry for a 404", () => {
    expect(isRetryable("API error: 404 Not Found")).toBe(false);
  });

  it("offers a retry for everything else", () => {
    expect(isRetryable("API error: 500 Internal Server Error")).toBe(true);
    expect(isRetryable("Failed to fetch")).toBe(true);
    expect(isRetryable("API error: 403 Forbidden")).toBe(true);
  });
});

/*
 * The regression these two cover, found by opening a project that does not
 * exist in the running app.
 *
 * `parseJson` used to include the HTTP status only as a *fallback*, when the API
 * sent no JSON error body:
 *
 *     throw new Error(body?.error ?? `API error: ${status} ${statusText}`);
 *
 * Every API 404 answers with `{"error":"Project not found"}`, so the thrown
 * message was the prose and the status was gone. `statusFrom` then returned null,
 * with two visible consequences on the real page: the 404 copy below was never
 * reached (the heading read "Couldn't load this page" with the raw API sentence
 * under it), and "Try again" was offered for a 404 — the exact button this
 * module's own comment calls a lie.
 *
 * So these tests are about the *shape of the message* as much as the copy: the
 * status has to survive being carried alongside the API's prose.
 */
describe("formatApiError", () => {
  it("keeps the API's prose first and appends the status", () => {
    // Ordering is deliberate: several dozen places render `error.message` into a
    // form's error slot, and those want the human sentence to lead.
    expect(formatApiError(404, "Not Found", "Project not found")).toBe(
      "Project not found (API error: 404 Not Found)",
    );
  });

  it("still produces a parseable message when the API said nothing", () => {
    expect(formatApiError(500, "Internal Server Error")).toBe(
      "API error: 500 Internal Server Error",
    );
    expect(statusFrom(formatApiError(500, "Internal Server Error"))).toBe(500);
  });

  it("ignores a blank or whitespace-only detail", () => {
    expect(formatApiError(400, "Bad Request", "   ")).toBe("API error: 400 Bad Request");
    expect(formatApiError(400, "Bad Request", null)).toBe("API error: 400 Bad Request");
  });

  it("is parseable with a detail attached — the whole point", () => {
    expect(statusFrom(formatApiError(404, "Not Found", "Project not found"))).toBe(404);
  });
});

describe("statusFrom", () => {
  it("finds the status anywhere in the message, not only at the start", () => {
    expect(statusFrom("Project not found (API error: 404 Not Found)")).toBe(404);
    expect(statusFrom("API error: 404 Not Found")).toBe(404);
  });

  it("is null when there is genuinely no status to find", () => {
    // A transport failure has no HTTP status, and the callers distinguish that
    // case rather than treating it as a zero.
    expect(statusFrom("Failed to fetch")).toBeNull();
    expect(statusFrom("")).toBeNull();
  });
});

describe("apiErrorDetail", () => {
  it("strips the appended status back off", () => {
    expect(apiErrorDetail("Project not found (API error: 404 Not Found)")).toBe(
      "Project not found",
    );
  });

  it("strips a leading status line, leaving no dangling prose", () => {
    expect(apiErrorDetail("API error: 500 Internal Server Error")).toBe("");
    expect(apiErrorDetail("API error: 400 Bad Request")).toBe("");
  });

  it("passes through a message with no marker at all", () => {
    expect(apiErrorDetail("Failed to fetch")).toBe("Failed to fetch");
  });
});

describe("a 404 that arrives with the API's own prose", () => {
  // The exact message the app produced for a project that does not exist.
  const message = formatApiError(404, "Not Found", "Project not found");

  it("gets the crafted copy rather than the unrecognised fallback", () => {
    const copy = describeLoadFailure(message, "project");

    expect(copy.recognised).toBe(true);
    expect(copy.title).toBe("This project isn't available");
  });

  it("does not offer a retry", () => {
    expect(isRetryable(message)).toBe(false);
  });
});

describe("a 500 that arrives with the API's own prose", () => {
  const message = formatApiError(500, "Internal Server Error", "relation does not exist");

  it("quotes the server's reason without printing the status twice", () => {
    const copy = describeLoadFailure(message, "project");

    expect(copy.title).toBe("Something went wrong on our side");
    expect(copy.detail).toContain("relation does not exist");
    // The status marker is stripped for display, so it appears at most once.
    expect(copy.detail.match(/API error:/g) ?? []).toHaveLength(0);
  });

  it("does offer a retry, because a 500 may clear", () => {
    expect(isRetryable(message)).toBe(true);
  });
});
