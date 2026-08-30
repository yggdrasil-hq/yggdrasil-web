import { Suspense } from "react";
import { OrgMembersSettings } from "@/components/settings/organization/org-members-settings";

export default function OrganizationMembersPage() {
  return (
    <Suspense>
      <OrgMembersSettings />
    </Suspense>
  );
}
