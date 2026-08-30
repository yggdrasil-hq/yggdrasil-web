import { Suspense } from "react";
import { OrgSecretsSettings } from "@/components/settings/organization/org-secrets-settings";

export default function OrganizationSecretsPage() {
  return (
    <Suspense>
      <OrgSecretsSettings />
    </Suspense>
  );
}
