import ts from "typescript";

/**
 * Where the real comments are in a source file, for scanners that read raw text.
 *
 * **Why this exists.** `form-controls.ts` finds unlabelled form controls by
 * scanning raw source, which is what lets it see every branch rather than only
 * whatever a test rendered (#67). But raw source includes comments, so a tag
 * written in prose is read as a control — issue #83, where a doc comment
 * containing `<input type="radio">` was reported as an unlabelled input and the
 * failure message quoted the comment back at the reader.
 *
 * **The tempting fix is the dangerous one.** Stripping comments from the source
 * before scanning turns a false positive into a potential false *negative*: a naive
 * `//` strip truncates the line at the first `//` in a URL, and everything
 * after it stops being scanned. On a safety check, missing a real defect is far
 * worse than reporting a fake one, so this module never rewrites the source.
 * Instead it reports **offsets**, and callers skip matches by position — the text
 * they scan is byte-for-byte what is in the file.
 *
 * **Two passes, and the second is what makes it safe.** A scanner alone
 * mis-classifies one construct: `//` inside *JSX text* is literal text, not a
 * comment, but a bare lexical scan cannot know that and claims the rest of the
 * line is a comment. That is not a cosmetic error — it is a way to hide a real
 * control:
 *
 * ```
 * <p>see https://example.com</p><input type="text" />
 * //  ^ the scanner claims from here …………………… to here
 * ```
 *
 * and the unlabelled `<input>` sits inside the claim, so a scanner-only filter
 * would drop it silently. The parser knows which regions are JSX text, so range
 * claims that *start* inside one are discarded. A real comment can never start
 * inside JSX text — that region is literal by definition — so this subtraction can
 * only ever remove a false claim, never a true one.
 *
 * **The safety argument, stated plainly.** A genuine finding can only be hidden by
 * classifying code as a comment. The scanner is exact for every construct except
 * JSX text (verified against the repo's own 136 `.tsx` files: 273 claims, none
 * starting inside JSX text, and it correctly ignores `//` in string literals,
 * regexes and JSX attribute values). JSX text contains no code, so removing claims
 * that start there cannot hide code. Everything left is a real comment. Therefore
 * this cannot hide a real control.
 *
 * **It is complete in the other direction too**, which a parsed-AST approach was
 * not: comments are not AST nodes, so trivia-gap walking misses a comment inside an
 * empty JSX expression container. The scanner finds those.
 *
 * Uses TypeScript itself, which is already a devDependency for `tsc --noEmit`.
 * This module is reached only from tests — nothing in `components/` or `app/`
 * imports it, so it is not in the app bundle.
 */

/** A half-open `[start, end)` offset range. */
export interface OffsetRange {
  start: number;
  end: number;
}

/**
 * Every comment in `source`, as offsets into it.
 *
 * `fileName` only picks the parse flavour: `.tsx` is parsed as TSX so that JSX
 * text is recognised, anything else as ordinary TypeScript.
 */
export function commentRanges(source: string, fileName = "file.tsx"): OffsetRange[] {
  const jsx = fileName.endsWith(".tsx");
  const claims = scannerCommentClaims(source, jsx);
  if (claims.length === 0) return [];

  const jsxText = jsxTextRanges(source);

  return claims.filter((claim) => !jsxText.some((region) => contains(region, claim.start)));
}

/**
 * The lexical scanner's comment claims, before the JSX-text correction.
 *
 * Exported because the correction is the interesting part and a test should be
 * able to show what it is correcting — including that the raw claim *does* swallow
 * a real control, which is the argument for the second pass existing at all.
 */
export function scannerCommentClaims(source: string, jsx = true): OffsetRange[] {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source,
  );

  const ranges: OffsetRange[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      ranges.push({ start: scanner.getTokenPos(), end: scanner.getTextPos() });
    }
  }
  return ranges;
}

/** The offset ranges occupied by JSX text, where `//` is literal. */
function jsxTextRanges(source: string): OffsetRange[] {
  const file = ts.createSourceFile(
    "scan.tsx",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const ranges: OffsetRange[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      ranges.push({ start: node.getStart(file), end: node.getEnd() });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return ranges;
}

function contains(outer: OffsetRange, offset: number): boolean {
  return offset >= outer.start && offset < outer.end;
}

/** Whether `offset` falls inside one of these ranges. */
export function isOffsetInRanges(ranges: OffsetRange[], offset: number): boolean {
  // Linear is fine: a component file has tens of comments and the scan runs once.
  return ranges.some((range) => contains(range, offset));
}
