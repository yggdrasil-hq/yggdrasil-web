import type { FeatureEvent } from "./types";

/**
 * Issue #38: a grill question the agent asked as a *choice* rather than as prose.
 *
 * Same split as the rest of this directory — the component renders, the decisions
 * live here, because this repo's vitest is a `node` environment with no React
 * testing library.
 *
 * **Two modes coexist, deliberately.** The agent still asks open-ended questions
 * as prose ("what problem does this solve?"), and those must render exactly as
 * they do today. So the question of *which* mode a message is is a decision this
 * module makes, and getting it wrong in either direction is a visible bug: a
 * control with nothing to choose, or a wall of text where a picker was asked for.
 */

/** One choice, as the API sends it. */
export interface GrillQuestionOption {
  label: string;
  description: string | null;
}

/** A question that can be answered by picking. */
export interface GrillQuestionView {
  /** Short label for the question, e.g. "Database". Null when the agent omitted it. */
  header: string | null;
  /** The question itself. Never empty — see `askUserQuestionFor`. */
  question: string;
  /** `false` → single choice (radio); `true` → multiple (checkbox). */
  multiSelect: boolean;
  options: GrillQuestionOption[];
}

/**
 * A structured question, or null when this event should render as prose.
 *
 * Four things it has to get right, and each is a distinct case rather than a
 * variation on one:
 *
 * 1. **Not an `ask_user`** → null. Every other event type has its own bubble.
 * 2. **No `questionForm`** → null. This is both the pre-#38 state of every stored
 *    row and the current state of an open-ended question, and the API's own type
 *    says so: *"Null on the containing event means the question is prose — which
 *    is both the pre-#38 state of every row and the current state of an open-ended
 *    question."* An older transcript must keep rendering as text.
 * 3. **A form with no options** → null, and this one is defensive rather than
 *    compensating for a gap — see below.
 * 4. **A form with no question text and no header** → null. A control with nothing
 *    above it is unanswerable: the options would be a picker for an unstated
 *    question.
 *
 * **Why (3) is handled even though the API already prevents it.** The API
 * rejects an empty `options` array outright — `superRefine` in
 * `jobs/internal-routes.ts`: *"A question with options must offer at least one"* —
 * so nothing it accepts can carry one, and nothing it writes can contain one.
 *
 * The branch stays anyway, for two reasons that have nothing to do with the API:
 * it is one line, and the failure it prevents is a bad one — a picker with no
 * choices and a Submit that can never enable is a dead end that *looks* like a
 * loaded state, which is worse than prose. It also means a row from any other
 * producer (an older install, a hand-written fixture) degrades to a readable
 * question rather than an unsatisfiable control.
 *
 * **Correction, because the previous note here was wrong.** It claimed the API's
 * schema had `.max(20)` and no `.min(1)`, "so nothing rejects it upstream either",
 * and called this case reachable rather than defensive. That is false: the guard
 * is a `superRefine` rather than an array modifier, and reading the field
 * definition instead of the whole schema is exactly what hid it. It is corrected
 * rather than deleted because a confident wrong claim *about another repo* is
 * worse than no claim — it invites someone to "fix" an API that is already
 * correct, or to treat the client as the validation boundary.
 *
 * The distinction is still asserted in the tests: "no structured question" and "a
 * structured question with nothing to pick" are different states that reach the
 * same decision, and the assertion is that neither throws nor half-builds a view.
 */
export function askUserQuestionFor(event: FeatureEvent): GrillQuestionView | null {
  if (event.type !== "ask_user") return null;

  const form = event.questionForm;
  if (!form) return null;
  if (form.options.length === 0) return null;

  const question = event.question?.trim() || form.header?.trim() || "";
  if (!question) return null;

  return {
    // `?? null` rather than `|| null`: an empty-string header is a header the
    // agent deliberately left blank, and normalising it to null keeps the
    // component's "is there a heading to render" check to one question.
    header: form.header?.trim() || null,
    question,
    multiSelect: form.multiSelect,
    options: form.options,
  };
}

/**
 * Whether the question at `index` has already been answered.
 *
 * **Why this exists (issue #38's "resume/replay" note):** *"a question whose
 * answer is already recorded must not be re-asked, and a restarted run must see
 * the prior answers."* Without this a re-opened conversation — or a live one,
 * sitting behind a completed answer — renders an empty picker as if nothing had
 * happened, inviting the user to answer a second time.
 *
 * The answer arrives as an ordinary `user_message`, because that is what the
 * reply path produces (ADR 006): the selection is prose on the wire. So the test
 * is positional — **a `user_message` after this event and before the next
 * `ask_user`**. Bounding it at the next `ask_user` matters: without that bound,
 * one reply would mark every later question answered.
 *
 * Deliberately not "the run is no longer awaiting input": that is a property of
 * the *job*, and it would mark a whole transcript's worth of questions answered
 * the moment the agent moved on — including one it asked and never got an answer
 * to. Positional is what the transcript actually records.
 */
