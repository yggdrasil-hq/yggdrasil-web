"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { OrgSettingsLayout } from "./org-settings-layout";
import { useOrgParam } from "./use-org-param";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteOrgExtension,
  fetchOrgExtension,
  fetchOrgExtensions,
  setOrgExtensionActive,
  uploadOrgExtension,
} from "@/lib/api";
import {
  TRUST_ACKNOWLEDGEMENT,
  TRUST_WARNING,
  detailTotalBytes,
  draftBundleIssue,
  enabledProjectsLabel,
  extensionStatusLabel,
  fileCountLabel,
  formatBytes,
  formatExtensionTimestamp,
  shortDigest,
  summarizeExtensions,
  uploaderLabel,
} from "@/lib/features/extensions";
import type { OrgExtension, OrgExtensionDetail, Project } from "@/lib/features/types";

const TEMPLATE = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Register tools/commands here. Uploaded extensions may not use the
  // yggdrasil-contract tool names (ask_user, submit_adr, ...).
}
`;

interface DraftFile {
  path: string;
  content: string;
}

/**
 * ADR 025: the organization's uploaded Pi extensions.
 *
 * Admin-only (the API enforces it; this page just surfaces the 403). The
 * standing warning at the top is not dismissible on purpose: everything on this
 * page installs code that runs with the organization's GitHub access and model
 * key, and a reviewer arriving later should see that without having to trigger
 * an upload.
 *
 * No `design/` wireframe exists for this route, so it is built from the sibling
 * org-settings shell and existing primitives, and recorded as known ADR 017
 * drift in ADR 025 rather than a wireframe being invented for it.
 */
export function OrgExtensionsSettings() {
  const orgParam = useOrgParam();
  const [extensions, setExtensions] = useState<OrgExtension[]>([]);
  const [detail, setDetail] = useState<OrgExtensionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // upload form
  const [name, setName] = useState("");
  const [entryPath, setEntryPath] = useState("src/index.ts");
  const [files, setFiles] = useState<DraftFile[]>([{ path: "src/index.ts", content: TEMPLATE }]);
  const [acknowledged, setAcknowledged] = useState(false);

  const orgId = orgParam;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const response = await fetchOrgExtensions(orgId);
      setExtensions(response.extensions);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load extensions");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleInspect(extension: OrgExtension) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchOrgExtension(orgId, extension.id);
      setDetail(response.extension);
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : "Failed to load extension");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(extension: OrgExtension) {
    setBusy(true);
    setError(null);
    try {
      await setOrgExtensionActive(orgId, extension.id, !extension.active);
      setNotice(
        extension.active
          ? `Disabled "${extension.name}". No project will load it until it is re-enabled.`
          : `Re-enabled "${extension.name}".`,
      );
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to change state");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(extension: OrgExtension) {
    setBusy(true);
    setError(null);
    try {
      await deleteOrgExtension(orgId, extension.id);
      setNotice(`Deleted "${extension.name}". Jobs already running keep the revision they started with.`);
      if (detail?.id === extension.id) setDetail(null);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    const issue = draftBundleIssue(files, entryPath);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await uploadOrgExtension(orgId, {
        name: name.trim(),
        entryPath: entryPath.trim(),
        files: files.map((file) => ({ path: file.path.trim(), content: file.content })),
        // The API requires a literal true; the checkbox is what makes this
        // reachable, so an upload cannot happen from a client that never
        // showed the warning.
        acknowledgedRisk: true,
      });
      setNotice(
        `Uploaded "${created.name}" (revision ${shortDigest(created.sourceSha256)}). Projects that have opted in will load it on their next job.`,
      );
      setName("");
      setFiles([{ path: "src/index.ts", content: TEMPLATE }]);
      setAcknowledged(false);
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload");
    } finally {
      setBusy(false);
    }
  }

  const summary = summarizeExtensions(extensions);
  const uploadIssue = draftBundleIssue(files, entryPath);

  return (
    <OrgSettingsLayout
      orgId={orgId}
      title="Extensions"
      description="Pi extensions your organization has uploaded. These are arbitrary code: a project only loads them if it opts in."
    >
      <div className="space-y-6">
        <Alert>
          <ShieldAlert className="size-4" />
          <AlertDescription>{TRUST_WARNING}</AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Installed</CardTitle>
            <CardDescription>
              {loading
                ? "Loading…"
                : summary.total === 0
                  ? "No extensions uploaded."
                  : `${summary.total} stored, ${summary.active} active, ${enabledProjectsLabel(
                      summary.enabledProjects,
                    ).toLowerCase()}.`}
            </CardDescription>
          </CardHeader>
          <div className="space-y-2 px-4 pb-4">
            {extensions.map((extension) => (
              <div
                key={extension.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rime-soft bg-surface-01 p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-frost">
                    {extension.name}
                    <Badge variant={extension.active ? "default" : "outline"}>
                      {extensionStatusLabel(extension)}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-shadow">
                    {extension.entryPath} · revision {shortDigest(extension.sourceSha256)} ·
                    uploaded by {uploaderLabel(extension)} on{" "}
                    {formatExtensionTimestamp(extension.updatedAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-shadow">
                    {enabledProjectsLabel(extension.enabledProjectCount)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleInspect(extension)}>
                    View source
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleToggle(extension)}>
                    {extension.active ? "Disable" : "Enable"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleDelete(extension)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {detail && (
          <Card>
            <CardHeader>
              <CardTitle>
                {detail.name} — source (revision {shortDigest(detail.sourceSha256)})
              </CardTitle>
              <CardDescription>
                {fileCountLabel(detail.files.length)} · {formatBytes(detailTotalBytes(detail))}.
                This is exactly what runs: read it before enabling the extension anywhere.
              </CardDescription>
            </CardHeader>
            <div className="space-y-3 px-4 pb-4">
              <EnabledProjects projects={detail.enabledProjects} />
              {detail.files.map((file) => (
                <div key={file.path}>
                  <p className="text-xs font-medium text-shadow">
                    {file.path} · {formatBytes(file.sizeBytes)}
                  </p>
                  {/* Rendered as text in a <pre>: uploaded source is untrusted
                      and must never be interpreted as markup. */}
                  <pre className="mt-1 max-h-80 overflow-auto rounded-md border border-rime-soft bg-surface-01 p-3 text-xs text-frost">
                    {file.content}
                  </pre>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
            <CardDescription>
              Source files only. Dependencies cannot be installed inside a job container, so an
              uploaded extension must use only what the image already provides. Uploading with a
              name that already exists replaces that extension&apos;s files.
            </CardDescription>
          </CardHeader>
          <div className="space-y-3 px-4 pb-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-medium text-shadow">
                Name
                <Input
                  className="mt-1"
                  value={name}
                  placeholder="House style checks"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-shadow">
                Entry path
                <Input
                  className="mt-1"
                  value={entryPath}
                  onChange={(event) => setEntryPath(event.target.value)}
                />
              </label>
            </div>

            {files.map((file, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    value={file.path}
                    placeholder="src/index.ts"
                    // One path field per draft file, all identical — so the
                    // name has to include which file this is, or a screen
                    // reader hears "edit text" repeated with no way to tell
                    // them apart. The index is 1-based because it labels a row
                    // a human is counting.
                    aria-label={`File ${index + 1} path`}
                    onChange={(event) =>
                      setFiles(files.map((item, i) => (i === index ? { ...item, path: event.target.value } : item)))
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={files.length === 1}
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
                <textarea
                  className="min-h-40 w-full rounded-md border border-rime-soft bg-surface-01 p-3 font-mono text-xs text-frost"
                  // Same reason as the path field above: a bare textarea per
                  // file is indistinguishable from its siblings.
                  aria-label={`File ${index + 1} contents`}
                  value={file.content}
                  onChange={(event) =>
                    setFiles(files.map((item, i) => (i === index ? { ...item, content: event.target.value } : item)))
                  }
                />
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiles([...files, { path: "", content: "" }])}
            >
              Add file
            </Button>

            <label className="flex items-start gap-2 text-xs text-shadow">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              {TRUST_ACKNOWLEDGEMENT}
            </label>

            {uploadIssue && <p className="text-xs text-shadow">{uploadIssue}</p>}

            <Button
              disabled={busy || !acknowledged || !name.trim() || Boolean(uploadIssue)}
              onClick={() => void handleUpload()}
            >
              {busy ? "Uploading…" : "Upload extension"}
            </Button>
          </div>
        </Card>
      </div>
    </OrgSettingsLayout>
  );
}

function EnabledProjects({ projects }: { projects: Project[] | Array<{ id: string; name: string; slug: string }> }) {
  if (projects.length === 0) {
    return (
      <p className="text-xs text-shadow">
        No project has opted in yet, so this extension is stored but never loaded.
      </p>
    );
  }
  return (
    <p className="text-xs text-shadow">
      Loaded by: {projects.map((project) => project.name).join(", ")}
    </p>
  );
}
