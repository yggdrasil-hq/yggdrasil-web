"use client";

/**
 * An inline error message that a screen reader actually announces.
 *
 * **Why this exists.** The app surfaces almost all of its failures as an inline
 * `<p>` — "Unable to save secret.", "Failed to load…", "Provider responded with
 * 401" — and before this component **not one of them was a live region**. There
 * was exactly one `role="alert"` in the whole repo, on `components/ui/alert.tsx`,
 * and the forty-odd error paragraphs did not use it. So a sighted user saw the
 * message appear and a screen-reader user heard nothing: the button they pressed
 * simply did not respond (issue #67).
 *
 * **Why `role="alert"` rather than `aria-live="polite"`.** Two reasons, and the
 * second is the technical one:
 *
 * 1. Every use is *feedback to an action the user just took* — a save that
 *    failed, a load that errored. That is the case an interrupt is for.
 * 2. These are rendered conditionally (`{error ? <p …/> : null}`), so the region
 *    is **created together with its content**. Screen readers announce reliably
 *    when content is added to an *existing* live region; a region that appears
 *    already populated is unreliable for `aria-live` and announced for
 *    `role="alert"`. Using polite here would be the more "polite" choice and the
 *    one that silently does nothing — which is the bug being fixed.
 *
 * **Why the caller passes the whole className.** The visual style differs
 * legitimately per site (`text-xs` beside a provider field, `text-sm` under a
 * form) and some sites use `text-red-400` rather than `text-destructive`. Adding
 * a second colour class here would leave Tailwind two conflicting declarations
 * whose winner is decided by stylesheet order, not by anything the author
 * controls — so when a caller passes a className it is the *only* source of
 * visual classes, and the default applies only when none is given.
 */

interface ErrorMessageProps {
  children: React.ReactNode;
  /** Replaces the default styling entirely rather than merging with it — see above. */
  className?: string;
}

export function ErrorMessage({ children, className }: ErrorMessageProps) {
  if (!children) return null;
  return (
    <p role="alert" className={className ?? "text-sm text-destructive"}>
      {children}
    </p>
  );
}
