"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { createProject, fetchFeatures } from "@/lib/api";
import { appRoute, oauthStartUrl } from "@/lib/config";

interface SubRepoFields {
  id: string;
  githubOwner: string;
  githubRepo: string;
}

function emptySubRepo(): SubRepoFields {
  return {
    id: crypto.randomUUID(),
    githubOwner: "",
    githubRepo: "",
  };
}

export function CreateProjectPageClient() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [primaryOwner, setPrimaryOwner] = useState(user?.githubLogin ?? "");
  const [primaryRepo, setPrimaryRepo] = useState("");
  const [subRepos, setSubRepos] = useState<SubRepoFields[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addSubRepo() {
    setSubRepos((current) => [...current, emptySubRepo()]);
  }

  function removeSubRepo(id: string) {
    setSubRepos((current) => current.filter((repo) => repo.id !== id));
  }

  function updateSubRepo(id: string, field: "githubOwner" | "githubRepo", value: string) {
    setSubRepos((current) =>
      current.map((repo) => (repo.id === id ? { ...repo, [field]: value } : repo)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const owner = primaryOwner.trim();
    const repo = primaryRepo.trim();

    if (!trimmedName) {
      setError("Project name is required.");
      return;
    }
    if (!owner || !repo) {
      setError("Primary repository owner and name are required.");
      return;
    }

    const repositories = [
      { githubOwner: owner, githubRepo: repo, isPrimary: true },
      ...subRepos
        .map((subRepo) => ({
          githubOwner: subRepo.githubOwner.trim(),
          githubRepo: subRepo.githubRepo.trim(),
          isPrimary: false,
        }))
        .filter((subRepo) => subRepo.githubOwner && subRepo.githubRepo),
    ];

    setSubmitting(true);
    try {
      const project = await createProject({
        name: trimmedName,
        description: description.trim(),
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
      description="Link a primary repository and any sub-repositories the agent should clone together."
    >
      {!user?.githubConnected ? (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-base">Connect GitHub first</CardTitle>
            <CardDescription>
              Yggdrasil needs GitHub access to clone repositories and open pull requests.
              Connect your account in Settings, then return here to create a project.
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="outline">
                <Link href={appRoute("/settings/account")}>Account settings</Link>
              </Button>
              <Button asChild>
                <a href={oauthStartUrl("link")}>Connect GitHub</a>
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Primary repository</CardTitle>
            <CardDescription>
              Branches and pull requests will be opened on this repo.
            </CardDescription>
          </CardHeader>
          <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="primary-owner" className="text-sm font-medium text-frost">
                Owner
              </label>
              <Input
                id="primary-owner"
                value={primaryOwner}
                onChange={(event) => setPrimaryOwner(event.target.value)}
                placeholder="yggdrasil-hq"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="primary-repo" className="text-sm font-medium text-frost">
                Repository
              </label>
              <Input
                id="primary-repo"
                value={primaryRepo}
                onChange={(event) => setPrimaryRepo(event.target.value)}
                placeholder="yggdrasil-core"
                required
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Sub-repositories</CardTitle>
              <CardDescription>
                Optional linked repos cloned alongside the primary on every job.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addSubRepo}>
              <Plus className="size-4" />
              Add repo
            </Button>
          </CardHeader>
          <div className="space-y-4 px-4 pb-4">
            {subRepos.length === 0 ? (
              <p className="text-sm text-shadow">No sub-repositories added.</p>
            ) : (
              subRepos.map((subRepo) => (
                <div key={subRepo.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={subRepo.githubOwner}
                    onChange={(event) =>
                      updateSubRepo(subRepo.id, "githubOwner", event.target.value)
                    }
                    placeholder="Owner"
                  />
                  <Input
                    value={subRepo.githubRepo}
                    onChange={(event) =>
                      updateSubRepo(subRepo.id, "githubRepo", event.target.value)
                    }
                    placeholder="Repository"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSubRepo(subRepo.id)}
                    aria-label="Remove sub-repository"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create project"}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href={appRoute("/projects")}>Cancel</Link>
          </Button>
        </div>
      </form>
    </HubLayout>
  );
}
