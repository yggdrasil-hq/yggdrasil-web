import { Suspense } from "react";
import { OrgAuditSettings } from "@/components/settings/organization/org-audit-settings";

export default function OrganizationAuditPage() {
  return (
    <Suspense>
      <OrgAuditSettings />
    </Suspense>
  );
}
