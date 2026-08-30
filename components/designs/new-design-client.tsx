"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDesignSession, fetchProject } from "@/lib/api";
import { appRoute } from "@/lib/config";
import type { Project } from "@/lib/features/types";

export function NewDesignClient({
  projectId,
  featureId,
  actionItemId,
}: {
  projectId: string;
  featureId?: string;
  actionItemId?: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void fetchProject(projectId)
      .then(setProject)
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : "Failed to load project"),
      );
  }, [projectId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const session = await createDesignSession(projectId, {
        name,
        description,
        featureId,
        actionItemId,
      });
      router.push(appRoute(`/projects/${projectId}/designs/${session.id}`));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to start design session");
      setCreating(false);
    }
  }

  if (error && !project) {
    return <div className="flex min-h-screen items-center justify-center text-red-400">{error}</div>;
  }
  if (!project) {
    return <div className="flex min-h-screen items-center justify-center text-mist">Loading project…</div>;
  }

  return (
    <AppShell project={project}>
      <main className="mx-auto w-full max-w-content px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <Link className="text-sm text-shadow hover:text-frost" href={appRoute(`/projects/${projectId}`)}>
            ← Back to project
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-frost">Start a design session</h1>
          <p className="mt-2 text-sm text-mist">
            Describe the page or interaction you want to explore. The agent will create a live HTML mockup.
          </p>
          <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block text-sm text-mist">
              Name
              <Input className="mt-2" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="block text-sm text-mist">
              Brief
              <textarea
                className="mt-2 min-h-36 w-full rounded-md border border-rime bg-surface-02 px-3 py-2 text-sm text-frost outline-none placeholder:text-shadow focus:border-mist"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Design a responsive checkout flow with an address form and confirmation state."
                required
              />
            </label>
            {project.status !== "ready" && (
              <p className="text-sm text-amber-300">Complete project initialization before starting designs.</p>
            )}
            {!project.hasDesignSurface && project.status === "ready" && (
              <p className="text-sm text-amber-300">This project was not configured with a user-facing design surface.</p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button
              type="submit"
              disabled={creating || project.status !== "ready" || !project.hasDesignSurface}
            >
              {creating ? "Starting…" : "Start design session"}
            </Button>
          </form>
        </div>
      </main>
    </AppShell>
  );
}
