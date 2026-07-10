"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addProjectRepository,
  deleteProjectSecret,
  fetchProject,
  fetchProjectSecrets,
  removeProjectRepository,
  upsertProjectSecret,
} from "@/lib/api";
import { ModelSecretField } from "@/components/settings/model-secret-field";
import { appRoute } from "@/lib/config";
import type {
  ModelSecretKey,
  Project,
  ProjectRepository,
  ProjectSecretMetadata,
} from "@/lib/features/types";

interface ProjectSettingsClientProps {
  projectId: string;
}

interface PendingSubRepo {
  githubOwner: string;
  githubRepo: string;
}

function formatRepository(repo: ProjectRepository): string {
  return `${repo.githubOwner}/${repo.githubRepo}`;
}

const MODEL_SECRET_FIELDS: Array<{
  key: ModelSecretKey;
  label: string;
  description: string;
  placeholder: string;
  masked?: boolean;
}> = [
  {
    key: "MODEL_BASE_URL",
    label: "Model base URL",
    description: "OpenAI-chat-completions-compatible endpoint the agent sends requests to.",
    placeholder: "https://api.openai.com/v1",
  },
  {
    key: "MODEL_API_KEY",
    label: "Model API key",
    description: "Sent as the bearer token on every request to the base URL above.",
    placeholder: "sk-…",
    masked: true,
  },
  {
    key: "MODEL_ID",
    label: "Model ID",
    description: "Model name passed in each request, e.g. gpt-4.1 or claude-sonnet-5.",
    placeholder: "gpt-4.1",
  },
];

