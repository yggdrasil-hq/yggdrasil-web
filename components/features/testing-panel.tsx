"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RunRecording } from "@/components/tests/run-recording";
import { fetchFeatureTestingResults } from "@/lib/api";
import {
  isFailingRun,
  runFailureReason,
  runStatusLabel,
  runTone,
  runToneClass,
  tallyLine,
  tallyRuns,
  testingHeadline,
} from "@/lib/features/testing";
import type { TestingRun, TestingResults } from "@/lib/features/types";
import { cn } from "@/lib/utils";
import { appRoute } from "@/lib/config";

interface TestingPanelProps {
  projectId: string;
  featureId: string;
}

type Subview = "all" | "failed";

function testGroupLabel(run: TestingRun): string {
  if (run.testGroup === "unit") return "Unit";
  if (run.testGroup === "integration") return "Integration";
  return "Agentic";
}

const toneClasses = {
  active: "border-bifrost/30 bg-bifrost/10",
  fail: "border-status-rejected/30 bg-status-rejected/10",
  pass: "border-teal/30 bg-teal/10",
} as const;

/**
 * ADR 015 items 9-11 / Track B4-B5: the Testing stage view for a feature in
 * `status === "testing"`. Groups results into Unit / Integration / Agentic
 * with per-row pass/fail + count + duration, and a passed-vs-failed subview
 * mirroring design/.../testing/index.html. When the stage hasn't produced a
 * report yet (`null`), shows an honest empty state rather than a zeroed one.
 *
 * Issue #40 changed three things here, all of which had the same root cause —
 * a page whose state was derived from reports alone, on a stage where a run can
 * end without ever writing one:
 *
 * - the header tally counts *runs*, so it can no longer read "0 failed" over a
 *   page of failures;
 * - every non-passing row explains itself from the run's own error when there is
 *   no report to explain it, which is also the seed the next implementation run
 *   needs;
 * - outcomes are colour-coded, since a failed run and a passing one previously
 *   read the same at a glance.
 */
