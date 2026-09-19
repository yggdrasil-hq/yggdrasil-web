/**
 * Finds form controls that no assistive technology can name.
 *
 * **Why a scanner in the repo rather than a one-off sweep.** Issue #67 exists
 * because a previous accessibility pass measured *default-rendered state*:
 * every dialog, inline form and conditional field went unchecked, and seventeen
 * unlabelled controls survived a sweep that reported the app clean. Fixing those
 * seventeen fixes today; this makes the eighteenth fail a test instead of
 * shipping.
 *
 * It is deliberately a source scan rather than a rendered-DOM test. This repo
 * runs vitest in a `node` environment with no React testing library (a
 * deliberate constraint, see `test-runs.ts`), and a rendered-DOM audit would only
 * ever see whatever state the test happened to render — the exact blind spot
 * that caused this issue. A source scan sees every branch, including the ones
 * no test renders.
 *
 * **What counts as named.** Any of:
 *   - `aria-label` / `aria-labelledby` on the control;
 *   - an `id` paired with a matching `htmlFor` anywhere in the same file (the
 *     id and its label are frequently in different JSX blocks, so the pairing is
 *     checked file-wide rather than structurally);
 *   - being enclosed in a `<label>` element.
 *
 * A `placeholder` explicitly does **not** count. It is a hint that disappears as
 * soon as the user types, which is precisely the mistake all seventeen had made.
 *
 * **Comments are not scanned for controls (issue #83).** A tag written in prose is
 * not a control, and reporting it trained readers to distrust the guard — a doc
 * comment containing `<input type="radio">` failed the check, and the message
 * quoted the comment back, so the first thing to do was look at the wrong place.
 *
 * The correction is a set of comment **offsets** from `source-comments.ts`, and it
 * deliberately does not rewrite the source: the text below is byte-for-byte what
 * is in the file, so no line can be shortened and no attribute can be cut off. A
 * match is skipped by *position*, which is the only way to do this without
 * risking a false negative on a safety check.
 */

import { commentRanges, isOffsetInRanges } from "./source-comments";

export interface SourceFile {
  path: string;
  source: string;
}

export interface UnlabelledControl {
  path: string;
  /** 1-based line of the opening tag. */
  line: number;
  /** The element name, e.g. `Input`. */
  element: string;
  /** The opening tag, whitespace-collapsed, for the failure message. */
  tag: string;
}

/**
 * The form controls worth checking. Both the local primitives (`Input`,
 * `Select`, `Textarea`) and the native elements, because a native `<select>`
 * with no label is the same defect and was the one a primitives-only scan missed
 * (the test-schedule picker).
 */
const CONTROL_TAG = /<(Input|Select|Textarea|input|select|textarea)\b/g;

/**
 * The index of the `>` closing a JSX opening tag.
 *
 * More than a character search: attribute values contain `>` (arrow functions,
 * comparisons), strings contain braces, and interpolation contains both. Reading
 * the tag as plain text reports a `>` inside `onChange={(e) => …}` as the end of
 * the element, which truncates it and hides the attributes that matter — the
 * first version of this scan did exactly that and missed eleven real findings.
 */
function findTagEnd(source: string, start: number): number {
  let index = start;
  let braceDepth = 0;

  while (index < source.length) {
    const char = source[index];

    if (braceDepth === 0 && (char === '"' || char === "'" || char === "`")) {
      const quote = char;
      index += 1;
      while (index < source.length && source[index] !== quote) {
        index += source[index] === "\\" ? 2 : 1;
      }
      index += 1;
      continue;
    }

    if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth -= 1;
    else if (char === ">" && braceDepth === 0) {
      // `=>` is not the end of a tag.
      if (source[index - 1] === "=") {
        index += 1;
        continue;
      }
      return index;
    }

    index += 1;
  }

  return source.length;
}

/** Line number (1-based) of an offset. */
function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

/** True when the control sits inside a `<label>` that has not yet closed. */
function insideLabel(source: string, offset: number): boolean {
  const openTag = source.lastIndexOf("<label", offset);
  if (openTag === -1) return false;
  return source.indexOf("</label>", openTag) === -1 || source.indexOf("</label>", openTag) > offset;
}

/**
 * Every control in these files with no accessible name.
 *
 * `components/ui/` is excluded: those are the primitives themselves, and a label
 * belongs at the call site rather than inside `Input`. (`error-message.tsx` and
 * `alert.tsx` are not controls; `select.tsx` wraps a native `<select>` whose name
 * the caller supplies.)
 */
export function findUnlabelledControls(files: SourceFile[]): UnlabelledControl[] {
  const found: UnlabelledControl[] = [];

  for (const file of files) {
    if (file.path.startsWith("components/ui/")) continue;

    const { source } = file;
    // Computed once per file, not per match: it needs a parse, and the scan below
    // is the only consumer.
    const comments = commentRanges(source, file.path);

    CONTROL_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = CONTROL_TAG.exec(source)) !== null) {
      // A `<input` inside a comment is prose about a control, not a control. The
      // offset test is what keeps this from being a text rewrite — see the module
      // doc above and `source-comments.ts` for why that distinction matters.
      if (isOffsetInRanges(comments, match.index)) continue;

      const end = findTagEnd(source, match.index);
      const tag = source.slice(match.index, end + 1);

      if (tag.includes("aria-label") || tag.includes("aria-labelledby")) continue;

      const id = /\bid="([^"]+)"/.exec(tag);
      if (id && source.includes(`htmlFor="${id[1]}"`)) continue;

      if (insideLabel(source, match.index)) continue;

      found.push({
        path: file.path,
        line: lineOf(source, match.index),
        element: match[1],
        tag: tag.replace(/\s+/g, " ").slice(0, 120),
      });
    }
  }

  return found;
}
