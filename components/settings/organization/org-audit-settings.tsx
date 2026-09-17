"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { OrgSettingsLayout } from "./org-settings-layout";
import { useOrgParam } from "./use-org-param";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  fetchOrganizationAuditEvents,
  fetchOrganizationMembers,
  fetchOrganizations,
  fetchProjects,
} from "@/lib/api";
import {
  AUDIT_ACTION_GROUPS,
  actionLabel,
  actorLabel,
  formatAuditTimestamp,
  hasNextPage,
  hasPreviousPage,
  paginationSummary,
  targetLabel,
} from "@/lib/features/audit";
import type {
  AuditActorKind,
  AuditEvent,
  OrgMember,
  OrgRole,
  Project,
} from "@/lib/features/types";

const PAGE_SIZE = 50;

const ACTOR_KIND_LABELS: Record<AuditActorKind, string> = {
  user: "User",
  system: "System",
  webhook: "Webhook",
  job: "Job",
};

interface Filters {
  projectId: string;
  actorUserId: string;
  action: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  projectId: "",
  actorUserId: "",
  action: "",
  from: "",
  to: "",
};

/**
 * The organization's audit trail (ADR 028): a read-only, newest-first,
 * paginated list of every meaningful mutation the API authorized, with
 * filters for project, actor, action family and date range. Admin-only — the
 * API returns 403 for anyone else, which this page surfaces as its own
 * message rather than an empty table.
 *
 * There is no design/ wireframe for this page (see ADR 028's drift note): it
 * is built from the same sidebar-first org-settings shell and primitives as
 * its siblings (org-cluster-settings.tsx, org-providers-settings.tsx).
 */
export function OrgAuditSettings() {
  const orgParam = useOrgParam();
  const [role, setRole] = useState<OrgRole | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Org role + the filter sources (this org's projects and members).
  useEffect(() => {
    if (!orgParam) return;
    let active = true;
    Promise.all([
      fetchOrganizations(),
      fetchProjects(),
      fetchOrganizationMembers(orgParam).catch(() => [] as OrgMember[]),
    ])
      .then(([orgs, allProjects, orgMembers]) => {
        if (!active) return;
        setRole(orgs.find((org) => org.id === orgParam)?.role ?? null);
        setProjects(allProjects.filter((project) => project.organizationId === orgParam));
        setMembers(orgMembers);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [orgParam]);

  const loadPage = useCallback(
    async (nextOffset: number, activeFilters: Filters) => {
      if (!orgParam) return;
      try {
        const response = await fetchOrganizationAuditEvents(orgParam, {
          projectId: activeFilters.projectId || undefined,
          actorUserId: activeFilters.actorUserId || undefined,
          action: activeFilters.action || undefined,
          from: activeFilters.from || undefined,
          to: activeFilters.to || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setEvents(response.events);
        setTotal(response.total);
        setOffset(response.offset);
        setError(null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the audit trail.",
        );
      } finally {
        setLoaded(true);
      }
    },
    [orgParam],
  );

  useEffect(() => {
    void loadPage(0, EMPTY_FILTERS);
  }, [loadPage]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    // Any filter change restarts paging — page N of the old filter set means
    // nothing under the new one.
    void loadPage(0, next);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    void loadPage(0, EMPTY_FILTERS);
  }

  if (!orgParam) {
    return (
      <OrgSettingsLayout orgId="" title="Audit">
        <p className="text-sm text-mist">Select an organization to view its audit trail.</p>
      </OrgSettingsLayout>
    );
  }

  const page = { offset, limit: PAGE_SIZE, total };

  return (
    <OrgSettingsLayout
      orgId={orgParam}
      title="Audit"
      description="Every meaningful change made in this organization, newest first. Read-only and kept indefinitely — admins only."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Narrow the trail by project, actor, action family or date range.
            </CardDescription>
          </CardHeader>
          <div className="grid gap-3 px-6 pb-6 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-mist">
              Project
              <Select
                value={filters.projectId}
                onChange={(event) => updateFilter("projectId", event.target.value)}
              >
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1 text-xs text-mist">
              Actor
              <Select
                value={filters.actorUserId}
                onChange={(event) => updateFilter("actorUserId", event.target.value)}
              >
                <option value="">Anyone (incl. system)</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1 text-xs text-mist">
              Action
              <Select
                value={filters.action}
                onChange={(event) => updateFilter("action", event.target.value)}
              >
                <option value="">All actions</option>
                {AUDIT_ACTION_GROUPS.map((group) => (
                  <option key={group.prefix} value={group.prefix}>
                    {group.label}
                  </option>
                ))}
              </Select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-mist">
                From
                <Input
                  type="date"
                  value={filters.from}
                  onChange={(event) => updateFilter("from", event.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs text-mist">
                To
                <Input
                  type="date"
                  value={filters.to}
                  onChange={(event) => updateFilter("to", event.target.value)}
                />
              </label>
            </div>

            <div className="sm:col-span-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        </Card>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Trail</CardTitle>
              <CardDescription>{paginationSummary(page)}</CardDescription>
            </CardHeader>

            {!loaded ? (
              <p className="px-6 pb-6 text-sm text-mist">Loading…</p>
            ) : events.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-mist">
                No activity recorded for this organization yet.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-rime-soft border-t border-rime-soft">
                  {events.map((event) => (
                    <AuditRow key={event.id} event={event} />
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-3 px-6 py-4">
                  <span className="text-xs text-mist">{paginationSummary(page)}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasPreviousPage(page)}
                      onClick={() => void loadPage(Math.max(offset - PAGE_SIZE, 0), filters)}
                    >
                      Newer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasNextPage(page)}
                      onClick={() => void loadPage(offset + PAGE_SIZE, filters)}
                    >
                      Older
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </OrgSettingsLayout>
  );
}

function AuditRow({ event }: { event: AuditEvent }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-6 py-3">
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-frost">
          {actionLabel(event.action)}{" "}
          <span className="text-mist">· {targetLabel(event)}</span>
        </p>
        <p className="text-xs text-mist">
          {actorLabel(event)}
          {event.projectName ? ` · ${event.projectName}` : ""}
          {event.ip ? ` · ${event.ip}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline">{ACTOR_KIND_LABELS[event.actorKind]}</Badge>
        <span className="text-xs text-mist">{formatAuditTimestamp(event.createdAt)}</span>
      </div>
    </li>
  );
}
