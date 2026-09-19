import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_ONBOARDING_PATH,
  blockersFor,
  blockingOrganizations,
  canUnblockOrg,
  cannotFixNotice,
  entryRedirectFor,
  isReachableWhileBlocked,
  jobKindLabel,
  modelStepDetail,
  onboardingExplanation,
  onboardingHeadline,
  primaryBlockingOrganization,
  reachableFixPaths,
  resolveProjectTarget,
  roleLabel,
  unmetSteps,
} from "@/lib/features/readiness";
import type {
  OrganizationReadiness,
  ReadinessReport,
  ReadinessStep,
} from "@/lib/features/types";

/**
 * Issue #35's Web half.
 *
 * These decisions are tested here rather than through the page for the reason the
 * repo documents in `lib/features/*`: vitest runs in a `node` environment with no
 * React testing library, so anything with a branch worth asserting belongs in a
 * module like this one.
 *
 * Two of the cases below exist because getting them wrong reintroduces the exact
 * failure the issue is about, and both are silent if wrong:
 *
 * - **entry is gated on any org being ready**, not the personal one — the reverse
 *   traps an invitee;
 * - **the fix paths stay reachable while blocked** — otherwise the gate redirects
 *   a user away from the only page that can unblock them.
 */

function step(overrides: Partial<ReadinessStep> = {}): ReadinessStep {
  return {
    id: "cluster",
    label: "Kubernetes cluster",
    satisfied: false,
    detail: "No cluster is configured.",
    requiresAdmin: true,
    fixPath: "/settings/organization/cluster",
    ...overrides,
  };
}

function org(overrides: Partial<OrganizationReadiness> = {}): OrganizationReadiness {
  const steps = overrides.steps ?? [step()];
  return {
    id: "org_1",
    name: "Sarat's workspace",
    isPersonal: true,
    role: "admin",
    ready: steps.every((s) => s.satisfied),
    steps,
    ...overrides,
  };
}

function report(organizations: OrganizationReadiness[]): ReadinessReport {
  const ready = organizations.find((o) => o.ready) ?? null;
  return {
    entryAllowed: ready !== null,
    readyOrganizationId: ready?.id ?? null,
    organizations,
  };
}

const CLUSTER_OK = step({
  id: "cluster",
  label: "Kubernetes cluster",
  satisfied: true,
  detail: null,
});
const MODELS_MISSING = step({
  id: "model_defaults",
  label: "Default models",
  detail: "no default model for Design grill",
  fixPath: "/settings/organization/providers",
  kindsWithoutDefault: ["design_grill"],
  kindsThatDoNotResolve: [],
});

describe("unmetSteps / blockingOrganizations", () => {
  it("lists only unsatisfied steps", () => {
    const orgWithOne = org({ steps: [CLUSTER_OK, MODELS_MISSING] });

    expect(unmetSteps(orgWithOne).map((s) => s.id)).toEqual(["model_defaults"]);
  });

  it("counts an org as blocking unless every step is satisfied", () => {
    const ready = org({ id: "a", steps: [CLUSTER_OK] });
    const unready = org({ id: "b", steps: [CLUSTER_OK, MODELS_MISSING] });

    expect(blockingOrganizations(report([ready, unready])).map((o) => o.id)).toEqual(["b"]);
  });
});

describe("entry is gated on any org being ready, not the personal one", () => {
  /*
   * The issue's own non-dead-end requirement, and the rule the API chose and
   * documented. An invitee whose *personal* org nobody configured still has a
   * perfectly good org to work in; gating on the personal org would block them
   * from the whole app for a reason they may not be able to fix.
   *
   * If this inverts, the failure is silent: the app simply refuses to let a
   * legitimate user in, and every other test here still passes.
   */
  it("permits entry when a joined org is ready but the personal one is not", () => {
    const personal = org({ id: "personal", isPersonal: true, steps: [step()] });
    const joined = org({
      id: "joined",
      name: "Acme Retail",
      isPersonal: false,
      role: "developer",
      steps: [CLUSTER_OK],
    });

    const payload = report([personal, joined]);

    expect(payload.entryAllowed).toBe(true);
    expect(payload.readyOrganizationId).toBe("joined");
    // And nothing is blocked, so a normal app route passes.
    expect(entryRedirectFor("/projects", payload)).toBeNull();
  });

  it("blocks only when no org is ready", () => {
    const payload = report([
      org({ id: "personal", steps: [step()] }),
      org({ id: "joined", steps: [CLUSTER_OK, MODELS_MISSING] }),
    ]);

    expect(payload.entryAllowed).toBe(false);
    expect(payload.readyOrganizationId).toBeNull();
    expect(entryRedirectFor("/projects", payload)).toBe(ORGANIZATION_ONBOARDING_PATH);
  });
});

