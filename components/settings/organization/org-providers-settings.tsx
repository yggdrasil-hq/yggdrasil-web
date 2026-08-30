"use client";

import { useEffect, useState } from "react";
import { OrgSettingsLayout } from "./org-settings-layout";
import { useOrgParam } from "./use-org-param";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ModelSecretField } from "@/components/settings/model-secret-field";
import {
  deleteOrganizationSecret,
  fetchOrganizationSecrets,
  upsertOrganizationSecret,
} from "@/lib/api";
import type { ModelSecretKey, ProjectSecretMetadata } from "@/lib/features/types";

const MODEL_SECRET_FIELDS: Array<{
  key: ModelSecretKey;
  label: string;
  description: string;
  placeholder: string;
  masked?: boolean;
}> = [
  {
    key: "MODEL_BASE_URL",
    label: "Model base URL",
    description: "OpenAI-chat-completions-compatible endpoint the agent sends requests to.",
    placeholder: "https://api.openai.com/v1",
  },
  {
    key: "MODEL_API_KEY",
    label: "Model API key",
    description: "Sent as the bearer token on every request to the base URL above.",
    placeholder: "sk-…",
    masked: true,
  },
  {
    key: "MODEL_ID",
    label: "Model ID",
    description: "Model name passed in each request, e.g. gpt-4.1 or claude-sonnet-5.",
    placeholder: "gpt-4.1",
  },
];

export function OrgProvidersSettings() {
  const orgParam = useOrgParam();
  const [secrets, setSecrets] = useState<ProjectSecretMetadata[]>([]);

  useEffect(() => {
    if (!orgParam) return;
    let active = true;
    fetchOrganizationSecrets(orgParam)
      .then((s) => {
        if (active) setSecrets(s);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [orgParam]);

  if (!orgParam) {
    return (
      <OrgSettingsLayout orgId="" activeTab="/settings/organization/providers">
        <p className="text-sm text-mist">Select an organization to configure providers.</p>
      </OrgSettingsLayout>
    );
  }

  function handleChange(key: ModelSecretKey, metadata: ProjectSecretMetadata | null) {
    setSecrets((current) => {
      const withoutKey = current.filter((secret) => secret.key !== key);
      return metadata ? [...withoutKey, metadata] : withoutKey;
    });
  }

  return (
    <OrgSettingsLayout orgId={orgParam} activeTab="/settings/organization/providers">
      <Card>
        <CardHeader>
          <CardTitle>Providers &amp; Models</CardTitle>
          <CardDescription>
            Used by every project under this organization unless a project overrides it. All
            three keys are set (or inherited) together.
          </CardDescription>
        </CardHeader>
        <div className="space-y-3 px-4 pb-4">
          {MODEL_SECRET_FIELDS.map((field) => (
            <ModelSecretField
              key={field.key}
              secretKey={field.key}
              label={field.label}
              description={field.description}
              placeholder={field.placeholder}
              masked={field.masked}
              metadata={secrets.find((secret) => secret.key === field.key) ?? null}
              onChange={(metadata) => handleChange(field.key, metadata)}
              onSave={(key, value) => upsertOrganizationSecret(orgParam, key, value)}
              onDelete={(secretId) => deleteOrganizationSecret(orgParam, secretId)}
            />
          ))}
        </div>
      </Card>
    </OrgSettingsLayout>
  );
}