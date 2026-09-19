import {
  AGENT_JOB_KIND_LABELS,
  type AgentJobKind,
  type OrganizationReadiness,
  type ReadinessReport,
  type ReadinessStep,
} from "./types";

/**
 * The Web half of onboarding readiness (issue #35).
 *
 * **Why this module exists rather than an inline check.** The API now holds the
 * only definition of "ready" — the create gate used to have its own, weaker copy
 * (a `spec_grill` default rather than all five agent kinds), and a readiness
 * signal written against that weaker copy would have promised a form that then
 * `400`'d. That failure mode is *two definitions of ready*, so this module never
 * recomputes readiness: every decision below reads `entryAllowed` / `satisfied`
 * and nothing else. Adding a third definition in the browser is the one thing
 * this module must not do.
 *
 * What it *does* decide is the two things the payload deliberately leaves to the
 * client: **where the user may still go while blocked**, and **what to tell
 * them**. Both are presentation, both are testable without a browser (vitest here
 * runs in a `node` environment with no React testing library), and both are
 * needed by two callers — `middleware.ts` and the onboarding page — so they must
 * not be spelled twice.
 */

/**
 * Where a blocked user is sent. Sits beside `/onboarding/confirm-username`, which
 * is the flow's first step, so onboarding has one home rather than two shapes.
 */
export const ORGANIZATION_ONBOARDING_PATH = "/onboarding/organization";

/** Steps of an org that are not yet satisfied. */
export function unmetSteps(org: OrganizationReadiness): ReadinessStep[] {
  return org.steps.filter((step) => !step.satisfied);
}

/** The orgs that would block this user on their own. */
export function blockingOrganizations(report: ReadinessReport): OrganizationReadiness[] {
  return report.organizations.filter((org) => !org.ready);
}

/**
 * The org to explain first, when entry is blocked.
 *
 * Prefers the **personal** org, because that is the one the issue scopes the
 * configuration flow to ("only an org you administer is one you can set up") and
 * the one a fresh signup is expected to configure. Falls back to an org the user
 * administers, then to anything — so the page always has something concrete to
 * show rather than an empty list.
 */
export function primaryBlockingOrganization(
  report: ReadinessReport,
): OrganizationReadiness | null {
  const blocking = blockingOrganizations(report);
  return (
    blocking.find((org) => org.isPersonal) ??
    blocking.find((org) => org.role === "admin") ??
    blocking[0] ??
    null
  );
}

/**
 * Whether this user can unblock the org themselves.
 *
 * An admin can fix every unmet step, whatever its `requiresAdmin` flag — that flag
 * describes who is *needed*, not who is *excluded*. Everyone else can fix only the
 * steps that do not need an admin.
 *
 * Its purpose is the issue's non-dead-end requirement: a member of an org whose
 * cluster is misconfigured cannot fix it, and must be told so rather than shown a
 * form they cannot submit.
 *
 * Written from the steps rather than from the role alone so a future
 * member-fixable step needs no change here. (The first version of this required
 * the user to be an admin *and* for some step to be member-fixable, which made
 * every admin-fixable step read as unfixable — the tests caught it, which is why
 * the admin case is asserted.)
 */
export function canUnblockOrg(org: OrganizationReadiness): boolean {
  const unmet = unmetSteps(org);
  if (unmet.length === 0) return false;
  return org.role === "admin" || unmet.some((step) => !step.requiresAdmin);
}

/**
 * The paths that must stay reachable while entry is blocked.
 *
 * **The payload is the source of truth, which is the whole reason this is derived
 * rather than hardcoded.** Each unmet step names its own `fixPath`, so a blocked
 * user can reach the thing that unblocks them — the issue's "must not be a dead
 * end". If a future step is added with a different destination, this set follows
 * it automatically, where a hardcoded `/settings/organization/*` would silently
 * stop including it and re-create the trap.
 *
 * Every path here is a settings surface that enforces its own org-role check
 * server-side, so permitting *navigation* is not a privilege of any kind — it
 * only avoids bouncing the user off the page that would fix them.
 */
export function reachableFixPaths(report: ReadinessReport): string[] {
  const paths = new Set<string>();
  for (const org of blockingOrganizations(report)) {
    for (const step of unmetSteps(org)) {
      if (step.fixPath) paths.add(step.fixPath);
    }
  }
  return [...paths].sort();
}

