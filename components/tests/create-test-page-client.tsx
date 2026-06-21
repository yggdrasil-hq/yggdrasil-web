"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { TestForm } from "@/components/tests/test-form";
import { Button } from "@/components/ui/button";
import { createTest, fetchProject } from "@/lib/api";
import type { Project } from "@/lib/features/types";
import { appRoute } from "@/lib/config";
import { DEFAULT_TEST_SPEC } from "@/lib/tests/schedules";

interface CreateTestPageClientProps {
  projectId: string;
}

export function CreateTestPageClient({ projectId }: CreateTestPageClientProps) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const projectData = await fetchProject(projectId);
        if (active) {
          setProject(projectData);
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

  async function handleSubmit(input: {
    name: string;
    specMarkdown: string;
    scheduleCron: string;
    enabled: boolean;
  }) {
    setSubmitting(true);
    setError(null);
    try {
      const test = await createTest(projectId, input);
      router.push(appRoute(`/projects/${projectId}/tests/${test.id}`));
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to create test",
      );
    } finally {
      setSubmitting(false);
    }
  }

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
        Loading…
      </div>
    );
  }

  if (project.status !== "ready") {
    return (
      <AppShell project={project}>
        <main className="mx-auto max-w-content px-4 py-12 text-center sm:px-6">
          <p className="text-mist">
            Complete project initialization before defining tests.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href={appRoute(`/projects/${projectId}`)}>Back to project home</Link>
          </Button>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <Button variant="ghost" className="mb-3 w-fit px-0 text-mist hover:text-frost" asChild>
          <Link href={appRoute(`/projects/${projectId}/tests`)}>← Back to tests</Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">
          New test
        </h1>
        <p className="mt-1 text-sm text-mist">
          Each <code className="text-frost">##</code> heading is a subtask the agent runs in
          order.
        </p>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content">
          <TestForm
            initialName=""
            initialSpecMarkdown={DEFAULT_TEST_SPEC}
            initialScheduleCron="0 9 * * *"
            initialEnabled
            submitLabel={submitting ? "Creating…" : "Create test"}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
          />
        </div>
      </main>
    </AppShell>
  );
}
