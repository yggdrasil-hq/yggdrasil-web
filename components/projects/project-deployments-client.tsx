"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  fetchDeployHistory,
  fetchDeployStatus,
  fetchProject,
  requestRollback,
  triggerDeploy,
} from "@/lib/api";
import {
  canRollBackTo,
  DEPLOY_KIND_LABELS,
  describeDeploy,
  describeRollbackImpact,
  findTarget,
  isDeploymentInFlight,
  liveDeploymentUrl,
} from "@/lib/features/deploy-history";
import type { DeployHistoryResponse, DeployStatus, Project } from "@/lib/features/types";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 3000;

const filterPills = ["All", "Production", "Preview"] as const;

const envStyles = {
  Production: "bg-bifrost/15 text-bifrost",
  Preview: "bg-aurora/15 text-aurora",
} as const;

const statusDot = {
  ready: "bg-status-approved",
  building: "bg-aurora animate-pulse",
  failed: "bg-red-400",
} as const;

/**
 * A project's deployments page. Ported from ADR 017's static mock: the
 * Production row is now real data (ADR 013's deploy status plus ADR 022's
 * deploy ledger), and the page adds the deploy history and rollback controls
 * that ledger exists to enable.
 *
 * Two mock rows were dropped rather than carried over, both because their
 * questions are now settled rather than pending:
 *  - **Staging** was the visual stand-in for open question #9. ADR 022 settled
 *    that question by *deferring* a staging environment, so keeping a Staging
 *    row would advertise something this decision deliberately does not build.
 *  - Preview's two rows belonged to ADR 003's ephemeral-tunnel design, which
 *    is still unbuilt for a different reason (issue #1) and has nothing to do
 *    with this page's data. The Preview pill and a labelled placeholder are
 *    kept so the route still shows where that work lands.
 */
