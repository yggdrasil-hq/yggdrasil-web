"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { fetchOrganizations } from "@/lib/api";
import type { Organization } from "@/lib/features/types";

interface OrgSettingsLayoutProps {
  orgId: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Shared shell for the Organization settings pages (ADR 016 / A5). Org
 * switching and settings sub-navigation live in the persistent hub sidebar
 * (HubLayout) — matching design/settings/organization/general/index.html's
 * "Settings" nav group — so this just resolves which organization is being
 * configured and hands its id to HubLayout for sidebar highlighting.
 */
export function OrgSettingsLayout({
  orgId,
  title,
  description,
  children,
}: OrgSettingsLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetchOrganizations()
      .then((all) => {
        if (!active) return;
        setOrgs(all);
        const resolved = all.find((o) => o.id === orgId) ?? all[0] ?? null;
        setOrg(resolved);
        // If the URL has no (or a stale) ?org=, replace it with the
        // resolved org so the address bar and any child data fetches that
        // read the query param directly stay in sync with the sidebar.
        if (resolved && resolved.id !== orgId) {
          router.replace(`${pathname}?org=${resolved.id}`);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [orgId, pathname, router]);

  return (
    <HubLayout title={title} description={description} className="max-w-3xl" activeOrgId={org?.id ?? orgId}>
      {org ? (
        children
      ) : (
        <p className="text-sm text-mist">
          {!loaded ? "Loading…" : orgs.length === 0 ? "No organizations found." : "Select an organization to configure."}
        </p>
      )}
    </HubLayout>
  );
}