export function isQuestionAnswered(events: FeatureEvent[], index: number): boolean {
  for (let cursor = index + 1; cursor < events.length; cursor += 1) {
    const type = events[cursor]?.type;
    if (type === "ask_user") return false;
    if (type === "user_message") return true;
  }
  return false;
}

/** What the user answered a question with, as recorded in the transcript. */
export function recordedAnswerFor(
  events: FeatureEvent[],
  index: number,
): string | null {
  for (let cursor = index + 1; cursor < events.length; cursor += 1) {
    const event = events[cursor];
    if (event?.type === "ask_user") return null;
    if (event?.type === "user_message") return event.message ?? "";
  }
  return null;
}

/**
 * The reply a selection sends, in the shape the *agent* receives.
 *
 * **The wire format is prose**, because the answer rides the existing mid-run
 * reply path (ADR 006) as a `user_message` — there is no structured answer
 * channel, and inventing one is out of this issue's scope. So the shape here is a
 * decision about how a choice reads back to a model, not about serialisation.
 *
 * - **Single choice** → the label alone. One line, exactly what was picked.
 * - **Multiple choice** → one label per line, **newline-separated rather than
 *   comma-separated**.
 *
 * The separator is the part worth justifying. Labels are authored by the agent,
 * so they can contain commas — "Yes, and add tests" is a perfectly ordinary
 * label — and `"Yes, and add tests, No"` is then ambiguous about whether that is
 * two answers or one. Newlines cannot appear in a label (they would break the
 * option's own rendering), so a newline-separated list is unambiguous, and a list
 * in a chat reply reads as a list. Same convention the reviewer's findings use:
 * one entry per line.
 *
 * Labels are trimmed and empties dropped, so a selection built from an
 * already-trimmed control cannot send `"\n\n"` as an answer.
 */
export function formatQuestionAnswer(labels: string[]): string {
  return labels
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .join("\n");
}

/**
 * How the chosen options read back in the transcript.
 *
 * Distinct from `formatQuestionAnswer` on purpose, because the two audiences
 * differ: the agent gets a list to parse, a human gets a sentence to scan. The
 * transcript already renders the reply as a normal user bubble, so this exists
 * only for the *card's* answered state — which shows what was picked beside the
 * question, the way a form shows its submitted value.
 *
 * A multi-select answer is joined with ", " here (readability for a human, and
 * the ambiguity above only matters to the parser).
 */
export function describeAnswerForDisplay(labels: string[]): string {
  const cleaned = labels.map((label) => label.trim()).filter((label) => label.length > 0);
  return cleaned.join(", ");
}

/**
 * Whether the control should be *interactive* for a question.
 *
 * Mirrors `canReplyToGrill` rather than re-deriving it, and that is the point:
 * the control submits through the same reply path the composer uses, so if the
 * composer would refuse, the control must not accept either. A control that
 * accepted an answer the API would reject is worse than a read-only one — the
 * user would have pressed Submit and lost the selection.
 *
 * The consequence worth stating: whenever this is true, the page's free-text
 * composer is on screen too. That is what makes the composer the escape hatch for
 * an answer that is not among the options — see `ESCAPE_HATCH_HINT`.
 */
export function isQuestionInteractive(input: {
  awaitingUserInput: boolean;
  jobStatus: string | null;
}): boolean {
  return input.awaitingUserInput && input.jobStatus === "running";
}

/**
 * Where a user goes when none of the options is their answer.
 *
 * **The decision the issue asked for: the options are authoritative within the
 * card, and the existing composer is the escape hatch** — rather than appending a
 * synthetic "Other…" pseudo-option with a revealed text field.
 *
 * Why that way round:
 *
 * - The composer is **already on screen** at exactly the moment the control is
 *   interactive. Both are gated on the same predicate (`awaitingUserInput` while
 *   the job is running), so there is no state where the control accepts an answer
 *   and the free-text path is missing. That is a structural guarantee, not a
 *   convention — see `isQuestionInteractive`.
 * - An "Other…" option would be a second mechanism for a need the first one
 *   already covers, and it would have to decide things the composer does not: is
 *   it exclusive in a multi-select? does it count toward the answer? does its
 *   text replace or append? Each is a small product decision with no clear right
 *   answer, which is the sign that the simpler shape is the better one.
 * - The issue is explicit that this is *"not a replacement for prose"*, and a
 *   card that owns the free-text case starts to look like one.
 *
 * The cost is discoverability — a user looking at radio buttons may not think to
 * look below them — so the card says this out loud instead of relying on the user
 * noticing. That sentence is this constant.
 */
export const ESCAPE_HATCH_HINT = "None of these? Type your answer in the box below.";

/**
 * The empty-selection message, or null when a selection is complete enough to
 * send. Used to keep Submit disabled with an explanation rather than silently
 * inert — the same posture the rest of this app takes with disabled controls.
 */
export function selectionIncompleteReason(selectedCount: number): string | null {
  if (selectedCount > 0) return null;
  return "Pick an option to answer.";
}