export function ProjectSettingsClient({ projectId }: ProjectSettingsClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [secrets, setSecrets] = useState<ProjectSecretMetadata[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingSubRepo, setPendingSubRepo] = useState<PendingSubRepo | null>(null);
  const [adding, setAdding] = useState(false);
  const [removingRepositoryId, setRemovingRepositoryId] = useState<string | null>(null);
  const [confirmRemoveRepositoryId, setConfirmRemoveRepositoryId] = useState<string | null>(
    null,
  );
  // Whether this project has its own model-config bundle or inherits the
  // account default (ADR 007) — derived once from the loaded secrets, then
  // toggled locally by "Switch to custom" before any field has been saved.
  const [modelConfigMode, setModelConfigMode] = useState<"inherited" | "custom">("inherited");
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, secretsData] = await Promise.all([
          fetchProject(projectId),
          fetchProjectSecrets(projectId),
        ]);
        if (active) {
          setProject(projectData);
          setSecrets(secretsData);
          setModelConfigMode(secretsData.length > 0 ? "custom" : "inherited");
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load project",
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [projectId]);

  function handleSecretChange(key: ModelSecretKey, metadata: ProjectSecretMetadata | null) {
    setSecrets((current) => {
      const withoutKey = current.filter((secret) => secret.key !== key);
      return metadata ? [...withoutKey, metadata] : withoutKey;
    });
  }

  async function handleRevertToDefault() {
    setReverting(true);
    setActionError(null);
    try {
      await Promise.all(secrets.map((secret) => deleteProjectSecret(projectId, secret.id)));
      setSecrets([]);
      setModelConfigMode("inherited");
    } catch (revertError) {
      setActionError(
        revertError instanceof Error
          ? revertError.message
          : "Failed to revert to account default",
      );
    } finally {
      setReverting(false);
    }
  }

  const primaryRepository = project?.repositories.find((repo) => repo.isPrimary);
  const subRepositories =
    project?.repositories.filter((repo) => !repo.isPrimary) ?? [];
  const removalBlockedReason = project?.repositoryRemovalBlockedReason ?? null;

  function startAddSubRepo() {
    setActionError(null);
    setPendingSubRepo({ githubOwner: "", githubRepo: "" });
  }

  function cancelAddSubRepo() {
    setPendingSubRepo(null);
  }

  async function handleAddSubRepo() {
    if (!pendingSubRepo) {
      return;
    }

    const githubOwner = pendingSubRepo.githubOwner.trim();
    const githubRepo = pendingSubRepo.githubRepo.trim();

    if (!githubOwner || !githubRepo) {
      setActionError("Owner and repository are required.");
      return;
    }

    setAdding(true);
    setActionError(null);

    try {
      const updatedProject = await addProjectRepository(projectId, {
        githubOwner,
        githubRepo,
      });
      setProject(updatedProject);
      setPendingSubRepo(null);
    } catch (addError) {
      setActionError(
        addError instanceof Error ? addError.message : "Failed to add repository",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveSubRepo(repositoryId: string) {
    setRemovingRepositoryId(repositoryId);
    setActionError(null);

    try {
      const updatedProject = await removeProjectRepository(projectId, repositoryId);
      setProject(updatedProject);
      setConfirmRemoveRepositoryId(null);
    } catch (removeError) {
      setActionError(
        removeError instanceof Error ? removeError.message : "Failed to remove repository",
      );
    } finally {
      setRemovingRepositoryId(null);
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-sm text-mist">Loading project settings…</p>
      </div>
    );
  }

  const confirmRemoveRepository = subRepositories.find(
    (repo) => repo.id === confirmRemoveRepositoryId,
  );

  return (
    <TooltipProvider>
      <AppShell project={project}>
        <div className="mx-auto max-w-2xl space-y-6 p-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-frost">Settings</h1>
            <p className="mt-1 text-sm text-mist">
              Configuration for <span className="text-frost">{project.name}</span>
            </p>
          </div>

          {project.githubAccessWarning ? (
            <Card className="border-amber-500/30 bg-amber-500/10">
              <CardHeader>
                <CardTitle>GitHub access needs attention</CardTitle>
                <CardDescription>
                  The GitHub App installation no longer has access to one or more linked
                  repositories. Fix access on GitHub before dispatching new jobs.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {project.modelConfigWarning ? (
            <Card className="border-amber-500/30 bg-amber-500/10">
              <CardHeader>
                <CardTitle>Model configuration needs attention</CardTitle>
                <CardDescription>
                  A recent job couldn&apos;t resolve a model configuration for this project.
                  Set one below, or check your account default.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Primary repository</CardTitle>
              <CardDescription>
                Branches and pull requests are opened on this repo. It cannot be changed after
                project creation.
              </CardDescription>
            </CardHeader>
            {primaryRepository ? (
              <p className="px-4 pb-4 text-sm text-frost">
                {formatRepository(primaryRepository)}
              </p>
            ) : (
              <p className="px-4 pb-4 text-sm text-shadow">No primary repository linked.</p>
            )}
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Sub-repositories</CardTitle>
                <CardDescription>
                  Linked repos cloned alongside the primary on every job.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={startAddSubRepo}
                disabled={pendingSubRepo !== null}
              >
                <Plus className="size-4" />
                Add repo
              </Button>
            </CardHeader>
            <div className="space-y-4 px-4 pb-4">
              {subRepositories.length === 0 && !pendingSubRepo ? (
                <p className="text-sm text-shadow">No sub-repositories added.</p>
              ) : null}

              {subRepositories.map((repo) => (
                <div
                  key={repo.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-rime px-3 py-2"
                >
                  <span className="text-sm text-frost">{formatRepository(repo)}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={
                            removalBlockedReason !== null ||
                            confirmRemoveRepositoryId !== null
                          }
                          onClick={() => {
                            setActionError(null);
                            setConfirmRemoveRepositoryId(repo.id);
                          }}
                          aria-label={`Remove ${formatRepository(repo)}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {removalBlockedReason ? (
                      <TooltipContent>{removalBlockedReason}</TooltipContent>
                    ) : null}
                  </Tooltip>
                </div>
              ))}

              {confirmRemoveRepository ? (
                <div className="space-y-3 rounded-md border border-rime bg-surface-02 p-3">
                  <p className="text-sm text-mist">
                    Remove{" "}
                    <span className="text-frost">
                      {formatRepository(confirmRemoveRepository)}
                    </span>
                    ? Future jobs will not clone this repository.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={removingRepositoryId === confirmRemoveRepository.id}
                      onClick={() => void handleRemoveSubRepo(confirmRemoveRepository.id)}
                    >
                      {removingRepositoryId === confirmRemoveRepository.id
                        ? "Removing…"
                        : "Remove"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removingRepositoryId === confirmRemoveRepository.id}
                      onClick={() => setConfirmRemoveRepositoryId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {pendingSubRepo ? (
                <div className="space-y-3 rounded-md border border-dashed border-rime p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={pendingSubRepo.githubOwner}
                      onChange={(event) =>
                        setPendingSubRepo((current) =>
                          current
                            ? { ...current, githubOwner: event.target.value }
                            : current,
                        )
                      }
                      placeholder="Owner"
                    />
                    <Input
                      value={pendingSubRepo.githubRepo}
                      onChange={(event) =>
                        setPendingSubRepo((current) =>
                          current ? { ...current, githubRepo: event.target.value } : current,
                        )
                      }
                      placeholder="Repository"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={adding}
                      onClick={() => void handleAddSubRepo()}
                    >
                      {adding ? "Adding…" : "Add repository"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={adding}
                      onClick={cancelAddSubRepo}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model configuration</CardTitle>
              <CardDescription>
                Values used by the Pi coding agent for every job in this project. Once saved,
                values are encrypted and never shown again — only whether a value is set.
              </CardDescription>
            </CardHeader>
            <div className="space-y-3 px-4 pb-4">
              {modelConfigMode === "inherited" ? (
                <div className="space-y-3 rounded-md border border-dashed border-rime p-3">
                  <p className="text-sm text-mist">
                    Using your <span className="text-frost">account default</span> model
                    configuration.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={appRoute("/settings")}>View account default</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setModelConfigMode("custom")}
                    >
                      Switch to custom
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-mist">Custom configuration for this project.</p>
                    {secrets.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={reverting}
                        onClick={() => void handleRevertToDefault()}
                      >
                        {reverting ? "Reverting…" : "Revert to account default"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setModelConfigMode("inherited")}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  {MODEL_SECRET_FIELDS.map((field) => (
                    <ModelSecretField
                      key={field.key}
                      secretKey={field.key}
                      label={field.label}
                      description={field.description}
                      placeholder={field.placeholder}
                      masked={field.masked}
                      metadata={secrets.find((secret) => secret.key === field.key) ?? null}
                      onChange={(metadata) => handleSecretChange(field.key, metadata)}
                      onSave={(key, value) => upsertProjectSecret(projectId, key, value)}
                      onDelete={(secretId) => deleteProjectSecret(projectId, secretId)}
                    />
                  ))}
                </>
              )}
              {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
            </div>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>More settings coming soon</CardTitle>
              <CardDescription>
                Build commands, tool allowlists, and agent timeouts will be configurable here.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    </TooltipProvider>
  );
}
