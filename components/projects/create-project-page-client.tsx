"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import Link from "next/link";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createProject,
  fetchFeatures,
  fetchGithubAccess,
  fetchInstallationConfigureUrl,
  fetchOrganizationReadiness,
} from "@/lib/api";
import type { GithubAccessResponse, ReadinessReport } from "@/lib/features/types";
import { appRoute, githubInstallStartUrl, oauthStartUrl } from "@/lib/config";
import { filterRepos } from "@/lib/projects/filter-repos";
import { resolveProjectTarget } from "@/lib/features/readiness";
import { useOrgParam } from "@/components/settings/organization/use-org-param";

type WizardStep = "details" | "repos";

export function CreateProjectPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<WizardStep>("details");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [access, setAccess] = useState<GithubAccessResponse | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);
  const [search, setSearch] = useState("");
  const [primaryRepo, setPrimaryRepo] = useState("");
  const [subRepoNames, setSubRepoNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const orgParam = useOrgParam();
  /*
   * The target organization (issue #89).
   *
   * This used to be resolved from `fetchOrganizations()` by `?org=` → personal →
   * first, with readiness consulted nowhere — while the entry gate admits a user
   * when *any* org is ready. The two rules could therefore disagree, and the
   * disagreement was a dead end: a user let in via a joined ready org whose own org
   * was unconfigured pressed Create project, silently targeted the unready org, and
   * got a 400. So the wizard now reads `GET /organizations/readiness` — the *same*
   * payload the gate is built from — and cannot see an org without its readiness.
   * That is the structural half of the fix; the rule itself lives in
   * `lib/features/readiness.ts`, which never re-derives `ready`.
   */
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  /** The user's own pick from the picker, which outranks the default resolution. */
  const [pickedOrgId, setPickedOrgId] = useState<string | null>(null);

  const loadAccess = useCallback((force = false) => {
    setLoading(true);
    setError(null);
    return fetchGithubAccess({ force })
      .then((data) => {
        setAccess(data);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load GitHub access",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  // Land back here after a fresh install (?installation_id=...) or a GitHub
  // reconnect (?github=connected), restoring the draft name/description.
  useEffect(() => {
    const draftName = searchParams.get("name");
    const installationId = searchParams.get("installation_id");
    const githubConnected = searchParams.get("github") === "connected";

    if (draftName && (installationId || githubConnected)) {
      setName(draftName);
      setDescription(searchParams.get("description") ?? "");
      setStep("repos");
    }
  }, [searchParams]);

  useEffect(() => {
    if (step !== "repos" || hasAttemptedLoad) return;
    setHasAttemptedLoad(true);
    void loadAccess();
  }, [step, hasAttemptedLoad, loadAccess]);

  // Resolved once, on the repos step. The rule lives in
  // `lib/features/readiness.ts` so it is unit-testable and so it cannot drift from
  // the gate's own — see the note where the state is declared.
  useEffect(() => {
    if (step !== "repos" || readiness || readinessError) return;
    fetchOrganizationReadiness()
      .then(setReadiness)
      .catch((loadError) =>
        setReadinessError(
          loadError instanceof Error ? loadError.message : "Failed to check organization readiness",
        ),
      );
  }, [step, readiness, readinessError]);

  const target = readiness ? resolveProjectTarget(readiness, pickedOrgId ?? orgParam) : null;
  const resolvedOrgId = target?.org?.id ?? null;

  /*
   * Whether the submit must be held.
   *
   * **This is the non-negotiable of issue #89**: a user must not be able to reach a
   * submit that cannot succeed. `target.usable` is the API's own `ready`, so the
   * client is not deciding anything the server would disagree with — it is applying
   * the server's answer before the round trip instead of after it.
   *
   * While readiness is still loading the submit is held too, because the rule has
   * not been applied yet. If the fetch *failed*, it is not held: an unreachable
   * readiness read must not be a new dead end, so the API stays the authority and
   * the failure is surfaced rather than swallowed — the same posture the entry gate
   * takes with a null report, for the same reason.
   */
  const resolvingTarget = step === "repos" && readiness === null && readinessError === null;
  const orgBlocksSubmit = target !== null && !target.usable;
  const canSubmit = Boolean(primaryRepo) && !submitting && !resolvingTarget && !orgBlocksSubmit;

  // After a fresh install, pre-select a repo from the installation we just landed from.
  useEffect(() => {
    if (!access || primaryRepo) return;
    const installationId = searchParams.get("installation_id");
    if (!installationId) return;
    const match = access.repos.find((repo) => repo.installationId === installationId);
    if (match) setPrimaryRepo(match.fullName);
  }, [access, primaryRepo, searchParams]);

  function continueToRepos() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name is required.");
      return;
    }
    setError(null);
    setStep("repos");
  }

  function buildReturnTo() {
    const params = new URLSearchParams({ name: name.trim() });
    if (description.trim()) params.set("description", description.trim());
    return `/projects/new?${params.toString()}`;
  }

  function startInstall() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name is required.");
      return;
    }
    window.location.href = githubInstallStartUrl({
      name: trimmedName,
      description: description.trim(),
      returnTo: "/projects/new",
    });
  }

  function reconnectGithub() {
    window.location.href = oauthStartUrl(buildReturnTo());
  }

  async function openConfigureOnGitHub(installationId: string) {
    try {
      const url = await fetchInstallationConfigureUrl(installationId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (configureError) {
      setError(
        configureError instanceof Error
          ? configureError.message
          : "Failed to open GitHub configuration",
      );
    }
  }

  function toggleSubRepo(fullName: string) {
    setSubRepoNames((current) =>
      current.includes(fullName)
        ? current.filter((name) => name !== fullName)
        : [...current, fullName],
    );
  }

  function selectPrimaryRepo(fullName: string) {
    setPrimaryRepo(fullName);
    setSubRepoNames([]);
  }

  const repos = access?.repos ?? [];
  const filteredRepos = filterRepos(repos, search);
  const primaryRepoRecord = repos.find((repo) => repo.fullName === primaryRepo) ?? null;
  const selectedInstallationId = primaryRepoRecord?.installationId ?? null;
  const subRepoCandidates = selectedInstallationId
    ? repos.filter(
        (repo) => repo.installationId === selectedInstallationId && repo.fullName !== primaryRepo,
      )
    : [];

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedInstallationId || !primaryRepoRecord) {
      setError("Select a primary repository.");
      return;
    }

    const repositories = [
      {
        githubOwner: primaryRepoRecord.githubOwner,
        githubRepo: primaryRepoRecord.githubRepo,
        isPrimary: true,
      },
      ...subRepoNames
        .map((fullName) => subRepoCandidates.find((repo) => repo.fullName === fullName))
        .filter((repo): repo is NonNullable<typeof repo> => repo !== undefined)
        .map((repo) => ({
          githubOwner: repo.githubOwner,
          githubRepo: repo.githubRepo,
          isPrimary: false,
        })),
    ];

    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
        installationId: selectedInstallationId,
        organizationId: resolvedOrgId ?? undefined,
        repositories,
      });

      const features = await fetchFeatures(project.id);
      const initFeature = features.find((feature) => feature.featureType === "project_init");

      router.push(
        appRoute(
          initFeature
            ? `/projects/${project.id}/features/${initFeature.id}`
            : `/projects/${project.id}`,
        ),
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to create project",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HubLayout
      title="Create project"
      description="Name your project, then pick a repository Yggdrasil already has access to."
    >
      {step === "details" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project details</CardTitle>
            </CardHeader>
            <div className="space-y-4 px-4 pb-4">
              <div className="space-y-2">
                <label htmlFor="project-name" className="text-sm font-medium text-frost">
                  Name
                </label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Yggdrasil Core"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="project-description" className="text-sm font-medium text-frost">
                  Description
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What is this project?"
                  className="min-h-24 w-full rounded-md border border-rime bg-surface-02 px-3 py-2 text-sm text-frost"
                />
              </div>
            </div>
          </Card>

          {error ? <ErrorMessage className="text-sm text-red-400">{error}</ErrorMessage> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={continueToRepos}>
              Continue
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href={appRoute("/projects")}>Cancel</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {step === "repos" ? (
        <form onSubmit={(event) => void handleCreate(event)} className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Select a repository</CardTitle>
                <CardDescription>
                  Choose a primary repo from anywhere Yggdrasil already has access, and
                  optionally add sub-repos from the same org.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadAccess(true)}
                >
                  Refresh
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      Add repository access
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(access?.installations ?? []).map((installation) => (
                      <DropdownMenuItem
                        key={installation.id}
                        onClick={() => void openConfigureOnGitHub(installation.id)}
                      >
                        Add repos to {installation.accountLogin}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onClick={startInstall}>
                      Install on a new org or account
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <div className="space-y-4 px-4 pb-4">
              {access?.reauthRequired ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <p className="mb-2">
                    Your GitHub connection needs to be reconnected before we can check your
                    repositories.
                  </p>
                  <Button type="button" size="sm" onClick={reconnectGithub}>
                    Reconnect GitHub
                  </Button>
                </div>
              ) : null}

              {access?.stale ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-rime bg-surface-02 p-3 text-sm text-mist">
                  <span>Showing your last known repositories — couldn&apos;t reach GitHub just now.</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadAccess(true)}
                  >
                    Retry
                  </Button>
                </div>
              ) : null}

              {loading ? <p className="text-sm text-mist">Loading your repositories…</p> : null}

              {!loading && repos.length === 0 && !access?.reauthRequired ? (
                <p className="text-sm text-shadow">
                  No repositories found yet. Use &ldquo;Add repository access&rdquo; above to
                  connect GitHub.
                </p>
              ) : null}

              {repos.length > 0 ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-shadow" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search repositories…"
                      aria-label="Search repositories"
                      className="pl-9"
                    />
                  </div>

                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {filteredRepos.map((repo) => (
                      <label
                        key={`${repo.installationId}/${repo.fullName}`}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="primary-repo"
                          value={repo.fullName}
                          checked={primaryRepo === repo.fullName}
                          onChange={() => selectPrimaryRepo(repo.fullName)}
                        />
                        <span>{repo.fullName}</span>
                        <span className="text-xs text-shadow">({repo.accountLogin})</span>
                      </label>
                    ))}
                    {filteredRepos.length === 0 ? (
                      <p className="text-sm text-shadow">No repositories match your search.</p>
                    ) : null}
                  </div>

                  {subRepoCandidates.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-frost">
                        Also include from {primaryRepoRecord?.accountLogin}
                      </p>
                      <div className="space-y-2">
                        {subRepoCandidates.map((repo) => (
                          <label key={repo.fullName} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={subRepoNames.includes(repo.fullName)}
                              onChange={() => toggleSubRepo(repo.fullName)}
                            />
                            {repo.fullName}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </Card>

          {/*
           * Which organization this lands in (issue #89).
           *
           * Always shown, even when there is no choice to make. The defect this
           * fixes was partly that the choice was *invisible*: a project silently
           * landed in an org the user had not thought about, and the readiness
           * mismatch was only its most visible symptom. Naming the org costs one
           * line and removes the surprise.
           */}
          {readinessError ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              <p>
                Couldn&apos;t check which organizations can host a project just now ({readinessError}). You
                can still create one — if the organization is not set up yet, the error will say what
                is missing.
              </p>
            </div>
          ) : null}

          {step === "repos" && !readinessError ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Organization</CardTitle>
              </CardHeader>
              <div className="space-y-3 px-4 pb-4">
                {resolvingTarget ? (
                  <p className="text-sm text-mist">Checking which organization can host a project…</p>
                ) : null}

                {target?.org ? (
                  <p className="text-sm text-mist">
                    This project will be created in{" "}
                    <span className="font-medium text-frost">{target.org.name}</span>.
                  </p>
                ) : null}

                {target?.note ? (
                  <p className="text-xs text-shadow">{target.note}</p>
                ) : null}

                {/*
                 * The picker appears only when there is a real choice (>1 org that
                 * can host) **and** the current target is one of them. Only *ready*
                 * orgs are offered, because offering one that cannot host would
                 * rebuild the dead end inside the wizard.
                 *
                 * The `usable` half of that condition is not decoration. Found by
                 * rendering the blocked case: with `?org=` naming an org that is not
                 * ready, a picker listing only the ready orgs renders its value as
                 * the *first* option — so the control said "Sarat's workspace" while
                 * the sentence beside it said the project would go to "Northwind
                 * Labs". Two contradictory statements on one screen, which is the
                 * very defect this issue is about. When the target is usable it is by
                 * definition in `hostable`, so the value always matches an option and
                 * the control cannot misrepresent the target; when it is blocked, the
                 * recovery buttons below are the action instead.
                 */}
                {target?.usable && target.hostable.length > 1 ? (
                  <Select
                    value={resolvedOrgId ?? ""}
                    aria-label="Organization"
                    onChange={(event) => setPickedOrgId(event.target.value)}
                  >
                    {target.hostable.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </Select>
                ) : null}

                {target && !target.usable && target.blockedReason ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                    <p>{target.blockedReason}</p>
                    {target.hostable.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {target.hostable.map((candidate) => (
                          <Button
                            key={candidate.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setPickedOrgId(candidate.id)}
                          >
                            Create it in {candidate.name}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {error ? <ErrorMessage className="text-sm text-red-400">{error}</ErrorMessage> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Creating…" : "Create project"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("details")}>
              Back
            </Button>
          </div>
        </form>
      ) : null}
    </HubLayout>
  );
}
