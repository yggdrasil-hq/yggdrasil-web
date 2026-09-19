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

/*
 * ---------------------------------------------------------------------------
 * Which organization a new project lands in (issue #89)
 * ---------------------------------------------------------------------------
 *
 * The entry gate and the create wizard are two expressions of one question —
 * "can this user act?" — and they had drifted: the gate admits a user when **any**
 * org is ready, while the wizard picked a target from `?org=` → personal → first,
 * consulting readiness for neither. So a user admitted via a *joined* ready org,
 * whose *personal* org was not configured, was let in, pressed Create project,
 * silently targeted their unready personal org, and got a `400` telling them to
 * configure a cluster — the same dead end #35 exists to remove, reached by the one
 * route the "any org ready" entry rule creates.
 *
 * Everything below therefore reads `ready`, which the API computed. It does not
 * derive readiness from the steps, and it must not: a second definition of "ready"
 * in the browser is the exact defect this shares a root with (#35, and the note at
 * the top of this module).
 */

/** The orgs that could host a new project — already-ready, in the API's order. */
export function hostableOrganizations(report: ReadinessReport): OrganizationReadiness[] {
  return report.organizations.filter((org) => org.ready);
}

export interface ProjectTarget {
  /** The org a new project would be created in, or null when the user has none. */
  org: OrganizationReadiness | null;
  /** Whether that org can actually host a project right now. */
  usable: boolean;
  /**
   * Every org that could host one. The picker's choices, and the recovery set when
   * the resolved target cannot be used.
   */
  hostable: OrganizationReadiness[];
  /** Why the resolved org cannot be used, phrased for the person reading it. */
  blockedReason: string | null;
  /**
   * A sentence explaining an implicit choice that might not be what the user
   * expected, or null when there is nothing surprising to say.
   */
  note: string | null;
}

/**
 * The org a new project should default to, and whether that default can work.
 *
 * **The order, and why it preserves the status quo for working users:**
 *
 * 1. **`?org=`**, when it names an org the user belongs to. Stated intent wins —
 *    a user with several orgs says which one they mean this way, and ignoring it
 *    to substitute a "better" org would land the project somewhere they did not
 *    ask for.
 * 2. **The personal org, when it is ready.** This is the common case and it is
 *    deliberately *first* so nothing changes for anyone whose own org works. That
 *    is the specific objection the issue raises against preferring
 *    `readyOrganizationId` outright: it would move projects to an org the user did
 *    not choose.
 * 3. **`readyOrganizationId`** — the org that permits entry, so it can always
 *    host. Preferring the named field rather than `hostable[0]` is deliberate:
 *    they are the same value only because `listForUser` happens to order personal
 *    first, and *where a project lands* should not depend on a query's `ORDER BY`.
 * 4. **The personal org even when it is not ready.** Chosen only for the
 *    *messaging*: the blocked explanation should name the org the user thinks of
 *    as theirs, not an arbitrary one. Reached when no org is ready at all.
 * 5. **Any org**, so a user with no personal org still gets a target to name.
 *
 * The net effect on existing users: a personal org that is ready is still the
 * target, unchanged. The only targets that *move* belong to users whose personal
 * org could not have hosted a project anyway — so no working default is taken away
 * from anyone.
 */
export function resolveProjectTarget(
  report: ReadinessReport,
  requestedOrgId: string | null,
): ProjectTarget {
  const hostable = hostableOrganizations(report);

  const requested = requestedOrgId
    ? report.organizations.find((org) => org.id === requestedOrgId) ?? null
    : null;
  const personal = report.organizations.find((org) => org.isPersonal) ?? null;

  const org =
    requested ??
    (personal?.ready ? personal : null) ??
    hostable.find((candidate) => candidate.id === report.readyOrganizationId) ??
    hostable[0] ??
    personal ??
    report.organizations[0] ??
    null;

  const usable = org !== null && org.ready;

  /*
   * The note exists for the case that motivated the issue: the user's own org is
   * not set up, so a *different* one was chosen for them. That is a real
   * improvement over a silent `400`, but it is still a silent substitution unless
   * it is said out loud — and a user who expected their personal org deserves to
   * know both why it was not used and that it is theirs to fix.
   *
   * Suppressed when the target was explicitly requested, because then nothing is
   * being chosen on the user's behalf.
   */
  const note =
    requested === null && personal !== null && !personal.ready && org !== null && org.id !== personal.id
      ? `Your personal organization ${personal.name} is not set up yet, so this project will be created in ${org.name} instead.`
      : null;

  return {
    org,
    usable,
    hostable,
    blockedReason: usable ? null : blockedTargetReason(org),
    note,
  };
}

/**
 * Why a target cannot host a project, in one sentence.
 *
 * Names what is missing rather than repeating the API's `400` ("Configure a
 * Kubernetes cluster in your organization settings…"), because the wizard can see
 * *which* steps are unmet and a bare instruction to go and look is what the dead
 * end consisted of. The reader is also told they have an alternative, when they do
 * — that is the difference between a block and a dead end.
 */
function blockedTargetReason(org: OrganizationReadiness | null): string {
  if (!org) {
    return (
      "You do not belong to an organization yet, and a project has to belong to one. " +
      "Create one from Organization settings first."
    );
  }

  const unmet = unmetSteps(org);
  if (unmet.length === 0) {
    // Ready but reported unusable cannot happen through `usable` above; kept so the
    // function is total rather than returning null and rendering an empty warning.
    return `${org.name} cannot host a project yet.`;
  }

  const labels = unmet.map((step) => step.label.toLowerCase());
  return (
    `${org.name} cannot host a project yet — ${joinWithAnd(labels)} ` +
    `${labels.length === 1 ? "is" : "are"} not configured. ` +
    "An organization administrator can finish that in Organization settings."
  );
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
