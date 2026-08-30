import { Suspense } from "react";
import { OrgClusterSettings } from "@/components/settings/organization/org-cluster-settings";

export default function OrganizationClusterPage() {
  return (
    <Suspense>
      <OrgClusterSettings />
    </Suspense>
  );
}
