"use client";

import { useEffect, useState } from "react";
import { OrgSettingsLayout } from "./org-settings-layout";
import { useOrgParam } from "./use-org-param";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  changeOrgMemberRole,
  createOrganizationInvite,
  fetchOrganizationInvites,
  fetchOrganizationMembers,
  fetchOrganizationRoles,
  removeOrgMember,
} from "@/lib/api";
import { ORG_ROLE_LABELS } from "@/lib/features/types";
import type { OrgInvite, OrgMember, OrgRole, RolesResponse } from "@/lib/features/types";

export function OrgMembersSettings() {
  const orgParam = useOrgParam();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [role, setRole] = useState<OrgRole>("developer");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!orgParam) return;
    fetchOrganizationMembers(orgParam)
      .then(setMembers)
      .catch(() => setError("Unable to load members."));
    fetchOrganizationInvites(orgParam)
      .then(setInvites)
      .catch(() => undefined);
    fetchOrganizationRoles().then(setRoles).catch(() => undefined);
  }

  useEffect(load, [orgParam]);

  async function generateInvite() {
    setError(null);
    setInviteLink(null);
    try {
      const invite = await createOrganizationInvite(orgParam, role);
      setInviteLink(`${window.location.origin}/organizations/invites/${invite.token}`);
      await fetchOrganizationInvites(orgParam).then(setInvites);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create invite.");
    }
  }

  if (!orgParam) {
    return (
      <OrgSettingsLayout orgId="" activeTab="/settings/organization/members">
        <p className="text-sm text-mist">Select an organization to manage members.</p>
      </OrgSettingsLayout>
    );
  }

  return (
    <OrgSettingsLayout orgId={orgParam} activeTab="/settings/organization/members">
      <div className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Invite member</CardTitle>
            <CardDescription>
              Generate a shareable link — whoever opens it and signs in with GitHub joins with
              the chosen role. Yggdrasil never sends the invite itself.
            </CardDescription>
          </CardHeader>
          <div className="flex items-end gap-3 px-4 pb-4">
            <div className="space-y-2">
              <label htmlFor="inviteRole" className="text-sm text-mist">
                Role
              </label>
              <select
                id="inviteRole"
                className="rounded-md border border-rime bg-surface-02 px-3 py-2 text-sm text-frost"
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
              >
                {Object.entries(ORG_ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => void generateInvite()}>Generate invite link</Button>
          </div>
          {inviteLink ? (
            <div className="px-4 pb-4">
              <label className="text-sm text-mist">Invite link</label>
              <pre className="mt-2 overflow-x-auto rounded-md border border-rime bg-surface-01 p-3 text-xs text-frost">
                {inviteLink}
              </pre>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Everyone with access to this org&apos;s projects.</CardDescription>
          </CardHeader>
          <div className="px-4 pb-4">
            {members.length === 0 ? (
              <p className="text-sm text-mist">No members yet.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex items-center justify-between rounded-md border border-rime px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-frost">
                        {member.displayName}{" "}
                        <span className="text-shadow">@{member.githubLogin}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <select
                        className="rounded-md border border-rime bg-surface-02 px-2 py-1 text-sm text-frost"
                        value={member.role}
                        onChange={(e) =>
                          void changeOrgMemberRole(
                            orgParam,
                            member.userId,
                            e.target.value as OrgRole,
                          ).then(load)
                        }
                      >
                        {Object.entries(ORG_ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void removeOrgMember(orgParam, member.userId).then(load)
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What each role can do</CardTitle>
            <CardDescription>
              Adjustable capability grants — a wrong default is fixable without a deploy.
            </CardDescription>
          </CardHeader>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rime-soft text-xs uppercase text-shadow">
                  <th className="py-2 pr-3">Capability</th>
                  {roles?.roles.map((r) => (
                    <th key={r} className="px-2 py-2 text-center">
                      {ORG_ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(roles?.capabilities ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={(roles?.roles.length ?? 5) + 1} className="py-3 text-mist">
                      Capability matrix unavailable.
                    </td>
                  </tr>
                ) : null}
                {Object.keys(
                  (roles?.capabilities ?? []).reduce<Record<string, unknown>>((acc, c) => {
                    acc[c.capability] = true;
                    return acc;
                  }, {}),
                ).map((capability) => (
                  <tr key={capability} className="border-b border-rime-soft">
                    <td className="py-2 pr-3 text-frost">{capability}</td>
                    {roles?.roles.map((r) => {
                      const grant = roles.capabilities.find(
                        (c) => c.capability === capability && c.role === r,
                      );
                      return (
                        <td key={r} className="px-2 py-2 text-center text-mist">
                          {grant
                            ? grant.level === "full"
                              ? "✓"
                              : grant.level === "partial"
                                ? "view"
                                : "—"
                            : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </OrgSettingsLayout>
  );
}