describe("primaryBlockingOrganization", () => {
  it("prefers the personal org, which is the one the user is expected to configure", () => {
    const payload = report([
      org({ id: "joined", isPersonal: false }),
      org({ id: "personal", isPersonal: true }),
    ]);

    expect(primaryBlockingOrganization(payload)?.id).toBe("personal");
  });

  it("falls back to an org the user administers when none is personal", () => {
    const payload = report([
      org({ id: "member-of", role: "developer", isPersonal: false }),
      org({ id: "admin-of", role: "admin", isPersonal: false }),
    ]);

    expect(primaryBlockingOrganization(payload)?.id).toBe("admin-of");
  });

  it("falls back to any org rather than showing nothing", () => {
    const payload = report([org({ id: "only", role: "tester", isPersonal: false })]);

    expect(primaryBlockingOrganization(payload)?.id).toBe("only");
  });

  it("is null when there is nothing blocking", () => {
    expect(primaryBlockingOrganization(report([]))).toBeNull();
    expect(
      primaryBlockingOrganization(report([org({ steps: [CLUSTER_OK] })])),
    ).toBeNull();
  });
});

describe("canUnblockOrg", () => {
  it("is true for an admin with an admin-fixable step", () => {
    expect(canUnblockOrg(org({ role: "admin", steps: [step()] }))).toBe(true);
  });

  it("is true for a non-admin when a step does not require admin", () => {
    // Derived from the step rather than the role, so a future member-fixable step
    // needs no change here. This case is what pins that.
    const memberFixable = step({ requiresAdmin: false });
    expect(
      canUnblockOrg(org({ role: "developer", steps: [memberFixable] })),
    ).toBe(true);
  });

  it("is false for a non-admin facing only admin steps", () => {
    expect(canUnblockOrg(org({ role: "developer", steps: [step()] }))).toBe(false);
  });

  it("is false for an admin whose unmet steps are all member-fixable and unmet", () => {
    // Still true — an admin can do anything a member can. Asserted so the rule
    // does not accidentally become role-exclusive.
    expect(canUnblockOrg(org({ role: "admin", steps: [step({ requiresAdmin: false })] }))).toBe(
      true,
    );
  });

  it("is false for an org with nothing unmet", () => {
    // No steps to fix means nothing for this user to do — which is a different
    // answer from "they may fix it", and the page's copy turns on the difference.
    expect(canUnblockOrg(org({ role: "admin", steps: [CLUSTER_OK] }))).toBe(false);
  });
});

describe("reachableFixPaths", () => {
  it("collects the fix path of each unmet step", () => {
    const payload = report([org({ steps: [CLUSTER_OK, MODELS_MISSING] })]);

    expect(reachableFixPaths(payload)).toEqual(["/settings/organization/providers"]);
  });

  it("ignores the fix path of a satisfied step", () => {
    // The satisfied cluster step's path must not be exempt: over-permitting is
    // how the exempt set grows into "everything settings-shaped".
    const payload = report([org({ steps: [CLUSTER_OK, MODELS_MISSING] })]);

    expect(reachableFixPaths(payload)).not.toContain("/settings/organization/cluster");
  });

  it("collects across every blocking org, and is empty when none is blocking", () => {
    const both = report([
      org({ id: "a", steps: [step()] }),
      org({ id: "b", isPersonal: false, steps: [MODELS_MISSING] }),
    ]);
    expect(reachableFixPaths(both)).toEqual([
      "/settings/organization/cluster",
      "/settings/organization/providers",
    ]);

    expect(reachableFixPaths(report([org({ steps: [CLUSTER_OK] })]))).toEqual([]);
  });
});

