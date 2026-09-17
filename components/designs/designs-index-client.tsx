"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchDesigns, fetchProject } from "@/lib/api";
import { appRoute } from "@/lib/config";
import type { Design, DesignStatus, Project } from "@/lib/features/types";
import {
  DEFAULT_DESIGN_FILTERS,
  designFolderPath,
  designRoutePath,
  designSessionPath,
  designStatusCounts,
  designStatusLabel,
  filterDesigns,
  formatDesignDate,
  reopenDesignPath,
  sessionAttentionLabel,
  sortDesignsByRecency,
} from "@/src/features/designs";

type StatusFilter = DesignStatus | "all";

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "In progress" },
  { id: "finalized", label: "Finalized" },
];

/**
 * Design browse/history (ADR 020 item 6, issue #2).
 *
 * This is the index over the `designs` table. The mockups themselves are not
 * rendered here — they live in the repo at `designs/<slug>/` and are viewed
 * through the design's draft PR (ADR 020 item 2: the repo is the source of
 * truth for the artifact, so this page deliberately does not become a second
 * one).
 */
export function DesignsIndexClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, designData] = await Promise.all([
          fetchProject(projectId),
          fetchDesigns(projectId),
        ]);
        if (!active) return;
        setProject(projectData);
        setDesigns(designData.designs);
        setLoaded(true);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load designs",
          );
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  const ordered = useMemo(() => sortDesignsByRecency(designs), [designs]);
  const counts = useMemo(() => designStatusCounts(ordered), [ordered]);
  const visible = useMemo(
    () => filterDesigns(ordered, { status, query }),
    [ordered, status, query],
  );

  if (error && !project) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">{error}</div>
    );
  }
  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading designs…
      </div>
    );
  }

  return (
    <AppShell project={project}>
      <main className="mx-auto w-full max-w-content px-4 py-8 sm:px-6 lg:px-8">
        <Link
          className="text-sm text-shadow hover:text-frost"
          href={appRoute(`/projects/${projectId}`)}
        >
          ← Back to project
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-frost">Designs</h1>
            <p className="mt-2 text-sm text-mist">
              Saved mockups for this project. Each one lives in the repository under its own
              <code className="mx-1 rounded bg-surface-02 px-1 font-mono text-xs">designs/&lt;slug&gt;/</code>
              folder.
            </p>
          </div>
          <Button asChild>
            <Link href={appRoute(`/projects/${projectId}/designs/new`)}>New design</Link>
          </Button>
        </div>

        {ordered.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((filter) => {
              const count =
                filter.id === "all"
                  ? ordered.length
                  : counts[filter.id as DesignStatus];
              const active = status === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStatus(filter.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-rime bg-surface-03 text-frost"
                      : "border-rime-soft text-mist hover:bg-surface-02 hover:text-frost"
                  }`}
                >
                  {filter.label} ({count})
                </button>
              );
            })}
            <Input
              className="ml-auto max-w-xs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name or slug…"
            />
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        {loaded && ordered.length === 0 && (
          <EmptyState projectId={projectId} />
        )}

        {ordered.length > 0 && visible.length === 0 && (
          <p className="mt-8 text-sm text-shadow">
            No designs match this filter.
          </p>
        )}

        <ul className="mt-6 space-y-3">
          {visible.map((design) => (
            <DesignRow key={design.id} projectId={projectId} design={design} />
          ))}
        </ul>
      </main>
    </AppShell>
  );
}

function EmptyState({ projectId }: { projectId: string }) {
  return (
    <div className="mt-8 rounded-card border border-rime bg-surface-01 p-6">
      <h2 className="text-base font-semibold text-frost">No designs yet</h2>
      <p className="mt-2 text-sm text-mist">
        Start a design session to create a live HTML mockup the agent can iterate on
        with you.
      </p>
      {/*
        Deliberately explicit about the one gap this index has (ADR 020 item
        7): it is built from design-grill sessions, so a folder committed by
        hand, outside a session, has no row here. There is no GitHub-content
        integration to discover those, and adding one is a much larger feature
        than an index.
      */}
      <p className="mt-2 text-xs text-shadow">
        Designs committed directly to the repository without a session are not listed
        here.
      </p>
      <Button className="mt-4" asChild>
        <Link href={appRoute(`/projects/${projectId}/designs/new`)}>Start a design session</Link>
      </Button>
    </div>
  );
}

function DesignRow({ projectId, design }: { projectId: string; design: Design }) {
  const attention = sessionAttentionLabel(design.latestSession);
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-card border border-rime bg-surface-01 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-frost">
              <Link
                className="hover:underline"
                href={appRoute(designRoutePath(projectId, design.id))}
              >
                {design.name}
              </Link>
            </h2>
            <StatusPill status={design.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-shadow">{designFolderPath(design.slug)}</p>
          {attention && <p className="mt-1 text-xs text-amber-300">{attention}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {design.prUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={design.prUrl} target="_blank" rel="noreferrer noopener">
                View PR
              </a>
            </Button>
          )}
          {design.latestSession && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={appRoute(
                  designSessionPath(projectId, design.latestSession.id),
                )}
              >
                Transcript
              </Link>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link href={appRoute(reopenDesignPath(projectId, design.id))}>
              {design.status === "finalized" ? "Iterate" : "Continue"}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
          >
            {open ? "Less" : "Details"}
          </Button>
        </div>
      </div>

      {open && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-rime-soft pt-3 text-xs sm:grid-cols-4">
          <Detail label="Created" value={formatDesignDate(design.createdAt)} />
          <Detail label="Updated" value={formatDesignDate(design.updatedAt)} />
          <Detail
            label="Finalized"
            value={design.finalizedAt ? formatDesignDate(design.finalizedAt) : "—"}
          />
          <Detail
            label="Sessions"
            value={design.latestSession ? `latest ${design.latestSession.status}` : "none"}
          />
        </dl>
      )}
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-shadow">{label}</dt>
      <dd className="text-mist">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: DesignStatus }) {
  const tone =
    status === "finalized"
      ? "border-emerald-500/40 text-emerald-300"
      : "border-amber-500/40 text-amber-300";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>
      {designStatusLabel(status)}
    </span>
  );
}
