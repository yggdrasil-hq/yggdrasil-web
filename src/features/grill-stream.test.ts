import { describe, expect, it } from "vitest";
import {
  countAgentTextEvents,
  shouldDropStreamBuffer,
} from "@/lib/features/grill-stream";

describe("countAgentTextEvents", () => {
  it("counts only the authoritative assistant messages", () => {
    // `agent_text` is the message_end record. Deltas (`agent_text_delta`) are not
    // stored events at all and must never reach here, but counting defensively
    // keeps a mistake in that separation from silently disabling the supersede
    // rule.
    expect(
      countAgentTextEvents([
        { type: "ask_user" },
        { type: "agent_text" },
        { type: "user_message" },
        { type: "agent_text" },
        { type: "submit_adr" },
      ]),
    ).toBe(2);
  });

  it("is zero for a transcript with no assistant prose", () => {
    expect(countAgentTextEvents([])).toBe(0);
    expect(countAgentTextEvents([{ type: "ask_user" }, { type: "run_started" }])).toBe(0);
  });
});

describe("shouldDropStreamBuffer", () => {
  it("drops the buffer when a new authoritative message arrives", () => {
    // The supersede rule: deltas built "Drafting the ADR.", then message_end
    // persisted that exact text, so the provisional copy must go or the page
    // shows it twice.
    expect(
      shouldDropStreamBuffer({ previousAgentTextCount: 0, agentTextCount: 1, jobStatus: "running" }),
    ).toBe(true);
  });

  it("keeps the buffer while the message is still streaming", () => {
    // A mid-stream read has not yet seen the finished message, so the growing
    // bubble must survive — otherwise the text would blink away on every poll
    // and re-appear on the next chunk.
    expect(
      shouldDropStreamBuffer({ previousAgentTextCount: 1, agentTextCount: 1, jobStatus: "running" }),
    ).toBe(false);
  });

  it("keeps the buffer once it has already been superseded", () => {
    // The read after the one that dropped it: still no new message, still
    // running. Nothing to do.
    expect(
      shouldDropStreamBuffer({ previousAgentTextCount: 2, agentTextCount: 2, jobStatus: "running" }),
    ).toBe(false);
  });

  it("drops the buffer when the run is no longer running", () => {
    // A stream that stopped mid-message never persists its partial text, so
    // keeping it would show an agent utterance that is not in the transcript.
    for (const jobStatus of ["failed", "cancelled", "completed", null] as const) {
      expect(
        shouldDropStreamBuffer({
          previousAgentTextCount: 1,
          agentTextCount: 1,
          jobStatus,
        }),
      ).toBe(true);
    }
  });

  it("treats a first read of a finished run as stale", () => {
    // Opening the grill page for a session that already ended: the buffer starts
    // empty and there is nothing to show, so the run-status rule fires and is
    // harmless.
    expect(
      shouldDropStreamBuffer({
        previousAgentTextCount: 0,
        agentTextCount: 3,
        jobStatus: "completed",
      }),
    ).toBe(true);
  });

  it("never resurrects a buffer: the drop decision does not depend on its contents", () => {
    // The function deliberately takes no `text`, so there is no input by which a
    // buffer could argue for its own survival. This test exists to pin that
    // shape — adding a text parameter would be the first step towards a
    // text-matching rule, which is the fragile design this avoids.
    expect(shouldDropStreamBuffer.length).toBe(1);
  });
});
