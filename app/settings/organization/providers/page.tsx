import { Suspense } from "react";
import { OrgProvidersSettings } from "@/components/settings/organization/org-providers-settings";

export default function OrganizationProvidersPage() {
  return (
    <Suspense>
      <OrgProvidersSettings />
    </Suspense>
  );
}
