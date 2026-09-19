import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_HINT,
  askUserQuestionFor,
  describeAnswerForDisplay,
  formatQuestionAnswer,
  isQuestionAnswered,
  isQuestionInteractive,
  recordedAnswerFor,
  selectionIncompleteReason,
} from "@/lib/features/grill-question";
import type { FeatureEvent } from "@/lib/features/types";

/**
 * Issue #38: which messages render as a selector, and what a selection sends.
 *
 * **The contract this must not break.** The agent still asks open-ended questions
 * as prose, and every question ever asked before #38 is prose — so most of what
 * this module does is decide when *not* to render a control. A regression here is
 * either a picker with nothing to pick or a wall of text where a form was asked
 * for, and both are visible to a user.
 */

function event(overrides: Partial<FeatureEvent> = {}): FeatureEvent {
  return {
    id: "ev_1",
    type: "ask_user",
    question: "Which database should the API use?",
    markdown: null,
    message: null,
    status: null,
    prUrl: null,
    summary: null,
    snapshot: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

function form(overrides: Partial<NonNullable<FeatureEvent["questionForm"]>> = {}) {
  return {
    header: "Database",
    multiSelect: false,
    options: [
      { label: "PostgreSQL", description: "Matches the existing API stack" },
      { label: "SQLite", description: "Simplest for local development" },
    ],
    ...overrides,
  };
}

describe("askUserQuestionFor", () => {
  it("returns the question when the event carries a structured form", () => {
    const view = askUserQuestionFor(event({ questionForm: form() }));

    expect(view).toEqual({
      header: "Database",
      question: "Which database should the API use?",
      multiSelect: false,
      options: [
        { label: "PostgreSQL", description: "Matches the existing API stack" },
        { label: "SQLite", description: "Simplest for local development" },
      ],
    });
  });

  it("carries multiSelect through as asked", () => {
    expect(
      askUserQuestionFor(event({ questionForm: form({ multiSelect: true }) }))?.multiSelect,
    ).toBe(true);
  });

  /*
   * The prose path. This is the compatibility case, and it is the one to keep
   * passing: `questionForm: null` is both the state of every row written before
   * #38 and the state of an open-ended question today.
   */
  it("returns null for a question with no form — the prose path", () => {
    expect(askUserQuestionFor(event({ questionForm: null }))).toBeNull();
  });

  it("returns null when the field is absent rather than null", () => {
    // A response from a component that does not send the field yet omits the key
    // entirely, which is a different spelling of absent and must behave the same.
    const withoutField = event();
    delete withoutField.questionForm;
    expect(askUserQuestionFor(withoutField)).toBeNull();
  });

  it("returns null for every other event type", () => {
    for (const type of ["agent_text", "user_message", "submit_adr", "run_failed"] as const) {
      expect(askUserQuestionFor(event({ type, questionForm: form() })), type).toBeNull();
    }
  });

  /*
   * The case the coordinator flagged, and it is reachable rather than defensive:
   * the API builds the form from `parsed.data.options ? … : null`, and an empty
   * array is *truthy* in JavaScript — so `options: []` arrives as a form with
   * nothing in it, and the API's schema constrains options with `.max(20)` and no
   * `.min(1)`, so nothing rejects it upstream either.
   *
   * A control here is a dead end: a picker with no choices and a Submit that can
   * never enable. Prose at least keeps the question readable.
   */
  it("returns null for a form with no options, rather than a dead control", () => {
    expect(askUserQuestionFor(event({ questionForm: form({ options: [] }) }))).toBeNull();
  });

  it("distinguishes 'no structured question' from 'nothing to pick'", () => {
    // Both render as prose, but they are different states — the assertion is that
    // the empty-options case reaches the same *decision* rather than throwing or
    // producing a half-built view.
    const noForm = askUserQuestionFor(event({ questionForm: null }));
    const noOptions = askUserQuestionFor(event({ questionForm: form({ options: [] }) }));
    expect(noForm).toBeNull();
    expect(noOptions).toBeNull();
  });

  it("falls back to the header when the question text is missing", () => {
    // The API keeps the question text and the form in separate fields, so a form
    // without text is possible; the header is the honest thing to show above the
    // options rather than an empty heading.
    const view = askUserQuestionFor(event({ question: null, questionForm: form() }));
    expect(view?.question).toBe("Database");
  });

  it("returns null when there is neither question text nor a header", () => {
    // Options with no question above them are unanswerable — a picker for an
    // unstated question.
    expect(
      askUserQuestionFor(event({ question: null, questionForm: form({ header: null }) })),
    ).toBeNull();
  });

  it("normalises a blank header to null", () => {
    // So the card's "is there a heading" check is one question, not two.
    const view = askUserQuestionFor(event({ questionForm: form({ header: "   " }) }));
    expect(view?.header).toBeNull();
  });

  it("tolerates an option with no description", () => {
    const view = askUserQuestionFor(
      event({
        questionForm: form({ options: [{ label: "PostgreSQL", description: null }] }),
      }),
    );
    expect(view?.options).toEqual([{ label: "PostgreSQL", description: null }]);
  });
});

/*
 * Issue #38's resume/replay note: "a question whose answer is already recorded
 * must not be re-asked". Without these, reopening a conversation renders an empty
 * picker as if nothing had happened.
 */
describe("isQuestionAnswered", () => {
  const asked = event({ id: "q1" });
  const answered = event({ id: "a1", type: "user_message", message: "PostgreSQL" });

  it("is true when a reply follows the question", () => {
    expect(isQuestionAnswered([asked, answered], 0)).toBe(true);
  });

  it("is false while the question is still open", () => {
    expect(isQuestionAnswered([asked], 0)).toBe(false);
  });

  it("is false when the reply precedes the question", () => {
    // A reply to an earlier turn must not mark this one answered.
    expect(isQuestionAnswered([answered, asked], 1)).toBe(false);
  });

  /*
   * The bound that makes this correct. Two questions with one answer between them
   * means the second is unanswered — without stopping at the next `ask_user`, a
   * single reply would mark the whole rest of the transcript answered.
   */
  it("stops at the next question, so one reply cannot answer several", () => {
    const second = event({ id: "q2" });
    expect(isQuestionAnswered([asked, answered, second], 2)).toBe(false);
  });

  it("handles a second question that is itself answered", () => {
    const second = event({ id: "q2" });
    const secondAnswer = event({ id: "a2", type: "user_message", message: "SQLite" });
    expect(isQuestionAnswered([asked, answered, second, secondAnswer], 2)).toBe(true);
  });

  it("is not confused by unrelated events in between", () => {
    const chatter = event({ id: "t1", type: "agent_text", message: "thinking…" });
    expect(isQuestionAnswered([asked, chatter, answered], 0)).toBe(true);
  });
});

describe("recordedAnswerFor", () => {
  it("returns the reply text", () => {
    const answered = event({ id: "a1", type: "user_message", message: "PostgreSQL" });
    expect(recordedAnswerFor([event({ id: "q" }), answered], 0)).toBe("PostgreSQL");
  });

  it("returns the multi-select answer as the one string that was sent", () => {
    // Newline-separated on the wire; the card splits it for display.
    const answered = event({
      id: "a1",
      type: "user_message",
      message: "PostgreSQL\nSQLite",
    });
    expect(recordedAnswerFor([event({ id: "q" }), answered], 0)).toBe("PostgreSQL\nSQLite");
  });

  it("returns null when nothing follows", () => {
    expect(recordedAnswerFor([event({ id: "q" })], 0)).toBeNull();
  });
});

/*
 * The wire format. The answer rides ADR 006's reply path as a `user_message`, so
 * this is prose the model parses — which is what makes the separator a decision
 * rather than a detail.
 */
describe("formatQuestionAnswer", () => {
  it("sends a single choice as the label alone", () => {
    expect(formatQuestionAnswer(["PostgreSQL"])).toBe("PostgreSQL");
  });

  it("separates a multi-select answer with newlines, not commas", () => {
    // Labels are agent-authored and may contain commas — "Yes, and add tests" is
    // an ordinary label — so a comma-joined list is ambiguous about whether it is
    // one answer or two. A newline cannot appear inside a label.
    expect(formatQuestionAnswer(["Yes, and add tests", "No"])).toBe(
      "Yes, and add tests\nNo",
    );
  });

  it("trims and drops empty entries", () => {
    expect(formatQuestionAnswer(["  PostgreSQL  ", "", "   "])).toBe("PostgreSQL");
  });

  it("returns an empty string for no selection", () => {
    // The caller refuses to send this — asserted separately — but it must not
    // fabricate content either.
    expect(formatQuestionAnswer([])).toBe("");
  });
});

describe("describeAnswerForDisplay", () => {
  it("joins a multi-select answer with commas for a human", () => {
    // The transcript bubble keeps the newline form; this is only the card's own
    // answered state, where a comma list is what a form would show.
    expect(describeAnswerForDisplay(["PostgreSQL", "SQLite"])).toBe("PostgreSQL, SQLite");
  });

  it("returns a single label unchanged", () => {
    expect(describeAnswerForDisplay(["PostgreSQL"])).toBe("PostgreSQL");
  });
});

/*
 * The interaction gate. It mirrors `canReplyToGrill`, and the mirroring is the
 * point: the control submits through the same reply path the composer uses, so a
 * control that accepted an answer the API would refuse would lose the user's
 * selection after they pressed Submit.
 */
describe("isQuestionInteractive", () => {
  it("is true only while the agent is waiting and the run is going", () => {
    expect(isQuestionInteractive({ awaitingUserInput: true, jobStatus: "running" })).toBe(
      true,
    );
  });

  it("is false once the run is over, whatever the awaiting flag says", () => {
    for (const jobStatus of ["completed", "failed", "cancelled", null]) {
      expect(isQuestionInteractive({ awaitingUserInput: true, jobStatus }), String(jobStatus)).toBe(
        false,
      );
    }
  });

  it("is false while the agent is working without a pending question", () => {
    // Interactive here would offer a control the run is not listening for.
    expect(isQuestionInteractive({ awaitingUserInput: false, jobStatus: "running" })).toBe(
      false,
    );
  });
});

describe("selectionIncompleteReason", () => {
  it("explains why Submit is disabled rather than being silently inert", () => {
    expect(selectionIncompleteReason(0)).toContain("Pick an option");
  });

  it("has nothing to say once something is selected", () => {
    expect(selectionIncompleteReason(1)).toBeNull();
    expect(selectionIncompleteReason(3)).toBeNull();
  });
});

describe("ESCAPE_HATCH_HINT", () => {
  it("points at the composer, which is the escape hatch rather than an Other option", () => {
    // The decision the issue asked for. The composer is on screen exactly when the
    // control is interactive, so the card can point at it instead of growing a
    // second free-text mechanism of its own.
    expect(ESCAPE_HATCH_HINT).toMatch(/below/i);
    expect(ESCAPE_HATCH_HINT.toLowerCase()).toContain("none of these");
  });
});
