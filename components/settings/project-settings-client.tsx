"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Select } from "@/components/ui/select";
import {
  addProjectRepository,
  clearProjectJobModelOverride,
  deleteProject,
  deleteProjectSecret,
  fetchOrgExtensions,
  fetchOrgModels,
  fetchProject,
  fetchProjectJobModelOverrides,
  fetchProjectSecrets,
  ProjectDeletionBlockedError,
  removeProjectRepository,
  setProjectJobModelOverride,
  setProjectUploadedExtensionsEnabled,
  upsertProjectSecret,
  type ProjectDeletionBlocker,
} from "@/lib/api";
import { ModelSecretField } from "@/components/settings/model-secret-field";
import { ProjectNotificationMuteCard } from "@/components/settings/project-notification-mute";
import { TRUST_WARNING_SHORT, projectLoadState } from "@/lib/features/extensions";
import { appRoute } from "@/lib/config";
import { AGENT_JOB_KINDS, AGENT_JOB_KIND_LABELS } from "@/lib/features/types";
import type {
  AgentJobKind,
  ModelSecretKey,
  OrgModel,
  Project,
  ProjectJobModelOverride,
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
  const router = useRouter();
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBlocker, setDeleteBlocker] = useState<ProjectDeletionBlocker | null>(null);
  // Whether this project has its own model-config bundle or inherits the
  // account default (ADR 007) — derived once from the loaded secrets, then
  // toggled locally by "Switch to custom" before any field has been saved.
  const [modelConfigMode, setModelConfigMode] = useState<"inherited" | "custom">("inherited");
  const [reverting, setReverting] = useState(false);
  const [orgModels, setOrgModels] = useState<OrgModel[]>([]);
  const [jobOverrides, setJobOverrides] = useState<ProjectJobModelOverride[]>([]);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState<AgentJobKind | null>(null);

  // ADR 025: this project's opt-in for organization-uploaded extensions. The
  // count is best-effort: the extension list is admin-only, so a project owner
  // who is not an org admin gets a 403 there — which is why the copy
  // distinguishes "unknown" from "none" (see lib/features/extensions.ts).
  const [savingExtensions, setSavingExtensions] = useState(false);
  const [extensionsError, setExtensionsError] = useState<string | null>(null);
  const [orgExtensionCount, setOrgExtensionCount] = useState<number | null>(null);

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
        const [models, overrides] = await Promise.all([
          fetchOrgModels(projectData.organizationId),
          fetchProjectJobModelOverrides(projectId),
        ]);
        if (active) {
          setOrgModels(models);
          setJobOverrides(overrides);
        }

        // Best-effort, and deliberately not part of the Promise.all above: the
        // extension list is org-admin-only, so a project owner who is not an
        // admin gets a 403. That must not fail the whole settings page — the
        // toggle they *can* use is still worth rendering.
        try {
          const extensionResponse = await fetchOrgExtensions(projectData.organizationId);
          if (active) {
            setOrgExtensionCount(extensionResponse.extensions.filter((item) => item.active).length);
          }
        } catch {
          if (active) setOrgExtensionCount(null);
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

  async function handleToggleExtensions(enabled: boolean) {
    setSavingExtensions(true);
    setExtensionsError(null);
    try {
      const updated = await setProjectUploadedExtensionsEnabled(projectId, enabled);
      setProject(updated);
    } catch (toggleError) {
      setExtensionsError(
        toggleError instanceof Error ? toggleError.message : "Failed to change extension loading",
      );
    } finally {
      setSavingExtensions(false);
    }
  }

  async function handleSelectOverride(jobKind: AgentJobKind, modelId: string) {
    setSavingOverride(jobKind);
    setOverrideError(null);
    try {
      if (!modelId) {
        await clearProjectJobModelOverride(projectId, jobKind);
        setJobOverrides((current) => current.filter((o) => o.jobKind !== jobKind));
        return;
      }
      const updated = await setProjectJobModelOverride(projectId, jobKind, modelId);
      setJobOverrides((current) => [...current.filter((o) => o.jobKind !== jobKind), updated]);
    } catch (saveError) {
      setOverrideError(saveError instanceof Error ? saveError.message : "Failed to set override");
    } finally {
      setSavingOverride(null);
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

  async function handleDeleteProject() {
    setDeleting(true);
    setDeleteError(null);
    setDeleteBlocker(null);

    try {
      await deleteProject(projectId);
      router.push(appRoute("/projects"));
    } catch (deleteProjectError) {
      if (deleteProjectError instanceof ProjectDeletionBlockedError) {
        setDeleteBlocker(deleteProjectError.blocker);
      } else {
        setDeleteError(
          deleteProjectError instanceof Error
            ? deleteProjectError.message
            : "Failed to delete project",
        );
      }
      setDeleting(false);
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
              <CardTitle>Uploaded extensions</CardTitle>
              <CardDescription>
                {project
                  ? projectLoadState(project, orgExtensionCount).label
                  : "Whether this project's Pi jobs load extensions your organization uploaded."}
              </CardDescription>
            </CardHeader>
            <div className="space-y-3 px-4 pb-4">
              <p className="text-xs text-shadow">{TRUST_WARNING_SHORT}</p>
              {extensionsError ? (
                <p className="text-xs text-red-400">{extensionsError}</p>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-frost">
                <input
                  type="checkbox"
                  checked={project?.uploadedExtensionsEnabled ?? false}
                  disabled={!project || savingExtensions}
                  onChange={(event) => void handleToggleExtensions(event.target.checked)}
                />
                Load organization extensions in this project
              </label>
              <p className="text-xs text-shadow">
                Administered at{" "}
                <Link
                  className="underline"
                  href={appRoute(
                    project
                      ? `/settings/organization/extensions?org=${project.organizationId}`
                      : "/settings/organization/extensions",
                  )}
                >
                  Organization settings → Extensions
                </Link>
                . Changing this affects jobs dispatched from now on; a job already running keeps the
                revision it started with.
              </p>
            </div>
          </Card>

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
                    Using your <span className="text-frost">organization&apos;s</span> model
                    configuration (per job kind — see below), unless overridden here with a fully
                    custom connection.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={appRoute("/settings/organization/providers")}>
                        View organization defaults
                      </Link>
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
                        {reverting ? "Reverting…" : "Revert to organization default"}
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

          {modelConfigMode === "inherited" ? (
            <Card>
              <CardHeader>
                <CardTitle>Per-job-kind overrides</CardTitle>
                <CardDescription>
                  Pick a different model from your organization&apos;s catalog for a specific job
                  kind, without setting up a fully custom connection.
                </CardDescription>
              </CardHeader>
              <div className="space-y-3 px-4 pb-4">
                {AGENT_JOB_KINDS.map((jobKind) => {
                  const current = jobOverrides.find((o) => o.jobKind === jobKind);
                  return (
                    <div key={jobKind} className="rounded-md border border-rime p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-frost">
                          {AGENT_JOB_KIND_LABELS[jobKind]}
                        </span>
                        <span className="font-mono text-xs text-shadow">{jobKind}</span>
                      </div>
                      <Select
                        className="mt-3"
                        // The `<span>` above is the visible label but is not
                        // associated with this control, so it would otherwise
                        // have no accessible name — five unnamed "combo boxes"
                        // in a row, one per job kind.
                        aria-label={`Model for ${AGENT_JOB_KIND_LABELS[jobKind]}`}
                        value={current?.modelId ?? ""}
                        disabled={savingOverride === jobKind}
                        onChange={(e) => void handleSelectOverride(jobKind, e.target.value)}
                      >
                        <option value="">Inherit organization default</option>
                        {orgModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName} — {model.providerName}
                          </option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
                {overrideError ? (
                  <p className="text-sm text-destructive">{overrideError}</p>
                ) : null}
              </div>
            </Card>
          ) : null}

          <ProjectNotificationMuteCard
            projectId={projectId}
            organizationId={project.organizationId}
          />

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>More settings coming soon</CardTitle>
              <CardDescription>
                Build commands, tool allowlists, and agent timeouts will be configurable here.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>
                Deleting this project permanently removes its features, tests, runs, and
                secrets. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <div className="flex justify-end px-6 pb-6">
              <Button
                variant="destructive"
                onClick={() => {
                  setDeleteDialogOpen(true);
                  setDeleteConfirmText("");
                  setDeleteError(null);
                  setDeleteBlocker(null);
                }}
              >
                Delete project
              </Button>
            </div>
          </Card>
        </div>
      </AppShell>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleting) {
            setDeleteDialogOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {project.name}</DialogTitle>
            <DialogDescription>
              This will permanently delete the <strong>{project.name}</strong> project,
              including all of its features, tests, runs, and secrets. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="delete-confirm" className="text-sm text-mist">
              Type <span className="font-mono font-semibold text-frost">delete</span> to
              confirm.
            </label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              disabled={deleting}
            />
            {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
            {deleteBlocker ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{deleteBlocker.reason}</p>
                {deleteBlocker.features.length > 0 ? (
                  <ul className="space-y-1">
                    {deleteBlocker.features.map((feature) => (
                      <li key={feature.id} className="text-sm">
                        <Link
                          href={appRoute(
                            `/projects/${projectId}/features/${feature.id}`,
                          )}
                          className="text-primary hover:underline"
                        >
                          {feature.title}
                        </Link>{" "}
                        <span className="text-mist">— {feature.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {deleteBlocker.testRuns.length > 0 ? (
                  <ul className="space-y-1">
                    {deleteBlocker.testRuns.map((testRun) =>
                      testRun.testId ? (
                        <li key={testRun.jobId} className="text-sm">
                          <Link
                            href={appRoute(
                              `/projects/${projectId}/tests/${testRun.testId}`,
                            )}
                            className="text-primary hover:underline"
                          >
                            View active test run
                          </Link>
                        </li>
                      ) : (
                        <li key={testRun.jobId} className="text-sm text-mist">
                          An active test run is still going.
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "delete" || deleting}
              onClick={handleDeleteProject}
            >
              {deleting ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
