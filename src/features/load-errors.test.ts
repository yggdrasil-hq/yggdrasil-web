import { describe, expect, it } from "vitest";
import { describeLoadFailure, isRetryable } from "@/lib/features/load-errors";

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
