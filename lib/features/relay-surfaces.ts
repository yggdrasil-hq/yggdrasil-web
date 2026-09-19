import ts from "typescript";

/**
 * The relay-surface contract, read out of the source (issue #98).
 *
 * **The rule this checks.** A surface that subscribes to the live relay must
 * re-read when the relay becomes live, not only on its interval. That is what
 * makes the shared module's claim — "the page re-reads on connect, so the REST
 * read *is* the catch-up" (`live-relay.ts`) — true of every caller rather than
 * half of them, and it is not cosmetic: the socket's subscription is registered
 * server-side only once the `subscribe` frame has been authorised, and the hub
 * keeps no backlog, so events published between a surface's last read and that
 * registration reach nobody. Deferring the read to the interval leaves that window
 * open for up to `LIVE_SAFETY_POLL_INTERVAL_MS`.
 *
 * **Why a source scan rather than a rendered test.** This repo runs vitest in a
 * `node` environment with no React testing library, deliberately — so an effect's
 * dependency list is not observable at all from a test. A surface that stopped
 * depending on the live status would render identically in every state a test
 * could construct; only the *timing* of a refetch changes, and there is no clock
 * to assert against. The dependency list is the whole mechanism, so the source is
 * the only place the property exists. This is the same shape as the accessibility
 * scan in `lib/a11y/form-controls.ts` (issues #67/#83) and exists for the same
 * reason: the defect is invisible to anything that renders.
 *
 * **It uses the parser, not a text search, and that is what keeps it honest.**
 * Comments are trivia, not nodes, so a `useEffect` written in prose cannot be
 * reported as a real one — the trap #83 hit, where a doc comment containing
 * `<input type="radio">` failed the control scan. A text scan would also have to
 * match a dependency list's brackets by hand, which is exactly where a scanner
 * starts lying about what it found.
 *
 * **What it proves, and what it does not.** It proves that the effect which
 * schedules the relay's interval also performs the read immediately on (re)start
 * and is keyed on the live status. It does not prove the poll *happens* at
 * runtime, and it cannot see a surface that refreshes by some other mechanism
 * entirely. Both limits are stated here rather than papered over: a check whose
 * name implies more than it does is the failure mode this burn-down keeps
 * finding.
 *
 * Reached only from tests — nothing in `components/` or `app/` imports it, so
 * `typescript` (already a devDependency, for `tsc --noEmit`) is not in the app
 * bundle.
 */

/** The live-status flag every relay poll effect must depend on. */
export const RELAY_LIVE_FLAG = "isLive";

/**
 * The helper a relay-driven interval must take its period from.
 *
 * Requiring it is what distinguishes the poll from any other `setInterval` in the
 * same component — an elapsed-time ticker also schedules one, and would otherwise
 * be mistaken for the surface's read. It is also the seam that already exists so
 * three surfaces could not disagree about the period (`pollIntervalMsForRelay`).
 */
export const RELAY_POLL_INTERVAL_HELPER = "pollIntervalMsForRelay";

/**
 * The hook module that makes a file a relay surface. Discovery is by import rather
 * than by a hardcoded list of components, so a fifth surface is checked the day it is
 * written instead of the day someone remembers to add it.
 *
 * **One module where ADR 033 §3 left one hook.** Before it, this list had two entries
 * because there were two hooks — and the risk it covers is unchanged: a surface that
 * subscribes must also re-read on connect, and a surface that quietly stopped
 * importing the hook would drop out of this scan.
 */
const RELAY_HOOK_MODULES = ["use-live-relay"];

const INTERVAL_CALL = "setInterval";
const EFFECT_CALL = "useEffect";

export interface RelaySurfaceFile {
  path: string;
  source: string;
}

export interface RelaySurface {
  path: string;
  /** The relay hooks the file imports, e.g. `["useLiveRelay"]`. */
  hooks: string[];
}

export interface RelayPollEffect {
  path: string;
  /** 1-based line of the `useEffect(` call. */
  line: number;
  /** The dependency list as source text, e.g. `["poll", "isLive"]`. */
  deps: string[];
  /** The names the interval callback invokes, e.g. `["poll"]`. */
  intervalReads: string[];
  /** The names the effect invokes outside its own `setInterval`. */
  immediateReads: string[];
  /** Whether the effect re-runs when the relay's status changes. */
  keyedOnLiveStatus: boolean;
  /** Whether the read the interval performs also happens when the effect starts. */
  readsOnStart: boolean;
}

function parse(file: RelaySurfaceFile): ts.SourceFile {
  return ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
}

/** The name a call invokes, or null for a call through anything else. */
function calleeName(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;
  return ts.isIdentifier(node.expression) ? node.expression.text : null;
}

