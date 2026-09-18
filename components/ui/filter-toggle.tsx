"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A row of buttons where exactly one is selected.
 *
 * **Why this component exists.** Four surfaces had grown their own copy of this
 * markup — the Testing tab's All/Failed subview, Agentic Review's
 * Approved/Changes-requested, Manual Review's subviews, and the designs status
 * filters — and all four had the same defect: the selected option was conveyed
 * *only* by a CSS class (`border-bifrost` / `bg-surface-03`), so a screen reader
 * announced "All results, button" and "Failed only, button" with no way to tell
 * which was current. Four copies of a pattern is why the same bug existed four
 * times, so the fix is one component that cannot omit the state rather than four
 * inline patches (issue #67).
 *
 * **Why `aria-pressed` rather than `role="tab"`.** These look like tabs and
 * behave like filters: selecting one re-renders the content below, it does not
 * switch between sibling panels. The ARIA tab pattern brings obligations this
 * does not meet — a `tablist`, `aria-controls` pointing at real `tabpanel`s, and
 * arrow-key roving focus — and declaring a role you do not implement is worse for
 * an assistive-tech user than declaring an honest one. A toggle group with
 * `aria-pressed` is what this actually is: a set of buttons, one of which is
 * pressed.
 *
 * The group carries an `aria-label` because "All results, pressed" is ambiguous
 * without knowing what is being filtered, and the label is required rather than
 * optional so a caller cannot forget it — an unnamed group of buttons is the
 * same problem one level up.
 *
 * Plain arrow keys are also wired up, even though the tab pattern is not claimed:
 * filtering with the keyboard should not require tabbing through every option,
 * and Left/Right is what a user will try. That is a convenience, not a role
 * claim, which is why it does not come with `tabIndex` juggling.
 */

export type FilterToggleVariant = "underline" | "pill";

export interface FilterToggleOption<T extends string> {
  id: T;
  label: ReactNode;
}

interface FilterToggleGroupProps<T extends string> {
  /** What is being filtered, e.g. "Test result filter". Required — see above. */
  label: string;
  options: readonly FilterToggleOption<T>[];
  value: T;
  onChange: (id: T) => void;
  variant?: FilterToggleVariant;
  className?: string;
}

const containerClass: Record<FilterToggleVariant, string> = {
  underline: "flex gap-4 border-b border-rime-soft",
  pill: "flex flex-wrap items-center gap-2",
};

const buttonClass: Record<FilterToggleVariant, string> = {
  underline: "border-b-2 px-1 pb-2 text-[13px] font-medium transition-colors",
  pill: "rounded-full border px-3 py-1 text-xs transition-colors",
};

const selectedClass: Record<FilterToggleVariant, string> = {
  underline: "border-bifrost text-frost",
  pill: "border-rime bg-surface-03 text-frost",
};

const unselectedClass: Record<FilterToggleVariant, string> = {
  underline: "border-transparent text-mist hover:text-frost",
  pill: "border-rime-soft text-mist hover:bg-surface-02 hover:text-frost",
};

export function FilterToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = "underline",
  className,
}: FilterToggleGroupProps<T>) {
  /**
   * Left/Right moves between options, wrapping. A convenience for keyboard users
   * rather than part of the ARIA tab contract — see the note above — so focus
   * simply follows the selection.
   */
  function handleArrowKeys(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll("button");
    buttons?.[next]?.focus();
  }

  return (
    <div role="group" aria-label={label} className={cn(containerClass[variant], className)}>
      {options.map((option, index) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            // The piece the four hand-rolled copies were missing.
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => handleArrowKeys(event, index)}
            className={cn(
              buttonClass[variant],
              selected ? selectedClass[variant] : unselectedClass[variant],
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