export function TestingPanel({ projectId, featureId }: TestingPanelProps) {
  const [results, setResults] = useState<TestingResults | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subview, setSubview] = useState<Subview>("all");

  useEffect(() => {
    let active = true;
    setLoaded(false);
    fetchFeatureTestingResults(projectId, featureId)
      .then((data) => {
        if (!active) return;
        setResults(data);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Unable to load test results.");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [projectId, featureId]);

  const runs = results?.runs ?? [];
  const tally = tallyRuns(runs);
  const headline = testingHeadline(runs, tally);
  const visibleRuns = subview === "failed" ? runs.filter(isFailingRun) : runs;

  return (
    <section className="rounded-card border border-rime bg-surface-01 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-frost">
          <Link
            href={appRoute(`/projects/${projectId}/features/${featureId}/testing`)}
            className="hover:text-teal"
          >
            Testing
          </Link>
        </h2>
        {runs.length > 0 ? (
          <span className="text-xs text-shadow">{tallyLine(tally)}</span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {!loaded ? <p className="mt-4 text-sm text-mist">Loading test results…</p> : null}

      {loaded && !error && runs.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-rime px-4 py-5 text-sm text-shadow">
          Testing hasn&apos;t run for this feature yet — it starts automatically once
          implementation finishes.
        </div>
      ) : null}

      {loaded && !error && runs.length > 0 ? (
        <div className="mt-4">
          <div
            className={cn(
              "mb-4 rounded-md border px-4 py-3 text-sm text-mist",
              toneClasses[headline.tone === "empty" ? "pass" : headline.tone],
            )}
          >
            {headline.message}
          </div>

          <div className="flex gap-4 border-b border-rime-soft">
            {(
              [
                { id: "all", label: "All results" },
                { id: "failed", label: "Failed only" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubview(tab.id)}
                className={cn(
                  "border-b-2 px-1 pb-2 text-[13px] font-medium transition-colors",
                  subview === tab.id
                    ? "border-bifrost text-frost"
                    : "border-transparent text-mist hover:text-frost",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {subview === "failed" && visibleRuns.length === 0 ? (
            <p className="mt-4 text-sm text-mist">
              No failures in this run.
            </p>
          ) : null}

          <div className="mt-4 space-y-5">
            {visibleRuns.map((run) => {
              // A run that completed without reporting is not a failed *job*,
              // but it is a failed outcome for the stage — so it reads red here
              // even though its own status label stays "Completed".
              const tone = isFailingRun(run) ? "fail" : runTone(run);
              const reason = runFailureReason(run);
              return (
                <div
                  key={run.jobId}
                  className={cn(
                    "rounded-md border-l-2 pl-3",
                    tone === "fail"
                      ? "border-l-status-rejected"
                      : tone === "pass"
                        ? "border-l-status-approved"
                        : "border-l-bifrost",
                  )}
                >
                  <p className="flex items-baseline gap-2 text-[13px] font-medium text-mist">
                    {testGroupLabel(run)}
                    <span className={cn("text-xs font-normal", runToneClass(tone))}>
                      {runStatusLabel(run.status)}
                    </span>
                    {run.completedAt ? (
                      <span className="text-xs font-normal text-shadow">
                        {new Date(run.completedAt).toLocaleString()}
                      </span>
                    ) : null}
                  </p>

                  {run.report ? (
                    <div className="mt-2 rounded-md border border-rime-soft px-3 py-2 text-[13px]">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-frost">
                        <span>{run.report.passed} passed</span>
                        <span
                          className={cn(
                            run.report.failed > 0 && "font-medium text-status-rejected",
                          )}
                        >
                          {run.report.failed} failed
                        </span>
                        <span>{run.report.skipped} skipped</span>
                        <span>{run.report.total} total</span>
                        {run.report.coveragePercent != null ? (
                          <span>{run.report.coveragePercent}% coverage</span>
                        ) : null}
                      </div>
                      {run.report.summary ? (
                        <p className="mt-1 text-xs text-shadow">{run.report.summary}</p>
                      ) : null}
                      {run.report.failingTests.length > 0 ? (
                        <ul className="mt-2 list-disc pl-4 font-mono text-xs text-status-rejected">
                          {run.report.failingTests.map((test) => (
                            <li key={test}>{test}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {/* The reason the run did not pass, whatever produced it: a
                      report summary, or the job's own error when there is no
                      report at all. Previously neither was reachable from a
                      failing row. */}
                  {reason ? (
                    <p className="mt-2 rounded-md border border-status-rejected/30 bg-status-rejected/5 px-3 py-2 font-mono text-xs text-status-rejected">
                      {reason}
                    </p>
                  ) : null}

                  {run.steps.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {run.steps.map((step) => (
                        <div
                          key={`${run.jobId}-${step.name}`}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px]",
                            step.status === "pass"
                              ? "border-rime-soft"
                              : "border-status-rejected/30 bg-status-rejected/5",
                          )}
                        >
                          <span
                            className={cn(
                              "shrink-0 text-sm",
                              step.status === "pass"
                                ? "text-status-approved"
                                : "text-status-rejected",
                            )}
                            aria-hidden
                          >
                            {step.status === "pass" ? "\u2713" : "\u2717"}
                          </span>
                          <span className="min-w-0 flex-1 text-frost">{step.name}</span>
                          {step.details ? (
                            <span className="max-w-[50%] truncate text-xs text-shadow">
                              {step.details}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* ADR 029 / issue #40: a recording is one of the failure
                      artefacts a failing row should reach. */}
                  {tone === "fail" ? (
                    <div className="mt-2">
                      <RunRecording run={run} projectId={projectId} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {tally.total > 0 ? (
            <p className="mt-4 text-xs text-shadow">{tallyLine(tally)}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
