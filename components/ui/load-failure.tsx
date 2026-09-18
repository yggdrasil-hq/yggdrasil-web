"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YggdrasilLogo } from "@/components/brand/yggdrasil-logo";
import { appRoute } from "@/lib/config";
import { describeLoadFailure, isRetryable } from "@/lib/features/load-errors";

interface LoadFailureProps {
  /** The thrown message, verbatim — the copy is derived from it. */
  message: string;
  /** What could not be loaded, so the heading can name it. */
  subject?: "project" | "feature" | "test" | "design" | "page";
  /**
   * `"page"` (the default) fills the viewport for a route whose data failed.
   * `"panel"` is the same copy and the same retry policy inside a block on a
   * page that already rendered — see below.
   */
  variant?: "page" | "panel";
}

/**
 * The page a project-scoped client shows when it could not load its data.
 *
 * **Why it replaces a bare `<div>`.** Every one of these clients used to render
 * the thrown message centred on an otherwise empty page — no app shell, so no
 * sidebar and no way back except the browser's back button, and the message was
 * whatever `lib/api.ts` threw. Reproduced against the real stack: the project
 * usage page rendered exactly `API error: 404 Not Found` and nothing else.
 * A user who follows a link to a project they cannot open is then stranded on a
 * dead end that does not say what to do.
 *
 * It deliberately does **not** try to render the app shell. The shell needs a
 * project, and a project that failed to load is the usual reason this component
 * is on screen — so a shell here would either be empty or be a lie. What it can
 * honestly provide is navigation that does not depend on the missing data, and
 * a message derived from the failure rather than echoing it.
 *
 * The reasoning for the copy — which statuses get rewritten, why 404 does not
 * offer a retry — lives in `lib/features/load-errors.ts`, where it is unit
 * tested. This component only renders it.
 *
 * **Why the retry is a full reload rather than a callback.** Each of these
 * clients runs its fetch inside a `useEffect`, so its loader is not in scope at
 * the point this renders; threading a prop through would mean lifting a dozen
 * loaders out of their effects for a button on an error page. A reload re-runs
 * exactly the code that failed, which is what "try again" means here, and there
 * is no client state on this screen worth preserving.
 *
 * **Why there is a `panel` variant (issue #59).** A single stage panel can fail on
 * its own while the page around it loaded fine — the Agentic Review tab is the
 * case that prompted this. There, the app shell, the feature header and the stage
 * nav are all present and correct, so `min-h-screen` centring would shove the
 * broken sub-section's message into the middle of a page that is otherwise fine,
 * and the "Back to projects" link would duplicate navigation the user already
 * has. The *copy* and the retry decision should not fork for that reason, which is
 * why this is a variant of one component rather than a second component: two
 * implementations is how the two treatments drift and one of them stops being
 * updated.
 */
export function LoadFailure({
  message,
  subject = "page",
  variant = "page",
}: LoadFailureProps) {
  const copy = describeLoadFailure(message, subject);
  const retryable = isRetryable(message);

  if (variant === "panel") {
    return (
      <div className="rounded-md border border-status-input/30 bg-status-input/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-status-input" aria-hidden />
          <h3 className="text-sm font-medium text-frost">{copy.title}</h3>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-mist">{copy.detail}</p>
        {retryable ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        ) : null}
        {/* Same rule as the page variant: the raw text is the only thing an
            operator can search for, so it stays when the copy replaced it. */}
        {copy.recognised ? (
          <p className="mt-2 break-words font-mono text-xs text-shadow">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <YggdrasilLogo />

      <div className="flex max-w-md flex-col gap-2">
        <div className="flex items-center justify-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-status-input" aria-hidden />
          <h1 className="text-lg font-semibold text-frost">{copy.title}</h1>
        </div>
        <p className="text-sm leading-relaxed text-mist">{copy.detail}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {retryable ? (
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        ) : null}
        <Button asChild variant={retryable ? "ghost" : "outline"}>
          <Link href={appRoute("/projects")}>Back to projects</Link>
        </Button>
      </div>

      {/*
        The unrecognised case already shows the raw message as the detail, so
        this would be a duplicate. When it is recognised the raw text is still
        the only thing an operator can paste into a search, so it is kept but
        demoted rather than dropped.
      */}
      {copy.recognised ? (
        <p className="max-w-md break-words font-mono text-xs text-shadow">{message}</p>
      ) : null}
    </div>
  );
}
