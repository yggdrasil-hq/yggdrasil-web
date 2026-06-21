"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { completeProjectInit, fetchProject, fetchTests } from "@/lib/api";
import type { Project, Test } from "@/lib/features/types";
import { appRoute } from "@/lib/config";
import { presetLabel } from "@/lib/tests/schedules";

interface TestsPageClientProps {
  projectId: string;
}

export function TestsPageClient({ projectId }: TestsPageClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [completingInit, setCompletingInit] = useState(false);

  async function handleCompleteInit() {
    setCompletingInit(true);
    setError(null);
    try {
      const updated = await completeProjectInit(projectId);
      setProject(updated);
    } catch (initError) {
      setError(
        initError instanceof Error ? initError.message : "Failed to complete setup",
      );
    } finally {
      setCompletingInit(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, testsData] = await Promise.all([
          fetchProject(projectId),
          fetchTests(projectId),
        ]);
        if (active) {
          setProject(projectData);
          setTests(testsData);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load tests",
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [projectId]);

  if (error && !project) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        {error}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading tests…
      </div>
    );
  }

  const canCreate = project.status === "ready";

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">
              Project
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">
              Tests
            </h1>
            <p className="mt-1 text-sm text-mist">
              Scheduled verification scenarios run against main on an interval.
            </p>
          </div>

          {canCreate ? (
            <Button asChild className="gap-2">
              <Link href={appRoute(`/projects/${projectId}/tests/new`)}>
                <Plus className="size-4" />
                New test
              </Link>
            </Button>
          ) : (
            <Button
              className="gap-2"
              disabled={completingInit}
              onClick={() => void handleCompleteInit()}
            >
              <Plus className="size-4" />
              {completingInit ? "Completing setup…" : "Complete setup to add tests"}
            </Button>
          )}
        </div>

        {!canCreate ? (
          <div className="mt-4 rounded-card border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-frost">
            Finish project initialization before creating tests. Until the Orchestrator
            is connected, you can mark setup complete manually.
          </div>
        ) : null}
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content">
          {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

          {tests.length === 0 ? (
            <Card className="border-dashed">
              <div className="flex flex-col items-center px-6 py-12 text-center sm:px-10 sm:py-16">
                <CardTitle className="text-xl">No tests yet</CardTitle>
                <CardDescription className="mt-4 max-w-md text-base leading-relaxed line-clamp-none">
                  Define markdown scenarios with{" "}
                  <code className="text-frost">##</code> subtasks. The agent runs them on
                  schedule against an ephemeral main-branch preview.
                </CardDescription>
                {canCreate ? (
                  <Button asChild className="mt-8">
                    <Link href={appRoute(`/projects/${projectId}/tests/new`)}>
                      Create test
                    </Link>
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : (
            <ul className="grid gap-4">
              {tests.map((test) => (
                <li key={test.id}>
                  <Link
                    href={appRoute(`/projects/${projectId}/tests/${test.id}`)}
                    className="block"
                  >
                    <Card className="transition-colors hover:border-rime hover:bg-surface-02">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <CardTitle className="text-lg">{test.name}</CardTitle>
                          <span
                            className={
                              test.enabled
                                ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300"
                                : "rounded-full bg-surface-03 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-shadow"
                            }
                          >
                            {test.enabled ? "Enabled" : "Paused"}
                          </span>
                        </div>
                        <CardDescription>{presetLabel(test.scheduleCron)}</CardDescription>
                        {test.lastRunAt ? (
                          <CardDescription>
                            Last run{" "}
                            {formatDistanceToNow(new Date(test.lastRunAt), {
                              addSuffix: true,
                            })}
                          </CardDescription>
                        ) : (
                          <CardDescription>No runs yet</CardDescription>
                        )}
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppShell>
  );
}