/** Every name invoked anywhere inside `node`, nested intervals included. */
function invokedNames(node: ts.Node): string[] {
  const names: string[] = [];
  const visit = (child: ts.Node): void => {
    const name = calleeName(child);
    if (name !== null) names.push(name);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return names;
}

/**
 * The names `node` invokes *outside* any `setInterval` it schedules.
 *
 * Stops at the interval rather than descending into it, because the interval is
 * where the scheduled read lives and this function is asking about the other one.
 * That distinction is the entire check: an effect whose only call to `poll` is
 * inside its `setInterval` is a surface that does not read until the next tick,
 * and it looks identical in every other respect.
 */
function outsideIntervalNames(node: ts.Node): string[] {
  const names: string[] = [];
  const visit = (child: ts.Node): void => {
    if (calleeName(child) === INTERVAL_CALL) return;
    const name = calleeName(child);
    if (name !== null) names.push(name);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return names;
}

interface IntervalCall {
  reads: string[];
  /** Whether the period comes from the relay's helper, i.e. this is the relay poll. */
  usesRelayHelper: boolean;
}

/** Every `setInterval` call inside `node`, with what its callback invokes. */
function intervalsIn(node: ts.Node): IntervalCall[] {
  const found: IntervalCall[] = [];

  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child) && calleeName(child) === INTERVAL_CALL) {
      const callback = child.arguments[0];
      const period = child.arguments[1];
      found.push({
        reads: callback ? invokedNames(callback) : [],
        // A period written as a literal is some other interval — the elapsed-time
        // tickers in these same components schedule one, and they are not reads.
        usesRelayHelper:
          period !== undefined && period.getText().includes(RELAY_POLL_INTERVAL_HELPER),
      });
    }
    ts.forEachChild(child, visit);
  };

  ts.forEachChild(node, visit);
  return found;
}

/** Every `useEffect(...)` call in a file, at any depth. */
function effectCalls(sourceFile: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calleeName(node) === EFFECT_CALL) calls.push(node);
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return calls;
}

function lineOf(sourceFile: ts.SourceFile, offset: number): number {
  return sourceFile.getLineAndCharacterOfPosition(offset).line + 1;
}

/**
 * The effects that schedule a relay poll, in these files.
 *
 * An effect qualifies only when the period it passes to `setInterval` comes from
 * `pollIntervalMsForRelay`. That is a deliberate narrowing: it means an
 * elapsed-time ticker is not reported as a read, so the scan never asks a clock to
 * re-read anything.
 */
export function findRelayPollEffects(files: RelaySurfaceFile[]): RelayPollEffect[] {
  const effects: RelayPollEffect[] = [];

  for (const file of files) {
    const sourceFile = parse(file);

    for (const call of effectCalls(sourceFile)) {
      const body = call.arguments[0];
      const depsNode = call.arguments[1];
      if (body === undefined || depsNode === undefined) continue;
      if (!ts.isArrayLiteralExpression(depsNode)) continue;

      const relayIntervals = intervalsIn(body).filter((interval) => interval.usesRelayHelper);
      if (relayIntervals.length === 0) continue;

      const intervalReads = [...new Set(relayIntervals.flatMap((interval) => interval.reads))];
      const immediateReads = [...new Set(outsideIntervalNames(body))];
      const deps = depsNode.elements.map((element) => element.getText(sourceFile));

      effects.push({
        path: file.path,
        line: lineOf(sourceFile, call.getStart(sourceFile)),
        deps,
        intervalReads,
        immediateReads,
        // Matched on the text of each dependency, so `[poll, status.isLive]` counts
        // and `[poll, isLiveRelay]` does not.
        keyedOnLiveStatus: deps.some((dep) =>
          new RegExp(`\\b${RELAY_LIVE_FLAG}\\b`).test(dep),
        ),
        readsOnStart: intervalReads.some((name) => immediateReads.includes(name)),
      });
    }
  }

  return effects.sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
  );
}

/** The files that subscribe a surface to the relay, found by the hook they import. */
export function findRelaySurfaces(files: RelaySurfaceFile[]): RelaySurface[] {
  const surfaces: RelaySurface[] = [];

  for (const file of files) {
    const sourceFile = parse(file);
    const hooks: string[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (RELAY_HOOK_MODULES.some((module) => specifier.endsWith(module))) {
          const bindings = node.importClause?.namedBindings;
          // The imported *names*, so a failure can say which hook this surface
          // subscribes with rather than only which file it is in.
          if (bindings !== undefined && ts.isNamedImports(bindings)) {
            hooks.push(...bindings.elements.map((element) => element.name.text));
          } else {
            hooks.push(specifier);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    if (hooks.length > 0) surfaces.push({ path: file.path, hooks });
  }

  return surfaces.sort((a, b) => a.path.localeCompare(b.path));
}
