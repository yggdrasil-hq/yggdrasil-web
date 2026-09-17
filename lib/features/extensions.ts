import type { OrgExtension, OrgExtensionDetail, OrgExtensionFile } from "./types";

/**
 * ADR 025 presentation logic for uploaded extensions. Kept here, pure, because
 * this repo's vitest is node-only with no React testing library — the page's
 * decisions are testable only if they live outside the component (same
 * arrangement as lib/features/audit.ts).
 */

/**
 * The trust warning. Shown on the org page as a standing banner and required to
 * be acknowledged before an upload, because the thing being installed runs
 * inside a container that holds the project's GitHub installation token and the
 * model API key.
 *
 * Deliberately concrete rather than reassuring: "arbitrary code" and the named
 * access are what an admin actually needs to weigh, and "only install what you
 * trust" is the only control the product can offer.
 */
export const TRUST_WARNING =
  "An extension is arbitrary code. It runs inside the job container with the same access as the agent itself: it can read the pod's environment — including the project's GitHub installation token and the model API key — make network requests, modify the workspace, and emit tool calls that Yggdrasil treats as the job's real result. There is no sandbox. Only upload code you have read and trust.";

/** The shorter form shown next to a project's opt-in toggle. */
export const TRUST_WARNING_SHORT =
  "Uploaded extensions are arbitrary code and run with this project's GitHub access and model key. Only enable this for code your organization has reviewed.";

/** Acknowledge copy for the upload confirmation. */
export const TRUST_ACKNOWLEDGEMENT =
  "I have read this extension's source and accept that it runs with my organization's credentials.";

export type ExtensionStatus = "active" | "disabled";

export function extensionStatus(extension: Pick<OrgExtension, "active">): ExtensionStatus {
  return extension.active ? "active" : "disabled";
}

export function extensionStatusLabel(extension: Pick<OrgExtension, "active">): string {
  return extension.active ? "Active" : "Disabled";
}

export interface ExtensionSummary {
  total: number;
  active: number;
  /** Projects across the org loading extensions, taking the max of the counts. */
  enabledProjects: number;
  totalBytes: number;
}

/**
 * `enabledProjectCount` is per extension, but a project either loads all active
 * extensions or none — so every row reports the same number whenever anything
 * is enabled, and the header should say "in N projects", not sum the rows
 * (which would multiply one project by the number of extensions).
 */
export function summarizeExtensions(
  extensions: Array<OrgExtension & { totalBytes?: number }>,
): ExtensionSummary {
  return {
    total: extensions.length,
    active: extensions.filter((extension) => extension.active).length,
    enabledProjects: extensions.reduce(
      (max, extension) => Math.max(max, extension.enabledProjectCount),
      0,
    ),
    totalBytes: extensions.reduce((sum, extension) => sum + (extension.totalBytes ?? 0), 0),
  };
}

/** Human byte size, for the file list. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function fileCountLabel(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

export function enabledProjectsLabel(count: number): string {
  if (count === 0) return "Not enabled in any project";
  if (count === 1) return "Enabled in 1 project";
  return `Enabled in ${count} projects`;
}

/**
 * Short digest for display. The full hash is what the container logs and what
 * pins a run's revision; a UI shows the first 12 characters so two revisions
 * are distinguishable at a glance.
 */
export function shortDigest(sha256: string): string {
  return sha256.slice(0, 12);
}

export function uploaderLabel(
  extension: Pick<OrgExtension, "uploadedBy">,
): string {
  if (!extension.uploadedBy) return "Unknown (uploader removed)";
  return extension.uploadedBy.displayName || extension.uploadedBy.username || "Unknown";
}

/** Total stored size of a detail response's files. */
export function detailTotalBytes(detail: OrgExtensionDetail): number {
  return detail.files.reduce((sum, file) => sum + file.sizeBytes, 0);
}

export function formatExtensionTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A file ready to be submitted, as the page holds it before upload. */
export interface DraftFile {
  path: string;
  content: string;
}

const ALLOWED_SUFFIXES = [".ts", ".js", ".json"];

/**
 * Client-side pre-check so the form can disable submission and explain why,
 * mirroring the API's rules (ADR 025).
 *
 * The API is still the authority — this cannot be trusted as a control, only as
 * feedback — and it deliberately covers the *shape* rules (a missing entry
 * file, a path that would never be accepted) rather than trying to reimplement
 * the whole validator in the browser.
 */
export function draftBundleIssue(files: DraftFile[], entryPath: string): string | null {
  if (files.length === 0) return "Add at least one file.";
  for (const file of files) {
    const path = file.path.trim();
    if (!path) return "Every file needs a path.";
    if (path.startsWith("/")) return `"${path}" must be relative, not absolute.`;
    if (path.includes("\\")) return `"${path}" must use "/" separators.`;
    if (path.split("/").some((segment) => segment === ".." || segment === ".")) {
      return `"${path}" must not contain "." or ".." segments.`;
    }
    if (!ALLOWED_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix))) {
      return `"${path}" must end with .ts, .js or .json.`;
    }
  }
  if (!files.some((file) => file.path.trim() === entryPath.trim())) {
    return `The entry path "${entryPath}" is not one of the files.`;
  }
  return null;
}

/**
 * Whether a project's Pi jobs will actually load anything.
 *
 * `extensionCount` is null when it could not be determined — the extension
 * list is admin-only, so a project owner who is not an org admin legitimately
 * cannot see it. That case says only what is certain rather than claiming
 * "no extensions", which would be a wrong statement about someone else's org.
 */
export function projectLoadState(
  project: { uploadedExtensionsEnabled: boolean },
  extensionCount: number | null,
): { loading: boolean; label: string } {
  if (!project.uploadedExtensionsEnabled) {
    return { loading: false, label: "This project's Pi jobs do not load uploaded extensions." };
  }
  if (extensionCount === null) {
    return {
      loading: true,
      label:
        "This project's Pi jobs load your organization's uploaded extensions. An organization admin can list them under Organization settings → Extensions.",
    };
  }
  if (extensionCount === 0) {
    // Worth saying explicitly: the toggle is on but nothing exists to load, so
    // a user is not left thinking the feature is broken.
    return {
      loading: false,
      label: "Enabled, but this organization has no active extensions yet.",
    };
  }
  return {
    loading: true,
    label: `This project's Pi jobs load ${extensionCount} ${
      extensionCount === 1 ? "extension" : "extensions"
    } from your organization.`,
  };
}

/** True when a file's content is too large for the API to accept. */
export function fileTooLarge(file: OrgExtensionFile | DraftFile, maxBytes = 64 * 1024): boolean {
  return new TextEncoder().encode(file.content).length > maxBytes;
}
