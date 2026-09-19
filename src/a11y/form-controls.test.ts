import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findUnlabelledControls,
  type SourceFile,
} from "@/lib/a11y/form-controls";
import {
  commentRanges,
  scannerCommentClaims,
} from "@/lib/a11y/source-comments";

/**
 * Issue #67: seventeen form controls had no accessible name, and a previous
 * sweep missed all of them because it only rendered default state.
 *
 * This test is the part that outlives the fix. It scans every component's source
 * — so it sees the dialogs, the inline forms and the conditional fields the
 * sweep could not — and fails when a control is added without a name.
 */

const root = process.cwd();

function componentSources(): SourceFile[] {
  const files: SourceFile[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith(".tsx")) continue;
      files.push({
        path: relative(root, full),
        source: readFileSync(full, "utf8"),
      });
    }
  }

  walk(join(root, "components"));
  walk(join(root, "app"));
  return files;
}

describe("findUnlabelledControls", () => {
  const scan = (source: string, path = "components/x.tsx") =>
    findUnlabelledControls([{ path, source }]);

  it("flags a control whose only hint is a placeholder", () => {
    // The exact shape all seventeen had: a placeholder is a hint, not a name.
    const found = scan('<Input value={x} placeholder="Owner" />');
    expect(found).toHaveLength(1);
    expect(found[0].element).toBe("Input");
  });

  it("flags a control with no label of any kind", () => {
    expect(scan('<select value={v} onChange={onChange}>')).toHaveLength(1);
  });

  it("accepts an aria-label", () => {
    expect(scan('<Input aria-label="Repository owner" placeholder="Owner" />')).toHaveLength(0);
  });

  it("accepts an aria-labelledby", () => {
    expect(scan('<Input aria-labelledby="owner-label" />')).toHaveLength(0);
  });

  it("accepts an id paired with a matching htmlFor elsewhere in the file", () => {
    const source = `
      <label htmlFor="cron">Schedule</label>
      <Input id="cron" />
    `;
    expect(scan(source)).toHaveLength(0);
  });

  it("still flags an id with no matching htmlFor", () => {
    // The free-text model field carried an id and no label pointed at it, which
    // reads as labelled to a quick glance and is not.
    const found = scan('<Input id="feature-model-id-typed" placeholder="…or type a model ID" />');
    expect(found).toHaveLength(1);
  });

  it("accepts a control wrapped in a label element", () => {
    expect(scan("<label>Owner <Input /></label>")).toHaveLength(0);
  });

  it("reports the line number", () => {
    const found = scan('\n\n<Input placeholder="x" />');
    expect(found[0].line).toBe(3);
  });

  // The scanner's own first version stopped at the `>` inside `=>`, truncating
  // the tag and hiding the `aria-label` after it — it missed eleven real
  // findings. These three pin that.
  it("reads past an arrow function inside an attribute", () => {
    const source = `
      <Input
        onChange={(event) => setValue(event.target.value)}
        aria-label="Search repositories"
      />
    `;
    expect(scan(source)).toHaveLength(0);
  });

  it("reads past a `>` inside a nested JSX attribute", () => {
    const source = `
      <Select
        render={(x) => x > 1 ? <b>a</b> : null}
        aria-label="Threshold"
      />
    `;
    expect(scan(source)).toHaveLength(0);
  });

  it("does not treat a `=>` as the end of the tag", () => {
    const found = scan("<Input onChange={(e) => setX(e.target.value)} placeholder=\"x\" />");
    expect(found).toHaveLength(1);
    // The whole tag is reported, so the failure message shows what to fix.
    expect(found[0].tag).toContain("onChange");
  });

  it("ignores the primitives themselves", () => {
    expect(scan("<Input />", "components/ui/input.tsx")).toHaveLength(0);
  });
});

describe("the repo's own controls (#67)", () => {
  const files = componentSources();

  it("scans a realistic number of component files", () => {
    // A guard against the scan silently finding nothing (wrong cwd, wrong glob)
    // and passing for that reason instead of because the app is clean.
    expect(files.length).toBeGreaterThan(40);
  });

  it("has no form control without an accessible name", () => {
    const found = findUnlabelledControls(files);
    const described = found
      .map((c) => `  ${c.path}:${c.line}  <${c.element}>  ${c.tag}`)
      .join("\n");
    expect(
      found,
      found.length === 0
        ? ""
        : `Unlabelled form control(s) — add aria-label, or an id with a matching htmlFor:\n${described}`,
    ).toEqual([]);
  });
});