export function ProjectDeploymentsClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<DeployHistoryResponse | null>(null);
  const [deploy, setDeploy] = useState<DeployStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingRevision, setConfirmingRevision] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [redeploying, setRedeploying] = useState(false);

  const load = useCallback(async () => {
    const [projectData, historyData, statusData] = await Promise.all([
      fetchProject(projectId),
      fetchDeployHistory(projectId),
      fetchDeployStatus(projectId),
    ]);
    setProject(projectData);
    setHistory(historyData);
    setDeploy(statusData);
  }, [projectId]);

  useEffect(() => {
    let active = true;

    async function initial() {
      try {
        await load();
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load deployments");
        }
      }
    }

    void initial();
    return () => {
      active = false;
    };
  }, [load]);

  // Poll only while an operation is in flight: unlike the deploy status panel,
  // this page's content changes through the ledger, which only moves when a
  // deploy finishes. Polling a static page every 3s would be pure noise.
  const inFlight = isDeploymentInFlight(deploy?.status ?? null);
  useEffect(() => {
    if (!inFlight) return;
    const interval = setInterval(() => {
      void load().catch(() => {
        // Transient poll failures are ignored, same as the deploy status
        // panel: the next tick retries and the last known state stays up.
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [inFlight, load]);

  async function handleRollback(revision: number) {
    setRollingBack(true);
    setActionError(null);
    try {
      await requestRollback(projectId, revision);
      setConfirmingRevision(null);
      await load();
    } catch (rollbackError) {
      setActionError(
        rollbackError instanceof Error ? rollbackError.message : "Failed to start rollback",
      );
    } finally {
      setRollingBack(false);
    }
  }

  async function handleRedeploy() {
    setRedeploying(true);
    setActionError(null);
    try {
      await triggerDeploy(projectId);
      await load();
    } catch (redeployError) {
      setActionError(
        redeployError instanceof Error ? redeployError.message : "Failed to start deploy",
      );
    } finally {
      setRedeploying(false);
    }
  }

  if (error && !project) {
    return <div className="flex min-h-screen items-center justify-center text-mist">{error}</div>;
  }

  if (!project || !history || !deploy) {
    return <div className="flex min-h-screen items-center justify-center text-mist">Loading deployments…</div>;
  }

  const liveUrl = liveDeploymentUrl(deploy.status, deploy.url);
  const currentRevision = history.currentRevision;
  const productionStatus = inFlight
    ? { label: "Deploying", tone: "building" as const }
    : deploy.status === "completed"
      ? { label: "Ready", tone: "ready" as const }
      : deploy.status === "failed"
        ? { label: "Failed", tone: "failed" as const }
        : { label: "Not deployed", tone: null };

  const confirmingTarget = confirmingRevision === null
    ? null
    : findTarget(history.rollbackTargets, confirmingRevision);

  return (
    <AppShell project={project}>
      <header className="border-b border-rime-soft px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-shadow">Project</p>
        <h1 className="text-xl font-semibold tracking-tight text-frost sm:text-2xl">Deployments</h1>
        <p className="mt-1 text-sm text-mist">
          The primary deployment, its revision history, and rollback.
        </p>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto max-w-content">
          <div className="mb-6 flex flex-wrap gap-2">
            {filterPills.map((pill) => (
              <span
                key={pill}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  pill === "All"
                    ? "border-bifrost bg-bifrost/10 text-bifrost"
                    : "border-rime bg-surface-01 text-mist",
                )}
              >
                {pill}
              </span>
            ))}
          </div>

          {/* Production — real, from the deploy ledger (ADR 022). */}
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-rime p-4 sm:flex-nowrap">
            <span
              className={cn(
                "inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-wide",
                envStyles.Production,
              )}
            >
              Production
            </span>
            <span className="flex w-[100px] shrink-0 items-center gap-1.5 text-xs text-mist">
              {productionStatus.tone && (
                <span className={cn("size-1.5 shrink-0 rounded-full", statusDot[productionStatus.tone])} />
              )}
              {productionStatus.label}
            </span>
            <div className="order-3 min-w-0 flex-1 basis-full sm:order-none sm:basis-auto">
              {liveUrl ? (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 truncate font-mono text-sm text-frost hover:text-teal"
                >
                  {liveUrl.replace(/^https?:\/\//, "")}
                  <ExternalLink className="size-3 shrink-0 text-shadow" />
                </a>
              ) : (
                <p className="truncate font-mono text-sm text-shadow">
                  {deploy.url.replace(/^https?:\/\//, "")}
                </p>
              )}
              <div className="mt-1 truncate text-xs text-shadow">
                {currentRevision !== null ? (
                  <>
                    Revision <span className="font-mono">{currentRevision}</span>
                  </>
                ) : (
                  "Not deployed yet"
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={redeploying || inFlight || project.status !== "ready"}
                onClick={() => void handleRedeploy()}
              >
                {redeploying ? "Starting…" : "Deploy now"}
              </Button>
            </div>
          </div>

          {/* Preview — still unbuilt (ADR 003's ephemeral tunnel, issue #1);
              kept as an explicit empty state rather than an invented row. */}
          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-rime-soft p-4 sm:flex-nowrap">
            <span
              className={cn(
                "inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-wide",
                envStyles.Preview,
              )}
            >
              Preview
            </span>
            <div className="min-w-0 flex-1 truncate text-xs text-shadow">
              Per-run preview tunnels are designed (ADR 003 §15) but not implemented yet.
            </div>
          </div>

          {inFlight && (
            <p className="mt-4 rounded-md border border-rime-soft bg-surface-02 p-3 text-xs text-mist">
              A deployment operation is in progress. Rollback is unavailable until it finishes —
              rolling back mid-operation would race it on the same release.
            </p>
          )}

          {actionError && (
            <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {actionError}
            </p>
          )}

          <h2 className="mt-8 text-sm font-semibold text-frost">History</h2>
          <p className="mt-1 text-xs text-shadow">
            Every deploy and rollback for this project, newest first. Rolling back replays an
            earlier revision&rsquo;s content as a <em>new</em> revision — the revision you leave
            stays in this list.
          </p>

          {history.deploys.length === 0 ? (
            <p className="mt-4 rounded-md border border-rime-soft bg-surface-01 p-4 text-sm text-mist">
              No deployments recorded yet.
            </p>
          ) : (
            <div className="mt-4 flex flex-col">
              {history.deploys.map((entry) => {
                const rollbackable = canRollBackTo(entry, currentRevision);
                return (
                  <div
                    key={entry.id}
                    className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-rime p-4 first:mt-0 sm:flex-nowrap"
                  >
                    <span
                      className={cn(
                        "inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-wide",
                        entry.kind === "rollback"
                          ? "bg-status-input/15 text-status-input"
                          : "bg-bifrost/15 text-bifrost",
                      )}
                    >
                      {DEPLOY_KIND_LABELS[entry.kind]}
                    </span>
                    <div className="order-3 min-w-0 flex-1 basis-full sm:order-none sm:basis-auto">
                      <p
                        className={cn(
                          "truncate text-sm",
                          entry.status === "failed" ? "text-red-400" : "text-frost",
                        )}
                      >
                        {describeDeploy(entry)}
                      </p>
                      {entry.lastError && (
                        <p className="mt-1 truncate font-mono text-xs text-red-400">
                          {entry.lastError}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-xs text-shadow">
                      {formatTimestamp(entry.createdAt)}
                    </div>
                    <div className="shrink-0">
                      {rollbackable && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rollingBack || inFlight}
                          onClick={() => setConfirmingRevision(entry.helmRevision)}
                        >
                          Roll back
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirmation is inline rather than a modal: the operation is
              destructive, so the consequence is spelled out next to the row
              that triggered it instead of in a dialog that can be dismissed
              without reading. */}
          {confirmingRevision !== null && (
            <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-frost">
                {describeRollbackImpact(confirmingTarget, currentRevision)}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={rollingBack || confirmingTarget === null}
                  onClick={() => void handleRollback(confirmingRevision)}
                >
                  {rollingBack ? "Starting…" : `Roll back to revision ${confirmingRevision}`}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rollingBack}
                  onClick={() => setConfirmingRevision(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function formatTimestamp(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSeconds = Math.floor((Date.now() - then) / 1000);
  if (deltaSeconds < 60) return "just now";
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
