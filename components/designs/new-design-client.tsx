"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDesignSession, fetchDesign, fetchProject } from "@/lib/api";
import { appRoute } from "@/lib/config";
import type { Project } from "@/lib/features/types";
import { designSessionPath } from "@/src/features/designs";

export function NewDesignClient({
  projectId,
  featureId,
  actionItemId,
  reopenDesignId,
}: {
  projectId: string;
  featureId?: string;
  actionItemId?: string;
  /** Set when re-opening a saved design (ADR 020 item 5) — prefills the form. */
  reopenDesignId?: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, existing] = await Promise.all([
          fetchProject(projectId),
          reopenDesignId ? fetchDesign(projectId, reopenDesignId) : Promise.resolve(null),
        ]);
        if (!active) return;
        setProject(projectData);
        if (existing) {
          setName(existing.design.name);
          // The slug is what selects the existing `designs/<slug>/` folder and
          // its index row, so it is carried through rather than re-derived
          // from a name the user may edit (ADR 020 item 2).
          setSlug(existing.design.slug);
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
  }, [projectId, reopenDesignId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const session = await createDesignSession(projectId, {
        name,
        description,
        slug,
        featureId,
        actionItemId,
      });
      router.push(appRoute(designSessionPath(projectId, session.id)));
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
          <Link className="text-sm text-shadow hover:text-frost" href={appRoute(`/projects/${projectId}/designs`)}>
            ← All designs
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-frost">
            {reopenDesignId ? "Continue a design session" : "Start a design session"}
          </h1>
          <p className="mt-2 text-sm text-mist">
            {reopenDesignId ? (
              <>
                The agent will read the existing{" "}
                <code className="rounded bg-surface-02 px-1 font-mono text-xs">
                  designs/{slug ?? "…"}/
                </code>{" "}
                folder and iterate on it rather than starting a new one.
              </>
            ) : (
              "Describe the page or interaction you want to explore. The agent will create a live HTML mockup."
            )}
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
