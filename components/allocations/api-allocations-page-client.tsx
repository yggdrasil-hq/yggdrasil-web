"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActiveOrganization } from "@/components/usage/use-active-organization";
import { MeteringNotice } from "@/components/usage/usage-blocks";
import {
  capStatus,
  capSummary,
  formatPeriod,
  formatTokenCap,
  formatTokensCompact,
} from "@/lib/features/allocations";
import { fetchOrganizationAllocations, fetchOrganizations, setProjectTokenCap } from "@/lib/api";
import type { ProjectAllocation } from "@/lib/features/types";
import { appRoute } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * ADR 030: the monthly token cap per project, against the organization's own
 * provider credential.
 *
 * The provider allow-list the design mock also shows on this page is
 * deliberately NOT wired up — see the ADR's follow-ups. A custom MODEL_*
 * triplet bypasses the catalog entirely, so an allow-list over catalog
 * providers could not actually bound what a project reaches. The pills are
 * rendered disabled with that reason on them rather than dropped, so the page
 * still accounts for what the mock promised.
 *
 * Readable by any member; editing is admin-only, matching the API.
 */
export function ApiAllocationsPageClient() {
  const { orgId, loaded: orgLoaded } = useActiveOrganization();
  const [allocations, setAllocations] = useState<ProjectAllocation[] | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await fetchOrganizationAllocations(orgId);
      setAllocations(data.projects);
      setPeriodStart(data.periodStart);
      setError(null);
      setDrafts(
        Object.fromEntries(
          data.projects.map((project) => [
            project.projectId,
            project.monthlyTokenCap === null ? "" : String(project.monthlyTokenCap),
          ]),
        ),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load allocations");
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Role is read from the same org list the sidebar switcher uses, so the page
  // cannot disagree with the switcher about which org's permissions apply.
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    fetchOrganizations()
      .then((orgs) => {
        if (active) setIsAdmin(orgs.find((org) => org.id === orgId)?.role === "admin");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [orgId]);

  async function handleSave(project: ProjectAllocation) {
    if (!orgId) return;
    const raw = (drafts[project.projectId] ?? "").trim();
    // Empty means "no cap" — the honest way to express it, and what makes the
    // clear path discoverable rather than needing a separate button.
    let value: number | null = null;
    if (raw !== "") {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        setRowError("Token caps must be a whole number of tokens, or empty for no cap.");
        return;
      }
      value = parsed;
    }

    setSavingId(project.projectId);
    setRowError(null);
    try {
      await setProjectTokenCap(orgId, project.projectId, value);
      await load();
    } catch (saveError) {
      setRowError(saveError instanceof Error ? saveError.message : "Failed to save the cap");
    } finally {
      setSavingId(null);
    }
  }

  if (!orgLoaded) {
    return (
      <HubLayout title="Agent API allocations" description="Loading…">
        <p className="text-sm text-mist">Loading organization…</p>
      </HubLayout>
    );
  }

  if (!orgId) {
    return (
      <HubLayout title="Agent API allocations" description="Per-project model spend.">
        <p className="text-sm text-mist">Select an organization to configure allocations.</p>
      </HubLayout>
    );
  }

  return (
    <HubLayout
      title="Agent API allocations"
      description="Which of your organization's connected providers each project can draw from, and an optional monthly cap."
    >
      <MeteringNotice />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {rowError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      )}

      <Card className="p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-frost">Monthly token cap</div>
        <div className="mb-4 mt-1 text-xs text-shadow">
          {periodStart
            ? `Applied per project for ${formatPeriod(periodStart)}, measured from what each job actually reported.`
            : "Applied per project, measured from what each job actually reported."}{" "}
          A capped project stops starting new agent work once the cap is reached; deploys, rollbacks and script
          tests are never blocked by it.
        </div>

        {allocations === null && <p className="text-sm text-mist">Loading…</p>}
        {allocations?.length === 0 && (
          <p className="text-sm text-mist">This organization has no projects yet.</p>
        )}

        {allocations?.map((project, index) => {
          const status = capStatus(project.capState);
          return (
            <div
              key={project.projectId}
              className={cn(
                "flex flex-col gap-4 py-4 first:pt-0 last:pb-0 md:flex-row md:items-start",
                index > 0 && "border-t border-rime-soft",
              )}
            >
              <div className="flex w-full shrink-0 items-center gap-2.5 md:w-[190px]">
                <span className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-surface-03 font-mono text-[11px] font-semibold text-bifrost">
                  {project.projectName.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-sm text-frost">{project.projectName}</span>
              </div>

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium",
                      status === "exceeded" && "bg-red-500/15 text-red-400",
                      status === "approaching" && "bg-amber-500/15 text-amber-400",
                      status === "ok" && "bg-bifrost/15 text-bifrost",
                      status === "uncapped" && "border border-rime text-shadow",
                    )}
                  >
                    {status === "exceeded"
                      ? "Cap reached"
                      : status === "approaching"
                        ? "Approaching"
                        : status === "ok"
                          ? "Within cap"
                          : "Uncapped"}
                  </span>
                  <span className="text-xs text-mist">{formatTokenCap(project.monthlyTokenCap)}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-shadow">
                  {capSummary(project.capState)}
                </p>
              </div>

              <div className="w-full shrink-0 text-left md:w-[210px] md:text-right">
                {isAdmin ? (
                  <>
                    <Input
                      value={drafts[project.projectId] ?? ""}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [project.projectId]: event.target.value }))
                      }
                      placeholder="No cap"
                      inputMode="numeric"
                      aria-label={`Monthly token cap for ${project.projectName}`}
                      className="h-8 w-full text-right text-sm md:w-[120px]"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1.5"
                      disabled={savingId === project.projectId}
                      onClick={() => void handleSave(project)}
                    >
                      {savingId === project.projectId ? "Saving…" : "Save"}
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-shadow">
                    {formatTokensCompact(project.capState.usedTokens)} tokens used
                  </span>
                )}
                <div className="mt-1.5 text-xs">
                  <Link
                    href={appRoute(`/projects/${project.projectId}/usage`)}
                    className="text-bifrost hover:underline"
                  >
                    View usage →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        {!isAdmin && allocations !== null && allocations.length > 0 && (
          <p className="mt-4 text-xs text-shadow">
            Only organization admins can change caps.
          </p>
        )}
      </Card>

      <Card className="mt-4 p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-frost">Per-project provider access</div>
        <div className="mb-4 mt-1 text-xs leading-relaxed text-shadow">
          Which of the organization&apos;s connected providers each project may draw from. Every project can
          currently use every provider — there is no restriction mechanism yet, and this is deliberately not
          built on top of the cap work: a project may bypass the catalog entirely with a custom connection, so
          an allow-list would not actually bound what it can reach. Needs its own decision.
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["OpenRouter", "Anthropic", "OpenAI", "Together AI"].map((provider) => (
            <span
              key={provider}
              className="inline-flex h-6 items-center rounded-full border border-rime px-2.5 text-[11px] font-medium text-shadow/70"
              title="Not enforced yet — no restriction mechanism exists"
            >
              {provider}
            </span>
          ))}
        </div>
      </Card>
    </HubLayout>
  );
}
