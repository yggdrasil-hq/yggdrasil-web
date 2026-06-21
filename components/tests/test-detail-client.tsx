"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { TestForm } from "@/components/tests/test-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchProject, fetchTest, updateTest } from "@/lib/api";
import type { Project, Test } from "@/lib/features/types";
import { appRoute } from "@/lib/config";
import { presetLabel } from "@/lib/tests/schedules";

interface TestDetailClientProps {
  projectId: string;
  testId: string;
}

export function TestDetailClient({ projectId, testId }: TestDetailClientProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [projectData, testData] = await Promise.all([
          fetchProject(projectId),
          fetchTest(projectId, testId),
        ]);
        if (active) {
          setProject(projectData);
          setTest(testData);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load test",
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [projectId, testId]);

  async function handleSave(input: {
    name: string;
    specMarkdown: string;
    scheduleCron: string;
    enabled: boolean;
  }) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateTest(projectId, testId, input);
      setTest(updated);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save test");
    } finally {
      setSaving(false);
    }
  }

  if (error && !test) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        {error}
      </div>
    );
  }

  if (!project || !test) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading test…
      </div>
    );
  }

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <Button variant="ghost" className="mb-3 w-fit px-0 text-mist hover:text-frost" asChild>
          <Link href={appRoute(`/projects/${projectId}/tests`)}>← Back to tests</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">
            {test.name}
          </h1>
          <span
            className={
              test.enabled
                ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300"
                : "rounded-full bg-surface-03 px-2 py-0.5 text-xs font-medium text-shadow"
            }
          >
            {test.enabled ? "Enabled" : "Paused"}
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run status</CardTitle>
              <CardDescription>
                Schedule: {presetLabel(test.scheduleCron)}
              </CardDescription>
              <CardDescription>
                {test.lastRunAt
                  ? `Last run ${formatDistanceToNow(new Date(test.lastRunAt), { addSuffix: true })}`
                  : "No runs yet — scheduled runs will start once the Orchestrator is connected."}
              </CardDescription>
            </CardHeader>
          </Card>

          <TestForm
            key={test.updatedAt}
            initialName={test.name}
            initialSpecMarkdown={test.specMarkdown}
            initialScheduleCron={test.scheduleCron}
            initialEnabled={test.enabled}
            submitLabel={saving ? "Saving…" : "Save changes"}
            submitting={saving}
            disableSubmitUnlessDirty
            error={error}
            onSubmit={handleSave}
          />

          {saved ? <p className="text-sm text-emerald-300">Changes saved.</p> : null}
        </div>
      </main>
    </AppShell>
  );
}