/** Whether `path` is the given fix path or something beneath it. */
function isUnderPath(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

/**
 * Whether a request path may proceed while entry is blocked.
 *
 * Deliberately *not* an allowlist of app surfaces — it is the complement, so the
 * default for a new route is "blocked", which is the safe direction for a gate.
 * The exceptions are the onboarding flow itself (or the redirect would loop) and
 * the fix paths above.
 */
export function isReachableWhileBlocked(path: string, report: ReadinessReport): boolean {
  if (isUnderPath(path, "/onboarding")) return true;
  return reachableFixPaths(report).some((fixPath) => isUnderPath(path, fixPath));
}

/**
 * The middleware's whole decision: where to send this request, or null to let it
 * through.
 *
 * One function rather than a condition inside `middleware.ts` because the gate
 * and the page it redirects to must agree about who is blocked and what stays
 * reachable; two spellings of that is how a "you can fix it here" link comes to
 * bounce straight back to the page that offered it.
 */
export function entryRedirectFor(
  path: string,
  report: ReadinessReport,
): string | null {
  if (report.entryAllowed) return null;
  if (isReachableWhileBlocked(path, report)) return null;
  return ORGANIZATION_ONBOARDING_PATH;
}

/** A job kind's human label, falling back to the raw id for one we do not know. */
export function jobKindLabel(kind: string): string {
  return AGENT_JOB_KIND_LABELS[kind as AgentJobKind] ?? kind;
}

/**
 * The model-defaults step's own detail, when it has one worth showing.
 *
 * The two arrays are rendered as **separate sentences** because the remedies
 * differ and the payload keeps them apart for that reason: "assign a model" sends
 * an admin to an empty slot, while "no longer resolves" sends them to a setting
 * that already looks filled in. Merging them would produce a sentence that is
 * wrong for at least one of the two readers.
 */
export function modelStepDetail(step: ReadinessStep): string | null {
  const sentences: string[] = [];

  const withoutDefault = step.kindsWithoutDefault ?? [];
  if (withoutDefault.length > 0) {
    const names = withoutDefault.map(jobKindLabel).join(", ");
    sentences.push(
      withoutDefault.length === 1
        ? `No default model is assigned for ${names}.`
        : `No default model is assigned for ${names}.`,
    );
  }

  const unresolvable = step.kindsThatDoNotResolve ?? [];
  if (unresolvable.length > 0) {
    const names = unresolvable.map(jobKindLabel).join(", ");
    sentences.push(
      `The assigned default for ${names} no longer resolves — it may have been removed from the catalog.`,
    );
  }

  if (sentences.length === 0) return step.detail;
  // The API's `detail` is a summary of exactly these; the per-kind sentences are
  // the actionable version, so they replace it rather than repeating it.
  return sentences.join(" ");
}

/**
 * One unmet step, phrased for the person reading it.
 *
 * `actionable` is the distinction the issue's non-dead-end requirement turns on:
 * an admin gets a link to the fix, a member gets told who has to act. Everything
 * else about the row is the same, so the two cases cannot drift into describing
 * different problems.
 */
export interface StepBlocker {
  step: ReadinessStep;
  /** This user can fix it (admin, and the step is one an admin fixes). */
  actionable: boolean;
  /** Extra per-kind detail for the model step; null for other steps. */
  detail: string | null;
}

export function blockersFor(org: OrganizationReadiness): StepBlocker[] {
  const isAdmin = org.role === "admin";
  return unmetSteps(org).map((step) => ({
    step,
    // An admin-fixable step in an org they administer is theirs to fix. A step
    // that any member fixes is theirs in any org.
    actionable: !step.requiresAdmin || isAdmin,
    detail: step.id === "model_defaults" ? modelStepDetail(step) : step.detail,
  }));
}

/** The page's headline, naming the org when there is exactly one to blame. */
export function onboardingHeadline(report: ReadinessReport): string {
  const blocking = blockingOrganizations(report);
  if (blocking.length === 1) {
    return `Set up ${blocking[0].name}`;
  }
  return "Finish setting up your organization";
}

/**
 * Why the user is here at all, in one sentence.
 *
 * States the consequence rather than the cause, because "your organization is not
 * ready" is only meaningful once you know what it stops you doing.
 */
export function onboardingExplanation(report: ReadinessReport): string {
  const blocking = blockingOrganizations(report);
  if (blocking.length === 1) {
    return (
      `${blocking[0].name} needs a couple of organization-level settings before it can ` +
      "host a project. Creating one now would fail, so the app is held here until they are done."
    );
  }
  return (
    "None of your organizations can host a project yet. Each needs the same couple of " +
    "organization-level settings, so creating one now would fail."
  );
}

/**
 * What a member who cannot fix it should do instead.
 *
 * Returned only when the user administers none of the blocking orgs — otherwise
 * they can act and this would be noise. It names the org, because a user in
 * several needs to know which admin to ask.
 */
export function cannotFixNotice(org: OrganizationReadiness): string | null {
  if (canUnblockOrg(org)) return null;
  return (
    `You are a ${roleLabel(org.role)} in ${org.name}, so you cannot change these settings ` +
    "yourself. Ask an organization admin to complete the steps above — the app becomes " +
    "available as soon as one of your organizations is set up."
  );
}

/** Role names as a person would read them, not as the database spells them. */
export function roleLabel(role: OrganizationReadiness["role"]): string {
  switch (role) {
    case "admin":
      return "administrator";
    case "product_manager":
      return "product manager";
    default:
      return role.replace(/_/g, " ");
  }
}