/*
 * Issue #83: the scan read comments as code, so a tag written in prose was
 * reported as a control. Its value is entirely in failing on *genuine* misses —
 * a guard that cries wolf on a doc comment teaches people to add a redundant
 * `aria-label` to silence it, and the next person to hit it works around the
 * check instead of trusting it.
 *
 * The fix is a set of comment *offsets* (`lib/a11y/source-comments.ts`), not a
 * rewrite of the source. That distinction is the whole safety argument, and the
 * last case here is why: a filter that rewrote or misread the text could hide a
 * real control, which on a safety check is far worse than a false positive.
 */
describe("comments are not scanned for controls (#83)", () => {
  const scan = (source: string, path = "components/x.tsx") =>
    findUnlabelledControls([{ path, source }]);

  it("does not report a tag written in a block comment (the reported case)", () => {
    const source = [
      "export function X() {",
      "  /**",
      '   * **Why a native `<input type="radio">`/`checkbox` rather than buttons.**',
      "   */",
      '  return <input type="radio" aria-label="ok" />;',
      "}",
    ].join("\n");

    // Before #83 this reported the comment on line 3 as an unlabelled input.
    expect(scan(source)).toEqual([]);
  });

  it("does not report a tag written in a line comment", () => {
    const source = ['// replaces an <input type="text" />', "const a = 1;"].join("\n");
    expect(scan(source)).toEqual([]);
  });

  it("does not report a tag written in a JSX comment container", () => {
    // `{/* … */}` is not an AST trivia gap, so a parsed-AST comment walk misses it
    // — which is why the ranges come from the scanner rather than from the tree.
    const source =
      'export const A = () => <div>{/* was <input type="radio" /> */}<input aria-label="x" /></div>;';
    expect(scan(source)).toEqual([]);
  });

  it("still reports a real unlabelled control that follows a comment", () => {
    // The fix must not have made the scan blind past a comment.
    const source = ["// a comment about <input />", 'export const A = () => <input type="text" />;'].join("\n");
    const found = scan(source);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it("still reports a real unlabelled control before a trailing comment", () => {
    const source = 'export const A = () => <input type="text" />; // <input aria-label="no" />';
    const found = scan(source);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(1);
  });

  it("still reports a control that follows a `//` inside a string literal", () => {
    // The truncation trap: a naive `//` strip would cut this line at the URL and
    // stop scanning, losing the control after it.
    const source = [
      'const url = "https://example.com";',
      'export const A = () => <input type="text" />;',
    ].join("\n");
    expect(scan(source)).toHaveLength(1);
  });

  /*
   * The case that makes the JSX-text correction load-bearing rather than
   * defensive. A `//` in JSX *text* is literal — but a bare lexical scan cannot
   * know that and claims the rest of the line, which here contains a genuinely
   * unlabelled control:
   *
   *   <p>see https://example.com</p><input type="text" />
   *       ^ scanner claims from here …………………………… to here
   *
   * This asserts both halves: that the raw scanner claim really does swallow the
   * control (so a scanner-only filter would hide it silently), and that
   * `commentRanges` does not. Deleting the JSX-text subtraction makes this fail.
   */
  it("does not let a URL in JSX text hide the control after it", () => {
    const source =
      'export const A = () => <div><p>see https://example.com</p><input type="text" /></div>;';
    const controlOffset = source.indexOf("<input");

    const rawClaim = scannerCommentClaims(source).find(
      (range) => controlOffset >= range.start && controlOffset < range.end,
    );
    expect(rawClaim, "expected the raw scanner to claim the control — see the comment").toBeDefined();

    const corrected = commentRanges(source).find(
      (range) => controlOffset >= range.start && controlOffset < range.end,
    );
    expect(corrected).toBeUndefined();

    // And end to end: the control is reported.
    expect(scan(source)).toHaveLength(1);
  });
});