describe("isReachableWhileBlocked", () => {
  const payload = report([org({ steps: [step()] })]);

  it("keeps the onboarding flow itself reachable, or the redirect loops", () => {
    expect(isReachableWhileBlocked("/onboarding", payload)).toBe(true);
    expect(isReachableWhileBlocked(ORGANIZATION_ONBOARDING_PATH, payload)).toBe(true);
    expect(isReachableWhileBlocked("/onboarding/confirm-username", payload)).toBe(true);
  });

  it("keeps the fix path reachable, and its descendants", () => {
    expect(isReachableWhileBlocked("/settings/organization/cluster", payload)).toBe(true);
    expect(isReachableWhileBlocked("/settings/organization/cluster/advanced", payload)).toBe(
      true,
    );
  });

  it("does not treat a sibling path as the fix path", () => {
    // The boundary that matters: a prefix match without the slash would let
    // `/settings/organization/cluster-something` through.
    expect(isReachableWhileBlocked("/settings/organization/cluster-something", payload)).toBe(
      false,
    );
    expect(isReachableWhileBlocked("/settings/organization", payload)).toBe(false);
  });

  it("blocks the app surfaces the gate exists for", () => {
    for (const path of [
      "/projects",
      "/projects/new",
      "/usage",
      "/analytics",
      "/notifications",
      "/settings/account",
    ]) {
      expect(isReachableWhileBlocked(path, payload), path).toBe(false);
    }
  });
});

describe("entryRedirectFor", () => {
  it("lets an allowed user through to anything", () => {
    const allowed = report([org({ steps: [CLUSTER_OK] })]);

    expect(entryRedirectFor("/projects", allowed)).toBeNull();
    expect(entryRedirectFor("/usage", allowed)).toBeNull();
  });

  it("sends a blocked user to onboarding from an app route", () => {
    const blocked = report([org({ steps: [step()] })]);

    expect(entryRedirectFor("/projects", blocked)).toBe(ORGANIZATION_ONBOARDING_PATH);
  });

  it("does not redirect a blocked user away from onboarding or the fix", () => {
    const blocked = report([org({ steps: [step()] })]);

    expect(entryRedirectFor(ORGANIZATION_ONBOARDING_PATH, blocked)).toBeNull();
    expect(entryRedirectFor("/settings/organization/cluster", blocked)).toBeNull();
  });
});

describe("modelStepDetail", () => {
  it("renders missing and unresolvable kinds as separate sentences", () => {
    // The API keeps these apart because the remedies differ — assign a model vs.
    // fix one that stopped resolving. Collapsing them sends an admin to a form
    // that already looks filled in.
    const detail = modelStepDetail(
      step({
        id: "model_defaults",
        kindsWithoutDefault: ["design_grill"],
        kindsThatDoNotResolve: ["feature_build"],
      }),
    );

    expect(detail).toContain("No default model is assigned for Design grill.");
    expect(detail).toContain("Feature build");
    expect(detail).toContain("no longer resolves");
  });

  it("uses human labels, not the raw job-kind ids", () => {
    const detail = modelStepDetail(
      step({ id: "model_defaults", kindsWithoutDefault: ["test_run"] }),
    );

    expect(detail).toContain("Tests");
    expect(detail).not.toContain("test_run");
  });

  it("does not claim a count it cannot know", () => {
    // `missingModelKinds` is a summary; the two arrays are the actionable truth.
    // With neither present the API's own sentence is shown rather than a
    // synthesized "0 problems".
    const detail = modelStepDetail(
      step({ id: "model_defaults", detail: "no default model for Design grill" }),
    );

    expect(detail).toBe("no default model for Design grill");
  });
});

describe("jobKindLabel", () => {
  it("labels a known kind and passes through an unknown one", () => {
    expect(jobKindLabel("feature_build")).toBe("Feature build");
    // A kind added to the API must not render as "undefined" or crash the page.
    expect(jobKindLabel("future_kind")).toBe("future_kind");
  });
});

