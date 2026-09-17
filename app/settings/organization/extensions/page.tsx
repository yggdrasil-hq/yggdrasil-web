import { Suspense } from "react";
import { OrgExtensionsSettings } from "@/components/settings/organization/org-extensions-settings";

export default function OrganizationExtensionsPage() {
  return (
    <Suspense>
      <OrgExtensionsSettings />
    </Suspense>
  );
}
