"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createProject,
  fetchFeatures,
  fetchGithubInstallations,
  fetchInstallationConfigureUrl,
  fetchInstallationRepos,
  syncInstallationRepos,
} from "@/lib/api";
import type { GithubInstallation, InstallationRepo } from "@/lib/features/types";
import { appRoute, githubInstallStartUrl } from "@/lib/config";

type WizardStep = "details" | "github" | "repos";

export function CreateProjectPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<WizardStep>("details");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [installations, setInstallations] = useState<GithubInstallation[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
  const [repos, setRepos] = useState<InstallationRepo[]>([]);
  const [primaryRepo, setPrimaryRepo] = useState("");
  const [subRepoNames, setSubRepoNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const callbackStep = searchParams.get("step");
    const installationId = searchParams.get("installation_id");
    const draftName = searchParams.get("name");
    const draftDescription = searchParams.get("description");

    if (callbackStep === "repos" && installationId && draftName) {
      setName(draftName);
      setDescription(draftDescription ?? "");
      setSelectedInstallationId(installationId);
      setStep("repos");
    }
  }, [searchParams]);

  useEffect(() => {
    if (step !== "github") return;

    let active = true;
    setLoading(true);
    setError(null);

    void fetchGithubInstallations()
      .then((data) => {
        if (active) setInstallations(data);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load installations",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [step]);

  useEffect(() => {
    if (step !== "repos" || !selectedInstallationId) return;

    let active = true;
    setLoading(true);
    setError(null);

    void fetchInstallationRepos(selectedInstallationId)
      .then((data) => {
        if (!active) return;
        setRepos(data);
        if (data.length > 0 && !primaryRepo) {
          setPrimaryRepo(data[0].fullName);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load repositories",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [step, selectedInstallationId, primaryRepo]);

  function continueToGithub() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name is required.");
      return;
    }
    setError(null);
    setStep("github");
  }

  function selectInstallation(installationId: string) {
    setSelectedInstallationId(installationId);
    setPrimaryRepo("");
    setSubRepoNames([]);
    setStep("repos");
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

  async function openConfigureOnGitHub() {
    if (!selectedInstallationId) return;
    try {
      const url = await fetchInstallationConfigureUrl(selectedInstallationId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (configureError) {
      setError(
        configureError instanceof Error
          ? configureError.message
          : "Failed to open GitHub configuration",
      );
    }
  }

  async function refreshRepos() {
    if (!selectedInstallationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await syncInstallationRepos(selectedInstallationId);
      setRepos(data);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Failed to sync repositories");
    } finally {
      setLoading(false);
    }
  }

  function toggleSubRepo(fullName: string) {
    setSubRepoNames((current) =>
      current.includes(fullName)
        ? current.filter((name) => name !== fullName)
        : [...current, fullName],
    );
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedInstallationId || !primaryRepo) {
      setError("Select a primary repository.");
      return;
    }

    const primary = repos.find((repo) => repo.fullName === primaryRepo);
    if (!primary) {
      setError("Selected primary repository is not available.");
      return;
    }

    const repositories = [
      {
        githubOwner: primary.githubOwner,
        githubRepo: primary.githubRepo,
        isPrimary: true,
      },
      ...subRepoNames
        .filter((fullName) => fullName !== primaryRepo)
        .map((fullName) => {
          const repo = repos.find((entry) => entry.fullName === fullName);
          return repo
            ? {
                githubOwner: repo.githubOwner,
                githubRepo: repo.githubRepo,
                isPrimary: false,
              }
            : null;
        })
        .filter((repo): repo is NonNullable<typeof repo> => repo !== null),
    ];

    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
        installationId: selectedInstallationId,
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
      description="Name your project, connect the Yggdrasil GitHub App, then pick repositories."
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

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={continueToGithub}>
              Continue
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href={appRoute("/projects")}>Cancel</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {step === "github" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">GitHub App access</CardTitle>
              <CardDescription>
                Install the Yggdrasil GitHub App on your org or account, or reuse an existing
                installation.
              </CardDescription>
            </CardHeader>
            <div className="space-y-4 px-4 pb-4">
              <Button type="button" onClick={startInstall}>
                Install on GitHub
              </Button>
              <p className="text-xs text-shadow">
                Org installs may require an admin. If GitHub blocks you, ask your org admin to
                install the app and grant repository access.
              </p>

              {loading ? <p className="text-sm text-mist">Loading installations…</p> : null}

              {installations.length > 0 ? (
                <ul className="space-y-2">
                  {installations.map((installation) => (
                    <li key={installation.id}>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => selectInstallation(installation.id)}
                      >
                        {installation.accountLogin}{" "}
                        <span className="text-shadow">({installation.accountType})</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <Button type="button" variant="ghost" onClick={() => setStep("details")}>
            Back
          </Button>
        </div>
      ) : null}

      {step === "repos" ? (
        <form onSubmit={(event) => void handleCreate(event)} className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Select repositories</CardTitle>
                <CardDescription>
                  Choose a primary repo and optional sub-repos from the GitHub App installation.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void openConfigureOnGitHub()}>
                  Configure on GitHub
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshRepos()}>
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <div className="space-y-4 px-4 pb-4">
              {loading ? <p className="text-sm text-mist">Loading repositories…</p> : null}
              {repos.length === 0 && !loading ? (
                <p className="text-sm text-shadow">
                  No repositories granted yet. Use Configure on GitHub to add repos to this
                  installation.
                </p>
              ) : null}

              {repos.length > 0 ? (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-frost">Primary repository</p>
                    <div className="space-y-2">
                      {repos.map((repo) => (
                        <label key={repo.fullName} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="primary-repo"
                            value={repo.fullName}
                            checked={primaryRepo === repo.fullName}
                            onChange={() => setPrimaryRepo(repo.fullName)}
                          />
                          {repo.fullName}
                        </label>
                      ))}
                    </div>
                  </div>

                  {repos.length > 1 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-frost">Sub-repositories</p>
                      <div className="space-y-2">
                        {repos
                          .filter((repo) => repo.fullName !== primaryRepo)
                          .map((repo) => (
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

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={submitting || repos.length === 0}>
              {submitting ? "Creating…" : "Create project"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("github")}>
              Back
            </Button>
          </div>
        </form>
      ) : null}
    </HubLayout>
  );
}