describe("blockersFor", () => {
  it("marks an admin's admin-step as actionable and keeps the detail", () => {
    const [blocker] = blockersFor(
      org({ role: "admin", steps: [CLUSTER_OK, MODELS_MISSING] }),
    );

    expect(blocker.step.id).toBe("model_defaults");
    expect(blocker.actionable).toBe(true);
    expect(blocker.detail).toContain("Design grill");
  });

  it("marks a member's admin-step as not actionable", () => {
    const [blocker] = blockersFor(org({ role: "developer", steps: [step()] }));

    expect(blocker.actionable).toBe(false);
    // The detail still explains the problem — a non-admin is told, not silenced.
    expect(blocker.detail).toBe("No cluster is configured.");
  });

  it("returns nothing for a ready org", () => {
    expect(blockersFor(org({ steps: [CLUSTER_OK] }))).toEqual([]);
  });
});

describe("page copy", () => {
  it("names the single blocking org in the headline and explanation", () => {
    const payload = report([org({ name: "Sarat's workspace", steps: [step()] })]);

    expect(onboardingHeadline(payload)).toBe("Set up Sarat's workspace");
    expect(onboardingExplanation(payload)).toContain("Sarat's workspace");
    expect(onboardingExplanation(payload)).toContain("would fail");
  });

  it("generalises when several orgs are blocking", () => {
    const payload = report([
      org({ id: "a", name: "A", steps: [step()] }),
      org({ id: "b", name: "B", isPersonal: false, steps: [step()] }),
    ]);

    expect(onboardingHeadline(payload)).toBe("Finish setting up your organization");
    expect(onboardingExplanation(payload)).toContain("None of your organizations");
  });

  it("tells a member who cannot fix it, and stays quiet for an admin", () => {
    // The issue's non-dead-end requirement: a member of a misconfigured org must
    // be told who has to act, not shown a form they cannot submit.
    const member = org({ role: "developer", name: "Acme Retail" });
    expect(cannotFixNotice(member)).toContain("Acme Retail");
    expect(cannotFixNotice(member)).toMatch(/Ask an organization admin/);
    // It also names the reader's own role, so the message does not read as if it
    // were addressed to somebody else.
    expect(cannotFixNotice(member)).toContain("developer");

    expect(cannotFixNotice(org({ role: "admin" }))).toBeNull();
  });
});

describe("roleLabel", () => {
  it("reads roles as a person would", () => {
    expect(roleLabel("admin")).toBe("administrator");
    expect(roleLabel("product_manager")).toBe("product manager");
    expect(roleLabel("developer")).toBe("developer");
  });
});

/*
 * Issue #89: the create wizard can target an org the gate did not admit the user
 * for.
 *
 * The gate and the wizard are two expressions of one question and had drifted.
 * The wizard picked a target from `?org=` → personal → first with no reference to
 * readiness, so a user admitted via a *joined* ready org whose *personal* org was
 * unconfigured was let in, pressed Create project, silently targeted the unready
 * org, and got a `400`. Same dead end #35 removes, by the one route the "any org
 * ready" entry rule creates.
 *
 * These cases are what make the resolution rule checkable. The case that matters
 * most is the third: it is the issue's exact scenario, and the assertion is that
 * the outcome is both *usable* and *explained* — not merely that it does not 400.
 */
