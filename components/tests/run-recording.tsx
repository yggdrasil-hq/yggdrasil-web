"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchJobRecording, jobRecordingUrl } from "@/lib/api";
import type { JobRecording } from "@/lib/features/types";
import {
  expiredMessage,
  formatByteSize,
  recordingLabel,
  recordingViewState,
  retentionNote,
  shouldFetchRecording,
} from "@/lib/features/recordings";

/**
 * ADR 029: a run's screen recording, fetched when a row is expanded.
 *
 * Every state this renders is decided in `lib/features/recordings.ts`; the
 * component only wires a request to it. The fetch is skipped for a run that is
 * still going (a recording cannot exist until the session ends) rather than
 * asking and then showing "not recorded" during a run that is very much in
 * progress.
 *
 * Extracted from `test-run-history.tsx` for issue #40 so the feature Testing tab
 * reuses it rather than growing a second player: the artifact is the same, the
 * endpoint is the same, and only the surrounding row differs.
 */

/**
 * ADR 029: a run's screen recording, fetched when the row is expanded.
 *
 * Every state this renders is decided in `lib/features/recordings.ts`; the
 * component only wires a request to it. The fetch is skipped for a run that is
 * still going (a recording cannot exist until the session ends) rather than
 * asking and then showing "not recorded" during a run that is very much in
 * progress.
 */
export function RunRecording({
  run,
  projectId,
}: {
  /** Only the job id and status are read — see `shouldFetchRecording`. */
  run: { jobId: string; status: string };
  projectId: string;
}) {
  const [recording, setRecording] = useState<JobRecording | null>(null);
  const [loading, setLoading] = useState(shouldFetchRecording(run.status));
  const [requestFailed, setRequestFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!shouldFetchRecording(run.status)) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setRequestFailed(false);

    fetchJobRecording(projectId, run.jobId)
      .then((data) => {
        if (active) setRecording(data.recording);
      })
      .catch(() => {
        // Surfaced as its own state rather than as "not recorded" — see
        // recordingViewState's comment on why those must not be conflated.
        if (active) setRequestFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, run.jobId, run.status, attempt]);

  const state = recordingViewState({ loading, requestFailed, recording });

  if (state === "loading") {
    return <p className="text-xs text-shadow">Loading recording…</p>;
  }

  if (state === "unavailable") {
    return (
      <p className="text-xs text-shadow">
        Could not check for a recording on this run.{" "}
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-1 py-0 text-xs text-mist hover:text-frost"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </Button>
      </p>
    );
  }

  // A live run has no recording yet and never will have had one: saying so would
  // read as a defect. Silence is the honest answer while it is still going.
  if (state === "never_recorded") {
    if (run.status === "running" || run.status === "pending") return null;
    return (
      <p className="text-xs text-shadow">
        This run was not recorded. A recording is captured only when a subtask
        drives the browser through the check runner (ADR 029).
      </p>
    );
  }

  if (state === "expired" && recording) {
    return <p className="text-xs text-shadow">{expiredMessage(recording)}</p>;
  }

  if (!recording) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-shadow">
        <span>{recordingLabel(recording)}</span>
        <span>{retentionNote(recording, new Date())}</span>
      </div>
      {/*
        `preload="metadata"` so expanding a run fetches only the header rather
        than the whole artifact: an operator scanning several runs should not
        pay for each video twice (once on expand, once on play).

        `controls` with no `autoPlay`: media starts on the user's action.
      */}
      <video
        className="w-full rounded-md border border-rime-soft bg-surface-02"
        controls
        preload="metadata"
        src={jobRecordingUrl(projectId, run.jobId)}
      >
        {/* Reached only if the API answers 404/410 between the metadata fetch
            and playback — e.g. retention reclaiming the bytes in that window. */}
        Your browser cannot play this recording ({
          formatByteSize(recording.byteSize)
        }), or it has since been removed.
      </video>
    </div>
  );
}
