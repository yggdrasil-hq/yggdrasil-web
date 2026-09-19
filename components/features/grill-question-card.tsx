"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { Markdown } from "@/components/markdown";
import {
  ESCAPE_HATCH_HINT,
  describeAnswerForDisplay,
  selectionIncompleteReason,
  type GrillQuestionView,
} from "@/lib/features/grill-question";
import { cn } from "@/lib/utils";

interface GrillQuestionCardProps {
  question: GrillQuestionView;
  /**
   * What was answered, as a raw reply string (newline-separated for a
   * multi-select). Null while the question is unanswered.
   */
  answer: string | null;
  /**
   * Whether the control may submit. False renders the question read-only instead
   * of offering a control that cannot be used — see `isQuestionInteractive`.
   */
  interactive: boolean;
  submitting: boolean;
  error?: string | null;
  onAnswer: (labels: string[]) => void | Promise<void>;
}

/**
 * Issue #38: a grill question rendered as a selector rather than a wall of text.
 *
 * Three states, and the two non-interactive ones are deliberately distinct:
 *
 * - **answered** — the question plus what was picked, read-only. This is what
 *   stops a reopened conversation re-asking (#38's resume note): the answer is in
 *   the transcript, so the card shows it instead of an empty picker.
 * - **answerable** — the control. Radio for a single choice, checkbox for
 *   multiple.
 * - **neither** — the question alone, no control. Reached when the job is no
 *   longer taking replies (it finished, failed, or the agent moved on without
 *   waiting). Showing a live-looking control there would invite a click that
 *   cannot go anywhere, which is the same false affordance #74 removed from the
 *   Agentic Review panel.
 *
 * **Why native `<input type="radio">`/`checkbox` inputs rather than buttons.** This
 * is a form: the browser's own keyboard behaviour, focus handling and screen-reader
 * announcement for a radio group are exactly what is wanted, and the ARIA
 * tab/toggle patterns the app uses elsewhere are for *filters* (which re-render
 * content) not for *choosing a value* (which is submitted). Reusing
 * `FilterToggleGroup` here would have claimed a filter's semantics for a form
 * control.
 *
 * `fieldset` + `aria-labelledby` rather than a `<legend>`: the question is
 * agent-authored markdown and renders as block content, which `<legend>` does not
 * legally contain. Pointing at the rendered question by id gives the group the
 * same accessible name without invalid markup.
 */
export function GrillQuestionCard({
  question,
  answer,
  interactive,
  submitting,
  error,
  onAnswer,
}: GrillQuestionCardProps) {
  const [selected, setSelected] = useState<string[]>([]);
  // Unique per card, because several questions can be on screen at once and radio
  // inputs only group by a shared `name`. Without this, picking an option in one
  // card would clear the selection in every other card on the page.
  const groupId = useId();
  const questionId = `${groupId}-question`;

  function toggle(label: string) {
    if (question.multiSelect) {
      setSelected((current) =>
        current.includes(label)
          ? current.filter((entry) => entry !== label)
          : [...current, label],
      );
      return;
    }
    // Single-select: replace, so a second click moves the choice rather than
    // accumulating — which is what makes radio semantics match the visual.
    setSelected([label]);
  }

  const incompleteReason = selectionIncompleteReason(selected.length);

  return (
    <div className="flex justify-start">
      <div className="w-[90%] max-w-3xl rounded-md border border-rime-soft bg-surface-02 p-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-xs font-medium text-shadow">
            {question.header ?? "Question"}
          </p>
          {/* Says the choice shape up front. A checkbox group whose header did not
              mention "select all that apply" is a common way to get a wrong answer. */}
          {question.multiSelect ? (
            <span className="text-xs text-shadow">· select all that apply</span>
          ) : null}
        </div>

        <div id={questionId} className="mt-1">
          <Markdown content={question.question} />
        </div>

        {answer !== null ? (
          <AnswerSummary answer={answer} />
        ) : !interactive ? (
          /*
           * No control, and no invented explanation: the question stays part of
           * the record. The composer's absence above already says the run is not
           * taking replies, and guessing *why* here would be a second, possibly
           * wrong account of the same state.
           */
          <p className="mt-2 text-xs text-shadow">
            {ESCAPE_ANSWER_UNAVAILABLE}
          </p>
        ) : (
          <fieldset className="mt-2" aria-labelledby={questionId}>
            <div className="space-y-1.5">
              {question.options.map((option) => {
                const checked = selected.includes(option.label);
                return (
                  <label
                    key={option.label}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors",
                      checked
                        ? "border-bifrost/50 bg-surface-03"
                        : "border-rime-soft hover:bg-surface-03/50",
                    )}
                  >
                    <input
                      type={question.multiSelect ? "checkbox" : "radio"}
                      // Radios group by `name`; checkboxes ignore it, but passing
                      // the same value keeps the two branches identical.
                      name={groupId}
                      value={option.label}
                      checked={checked}
                      disabled={submitting}
                      onChange={() => toggle(option.label)}
                      className="mt-0.5 size-4 shrink-0 rounded border-rime bg-surface-02"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-frost">{option.label}</span>
                      {option.description ? (
                        <span className="mt-0.5 block text-xs text-shadow">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                disabled={submitting || incompleteReason !== null}
                onClick={() => void onAnswer(selected)}
              >
                {submitting ? "Sending…" : "Send answer"}
              </Button>
              {/* Disabled-with-a-reason rather than silently inert. */}
              {incompleteReason ? (
                <span className="text-xs text-shadow">{incompleteReason}</span>
              ) : null}
            </div>

            <p className="mt-2 text-xs text-shadow">{ESCAPE_HATCH_HINT}</p>
          </fieldset>
        )}

        {error ? <ErrorMessage className="mt-2 text-xs text-red-400">{error}</ErrorMessage> : null}
      </div>
    </div>
  );
}

/**
 * What a run that can no longer be answered means, phrased so it does not claim
 * to know which reason applies.
 *
 * The card cannot tell a finished run from a failed one from a message the agent
 * asked and then moved past — all three reach here as "not interactive", and the
 * page already states the specific reason in its own banner when there is one.
 */
const ESCAPE_ANSWER_UNAVAILABLE =
  "This question is no longer awaiting an answer — it is kept here as part of the conversation record.";

/** The picked answer, shown in place of the control once the question is answered. */
function AnswerSummary({ answer }: { answer: string }) {
  const labels = answer.split("\n");
  const display = describeAnswerForDisplay(labels);
  return (
    <div className="mt-2 rounded-md border border-rime-soft bg-surface-03 px-3 py-2">
      <p className="text-xs font-medium text-shadow">Answered</p>
      <p className="mt-0.5 text-[13px] text-frost">
        {/* `display` rather than the raw string: the wire format is
            newline-separated so the agent can parse a list unambiguously, and a
            card showing a raw newline-joined string would render each label on
            its own line with no indication they are one answer. */}
        {display || answer}
      </p>
    </div>
  );
}
