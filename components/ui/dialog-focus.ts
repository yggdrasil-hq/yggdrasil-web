"use client";

import { useCallback, useRef } from "react";

/**
 * Returns focus to whatever opened a controlled dialog when it closes.
 *
 * **Why this is needed at all.** Radix's `DialogContent` normally restores focus
 * to the trigger by itself, but that depends on the dialog being opened by a
 * `DialogTrigger`, which is what it looks at. Every dialog in this app is
 * *controlled* and opened by an ordinary `<Button onClick={…}>` instead — the
 * providers dialog also opens from a per-row "Update" button — so there is no
 * trigger for Radix to find. Measured in the browser rather than assumed:
 *
 *     open the Add-provider dialog  → focus lands inside it (correct)
 *     press Escape                  → focus is on <body>, not the button
 *
 * The consequence is a keyboard user losing their place: closing the dialog drops
 * them at the top of the page and they must tab back to where they were.
 *
 * **Why capture at the click, not on mount.** By the time `DialogContent` mounts,
 * focus is already moving into the dialog — Radix focuses its first focusable
 * child — so reading `document.activeElement` then would capture the dialog, not
 * the button. `remember` is therefore called from the click handler, before the
 * open state changes.
 *
 * **Why not `DialogTrigger asChild`.** It would work for the one-button dialogs,
 * but the providers dialog opens from an arbitrary row as well, and a list of
 * `DialogTrigger`s inside one `Dialog` is not a shape Radix supports cleanly. One
 * mechanism that covers both openings is worth more than the idiomatic form that
 * covers one.
 */
export function useDialogTriggerFocus() {
  const trigger = useRef<HTMLElement | null>(null);

  /** Call from the opening click, before setting the open state. */
  const remember = useCallback(() => {
    trigger.current = (document.activeElement as HTMLElement | null) ?? null;
  }, []);

  /**
   * Pass to `<DialogContent onCloseAutoFocus={…}>`. `preventDefault` stops Radix
   * doing its own (body-directed) restore first.
   */
  const restore = useCallback((event: Event) => {
    event.preventDefault();
    const element = trigger.current;
    // Guard the detached node: React may have replaced the button between open
    // and close, and focusing a node that is no longer in the document does
    // nothing — leaving the user on <body> again with no error to show for it.
    if (element && element.isConnected) element.focus();
  }, []);

  return { remember, restore };
}
