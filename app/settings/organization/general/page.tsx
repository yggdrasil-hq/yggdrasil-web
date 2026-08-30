import { Suspense } from "react";
import { OrgGeneralSettings } from "@/components/settings/organization/org-general-settings";

export default function OrganizationGeneralPage() {
  return (
    <Suspense>
      <OrgGeneralSettings />
    </Suspense>
  );
}
