"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Button } from "@/components/ui/button";
import { fetchOrganizations } from "@/lib/api";
import { appRoute } from "@/lib/config";
import type { Organization } from "@/lib/features/types";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/settings/organization/general", label: "General" },
  { href: "/settings/organization/members", label: "Members" },
  { href: "/settings/organization/providers", label: "Providers & Models" },
  { href: "/settings/organization/secrets", label: "Secrets" },
  { href: "/settings/organization/cluster", label: "Kubernetes cluster" },
] as const;

export type OrgSettingsTab = (typeof tabs)[number]["href"];

interface OrgSettingsLayoutProps {
  orgId: string;
  activeTab: OrgSettingsTab;
  children: React.ReactNode;
}

/**
 * Shared shell for the Organization settings pages (ADR 016 / A5). Lets the
 * user pick which org they're configuring (they may belong to several) and
 * shows the five settings tabs from the wireframe.
 */
export function OrgSettingsLayout({
  orgId,
  activeTab,
  children,
}: OrgSettingsLayoutProps) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);

  useEffect(() => {
    let active = true;
    fetchOrganizations()
      .then((all) => {
        if (!active) return;
        setOrgs(all);
        setOrg(all.find((o) => o.id === orgId) ?? all[0] ?? null);
      })
      .catch(() => {
        // Non-fatal; empty-state will render.
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  return (
    <HubLayout title="Organization settings" description="Configure your organizations and roles." className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <label htmlFor="org-select" className="text-sm text-mist">
          Organization
        </label>
        <select
          id="org-select"
          className="rounded-md border border-rime bg-surface-02 px-3 py-1.5 text-sm text-frost"
          value={org?.id ?? ""}
          onChange={(e) => {
            window.location.href = appRoute(`${activeTab}?org=${e.target.value}`);
          }}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.isPersonal ? " (personal)" : ""}
            </option>
          ))}
        </select>
      </div>

      <nav className="mb-6 flex flex-wrap gap-1 rounded-lg border border-rime-soft bg-surface-01 p-1">
        {tabs.map((tab) => {
          const href = appRoute(`${tab.href}?org=${orgId}`);
          const active = tab.href === activeTab;
          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-surface-03 text-frost"
                  : "text-mist hover:bg-surface-02 hover:text-frost",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {org ? children : <p className="text-sm text-mist">No organization selected.</p>}

      <div className="mt-8">
        <Button variant="ghost" size="sm" asChild>
          <Link href={appRoute("/projects")}>Back to projects</Link>
        </Button>
      </div>
    </HubLayout>
  );
}