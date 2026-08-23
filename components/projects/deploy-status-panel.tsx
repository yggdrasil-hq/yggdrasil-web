"use client";

import { useEffect, useState } from "react";
import { fetchDeployStatus, triggerDeploy } from "@/lib/api";
import type { DeployStatus } from "@/lib/features/types";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 3000;

interface DeployStatusPanelProps {
  projectId: string;
}

/**
 * Project-level feedback for the always-on primary deployment's `deploy`
 * job (ADR 013 addendum) — previously nothing on the frontend surfaced
 * this at all. Unlike BuildProgressPanel, `deploy` jobs carry no curated
 * event stream (the Orchestrator runs `runDeploy` synchronously in-process
 * and reports only job status + last_error), so this polls the plain
 * status endpoint rather than an events feed, and always polls (not just
 * while a deploy is in flight) so a deploy kicked off elsewhere — a push
 * to main, another tab's "Deploy now" — still shows up here.
 */
export function DeployStatusPanel({ projectId }: DeployStatusPanelProps) {
  const [deploy, setDeploy] = useState<DeployStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const data = await fetchDeployStatus(projectId);
        if (active) setDeploy(data);
      } catch {
        // Transient poll failures are ignored, same as BuildProgressPanel:
        // the next tick retries and the last known state stays on screen.
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [projectId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  async function handleTrigger() {
    setTriggering(true);
    setError(null);
    try {
      await triggerDeploy(projectId);
      setDeploy(await fetchDeployStatus(projectId));
    } catch (triggerError) {
      setError(triggerError instanceof Error ? triggerError.message : "Failed to start deploy");
    } finally {
      setTriggering(false);
    }
  }

  if (!deploy) {
    return null;
  }

  const inFlight = deploy.status === "pending" || deploy.status === "running";
  const startedAt = deploy.startedAt ? new Date(deploy.startedAt).getTime() : null;

  return (
    <section className="rounded-card border border-rime bg-surface-01 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-frost">Deployment</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={triggering || inFlight}
          onClick={() => void handleTrigger()}
        >
          {triggering ? "Starting…" : inFlight ? "Deploying…" : "Deploy now"}
        </Button>
      </div>

      <div className="mt-4">{renderStatus(deploy, inFlight, startedAt, now)}</div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}

function renderStatus(
  deploy: DeployStatus,
  inFlight: boolean,
  startedAt: number | null,
  now: number,
) {
  if (inFlight) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-rime-soft bg-surface-02 p-4">
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist" />
        </span>
        <p className="text-sm text-mist">
          {startedAt ? `Deploying… (${formatElapsed(now - startedAt)} elapsed)` : "Deploying…"}
        </p>
      </div>
    );
  }

  if (deploy.status === "failed") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-sm text-frost">Last deploy failed.</p>
        {deploy.lastError && (
          <p className="mt-2 rounded-md bg-surface-02 p-3 font-mono text-xs text-red-400">
            {deploy.lastError}
          </p>
        )}
      </div>
    );
  }

  if (deploy.status === "completed") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-emerald-300">
          Deployed
          {deploy.completedAt ? ` ${formatRelative(now - new Date(deploy.completedAt).getTime())}` : ""}.
        </p>
        <a
          href={deploy.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-teal hover:underline"
        >
          Open deployment ↗
        </a>
      </div>
    );
  }

  if (deploy.status === "cancelled") {
    return <p className="text-sm text-mist">Last deploy was cancelled.</p>;
  }

  return <p className="text-sm text-mist">Not deployed yet.</p>;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatRelative(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return "just now";
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
