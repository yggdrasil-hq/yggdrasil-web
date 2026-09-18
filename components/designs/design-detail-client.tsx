"use client";

import { ErrorMessage } from "@/components/ui/error-message";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import { fetchDesign, fetchProject } from "@/lib/api";
import { appRoute } from "@/lib/config";
import type {
  Design,
  DesignSessionSummary,
  Project,
} from "@/lib/features/types";
import {
  designFolderPath,
  designSessionPath,
  designStatusLabel,
  formatDesignDate,
  reopenDesignPath,
  sessionAttentionLabel,
} from "@/src/features/designs";
import { LoadFailure } from "@/components/ui/load-failure";

/**
 * One design's history (ADR 020 item 6). Shows the index metadata and every
 * session that has worked on it, so "what happened to this design?" is
 * answerable without reading the repo.
 *
 * The mockup itself is not embedded: it lives in the repository and is viewed
 * through the draft PR (ADR 020 item 2).
 */
export function DesignDetailClient({
  projectId,
  designId,
}: {
  projectId: string;
  designId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [sessions, setSessions] = useState<DesignSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, detail] = await Promise.all([
          fetchProject(projectId),
          fetchDesign(projectId, designId),
        ]);
        if (!active) return;
        setProject(projectData);
        setDesign(detail.design);
        setSessions(detail.sessions);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load design",
          );
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [projectId, designId]);

  if (error && !project) {
    return (
      <LoadFailure message={error} subject="design" />
    );
  }
  if (!project || !design) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading design…
      </div>
    );
  }

  const attention = sessionAttentionLabel(sessions[0] ?? null);

  return (
    <AppShell project={project}>
      <main className="mx-auto w-full max-w-content px-4 py-8 sm:px-6 lg:px-8">
        <Link
          className="text-sm text-shadow hover:text-frost"
          href={appRoute(`/projects/${projectId}/designs`)}
        >
          ← All designs
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-frost">{design.name}</h1>
            <p className="mt-1 font-mono text-xs text-shadow">
              {designFolderPath(design.slug)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {design.prUrl && (
              <Button variant="outline" asChild>
                <a href={design.prUrl} target="_blank" rel="noreferrer noopener">
                  View draft PR
                </a>
              </Button>
            )}
            <Button asChild>
              <Link href={appRoute(reopenDesignPath(projectId, design.id))}>
                {design.status === "finalized" ? "Iterate on this design" : "Continue this design"}
              </Link>
            </Button>
          </div>
        </div>

        {error && <ErrorMessage className="mt-4 text-sm text-red-400">{error}</ErrorMessage>}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label="Status" value={designStatusLabel(design.status)} />
          <Fact
            label="Finalized"
            value={design.finalizedAt ? formatDesignDate(design.finalizedAt) : "Not yet"}
          />
          <Fact label="Created" value={formatDesignDate(design.createdAt)} />
          <Fact label="Updated" value={formatDesignDate(design.updatedAt)} />
        </dl>

        <p className="mt-4 rounded-card border border-rime bg-surface-01 p-4 text-xs text-mist">
          The mockup files are committed in the repository under{" "}
          <code className="font-mono">{designFolderPath(design.slug)}</code>. Re-opening
          this design starts a new session that reads those files and iterates on them,
          rather than starting a second folder.
        </p>

        <h2 className="mt-8 text-base font-semibold text-frost">Sessions</h2>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-shadow">
            No session has run for this design yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sessions.map((session, index) => {
              const note = sessionAttentionLabel(session);
              return (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-rime bg-surface-01 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-frost">
                      {index === 0 ? "Latest session" : "Earlier session"}
                      <span className="ml-2 text-xs text-shadow">{session.status}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-shadow">
                      {formatDesignDate(session.createdAt)}
                    </p>
                    {note && <p className="mt-1 text-xs text-amber-300">{note}</p>}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={appRoute(designSessionPath(projectId, session.id))}>
                      Open transcript
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {attention && sessions.length > 0 && (
          <p className="mt-3 text-xs text-shadow">
            A design's status records whether it was ever committed; the newest
            session's outcome is shown above and is not merged into it.
          </p>
        )}
      </main>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-shadow">{label}</dt>
      <dd className="mt-1 text-sm text-frost">{value}</dd>
    </div>
  );
}
