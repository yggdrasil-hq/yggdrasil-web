"use client";

import { useEffect, useState } from "react";
import { fetchOrganizations } from "@/lib/api";
import { useOrgParam } from "@/components/settings/organization/use-org-param";

/**
 * The organization a top-level monitoring page should report on.
 *
 * Mirrors how HubLayout itself picks the org shown in the sidebar's switcher —
 * the `?org=` query param when present, otherwise the signed-in user's first
 * organization — so the page and the switcher naming it can never disagree
 * about which organization's numbers are on screen.
 *
 * Shared by the org-level Usage and Analytics pages rather than reimplemented
 * in each, so the two cannot drift.
 */
export function useActiveOrganization(): { orgId: string; loaded: boolean } {
  const orgParam = useOrgParam();
  const [fallbackOrgId, setFallbackOrgId] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (orgParam) {
      setLoaded(true);
      return;
    }
    let active = true;
    fetchOrganizations()
      .then((orgs) => {
        if (active) {
          setFallbackOrgId(orgs[0]?.id ?? "");
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [orgParam]);

  return { orgId: orgParam || fallbackOrgId, loaded };
}
