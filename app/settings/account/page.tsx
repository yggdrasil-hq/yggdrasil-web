import { Suspense } from "react";
import { AccountSettingsClient } from "@/components/settings/account-settings-client";

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-mist">Loading…</div>}>
      <AccountSettingsClient />
    </Suspense>
  );
}
