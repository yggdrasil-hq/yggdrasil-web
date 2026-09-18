import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findUnlabelledControls,
  type SourceFile,
} from "@/lib/a11y/form-controls";

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