describe("resolveProjectTarget (#89)", () => {
  const PERSONAL_READY = org({
    id: "org_personal",
    name: "Sarat's workspace",
    isPersonal: true,
    steps: [CLUSTER_OK],
  });
  const JOINED_READY = org({
    id: "org_acme",
    name: "Acme Retail",
    isPersonal: false,
    steps: [CLUSTER_OK],
  });
  const JOINED_UNREADY = org({
    id: "org_northwind",
    name: "Northwind Labs",
    isPersonal: false,
    role: "developer",
    steps: [step(), MODELS_MISSING],
  });

  it("keeps the personal org when it is ready — nothing changes for a working user", () => {
    const target = resolveProjectTarget(report([PERSONAL_READY, JOINED_READY]), null);

    expect(target.org?.id).toBe("org_personal");
    expect(target.usable).toBe(true);
    // No substitution happened, so there is nothing to explain.
    expect(target.note).toBeNull();
  });

  it("falls back to the personal org when it is ready and listed after another", () => {
    const target = resolveProjectTarget(report([JOINED_READY, PERSONAL_READY]), null);
    expect(target.org?.id).toBe("org_personal");
  });

  it("uses a ready joined org when the personal org is not ready, and says so", () => {
    // The issue's exact scenario: admitted via a joined ready org, own org unset.
    const target = resolveProjectTarget(
      report([org({ id: "org_personal", name: "Sarat's workspace", isPersonal: true, steps: [step()] }), JOINED_READY]),
      null,
    );

    expect(target.org?.id).toBe("org_acme");
    expect(target.usable).toBe(true);
    // Usable alone would still be a silent substitution. The note is the fix for
    // "silently targets": the user expected their own org and is told why not.
    expect(target.note).toContain("Sarat's workspace");
    expect(target.note).toContain("Acme Retail");
  });

  it("honours ?org= over a ready personal org", () => {
    const target = resolveProjectTarget(report([PERSONAL_READY, JOINED_READY]), "org_acme");
    expect(target.org?.id).toBe("org_acme");
    expect(target.usable).toBe(true);
    // Nothing was chosen on the user's behalf, so there is nothing to explain.
    expect(target.note).toBeNull();
  });

  it("blocks — rather than substitutes — when ?org= names an org that is not ready", () => {
    // Substituting would land the project in an org the user did not ask for.
    const target = resolveProjectTarget(report([PERSONAL_READY, JOINED_UNREADY]), "org_northwind");

    expect(target.org?.id).toBe("org_northwind");
    expect(target.usable).toBe(false);
    expect(target.blockedReason).toContain("Northwind Labs");
    // It names what is missing, not just "go to settings and look".
    expect(target.blockedReason).toContain("kubernetes cluster");
    expect(target.blockedReason).toContain("default models");
    // And the recovery set is offered, so this is a block and not a dead end.
    expect(target.hostable.map((o) => o.id)).toEqual(["org_personal"]);
  });

  it("ignores ?org= naming an org the user does not belong to", () => {
    // The API would reject the create, so the wizard must not adopt it as a target.
    const target = resolveProjectTarget(report([PERSONAL_READY, JOINED_READY]), "org_someone_else");

    expect(target.org?.id).toBe("org_personal");
    expect(target.usable).toBe(true);
  });

  it("names the personal org when no org is ready at all", () => {
    // Reached only off the gated path, but the messaging must still be about the
    // org the user thinks of as theirs rather than an arbitrary one.
    const target = resolveProjectTarget(
      report([org({ id: "org_personal", name: "Sarat's workspace", isPersonal: true, steps: [step()] }), JOINED_UNREADY]),
      null,
    );

    expect(target.org?.id).toBe("org_personal");
    expect(target.usable).toBe(false);
    expect(target.blockedReason).toContain("Sarat's workspace");
  });

  it("handles a user with no organization at all", () => {
    const target = resolveProjectTarget(report([]), null);

    expect(target.org).toBeNull();
    expect(target.usable).toBe(false);
    expect(target.blockedReason).toContain("do not belong to an organization");
  });

  it("prefers the API's readyOrganizationId over list position", () => {
    // `readyOrganizationId` and `hostable[0]` are the same value only because
    // `listForUser` orders personal-first. Where a project lands must not depend on
    // a query's ORDER BY, so the named field is what the rule reads.
    const first = org({ id: "org_a", name: "A Corp", isPersonal: false, steps: [CLUSTER_OK] });
    const named = org({ id: "org_b", name: "B Corp", isPersonal: false, steps: [CLUSTER_OK] });
    const custom: ReadinessReport = {
      entryAllowed: true,
      readyOrganizationId: "org_b",
      // Deliberately out of order relative to the named field.
      organizations: [org({ id: "org_personal", isPersonal: true, steps: [step()] }), first, named],
    };

    expect(resolveProjectTarget(custom, null).org?.id).toBe("org_b");
  });

  it("offers every ready org as a choice, and only ready ones", () => {
    const target = resolveProjectTarget(
      report([PERSONAL_READY, JOINED_READY, JOINED_UNREADY]),
      null,
    );

    // More than one entry is what makes the picker worth showing.
    expect(target.hostable.map((o) => o.id)).toEqual(["org_personal", "org_acme"]);
  });

  it("always leaves a way forward when the target cannot be used", () => {
    // The non-negotiable: no submit that cannot succeed, and no dead end either.
    // One ready org means a target is reachable — assert that rather than trust it.
    const target = resolveProjectTarget(report([JOINED_UNREADY, JOINED_READY]), "org_northwind");

    expect(target.usable).toBe(false);
    expect(target.hostable.length).toBeGreaterThan(0);
  });
});
