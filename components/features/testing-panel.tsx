"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchFeatureTestingResults } from "@/lib/api";
import type { TestingResults } from "@/lib/features/types";
import { cn } from "@/lib/utils";
import { appRoute } from "@/lib/config";

interface TestingPanelProps {
  projectId: string;
  featureId: string;
}

type Subview = "all" | "failed";

function testGroupLabel(testGroup: TestingResults["runs"][number]["testGroup"]): string {
  if (testGroup === "unit") return "Unit";
  if (testGroup === "integration") return "Integration";
  return "Agentic";
}

/**
 * ADR 015 items 9-11 / Track B4-B5: the Testing stage view for a feature in
 * `status === "testing"`. Groups results into Unit / Integration / Agentic
 * with per-row pass/fail + count + duration, and a passed-vs-failed subview
 * mirroring design/.../testing/index.html. When the stage hasn't produced a
 * report yet (`null`), shows an honest empty state rather than a zeroed one.
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
  const reports = runs.flatMap((run) => (run.report ? [run.report] : []));
  const summary = reports.reduce(
    (total, report) => ({
      passed: total.passed + report.passed,
      failed: total.failed + report.failed,
      skipped: total.skipped + report.skipped,
      total: total.total + report.total,
    }),
    { passed: 0, failed: 0, skipped: 0, total: 0 },
  );
  const failed = reports.some((report) => report.failed > 0);
  const running = runs.some(
    (run) => run.status === "pending" || run.status === "running" || !run.report,
  );

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
        {results && runs.length > 0 ? (
          <span className="text-xs text-shadow">
            {summary.passed} passed · {summary.failed} failed · {summary.skipped} skipped
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {!loaded ? <p className="mt-4 text-sm text-mist">Loading test results…</p> : null}

      {loaded && !error && (!results || runs.length === 0) ? (
        <div className="mt-4 rounded-md border border-dashed border-rime px-4 py-5 text-sm text-shadow">
          Testing hasn&apos;t run for this feature yet — it starts automatically once
          implementation finishes.
        </div>
      ) : null}

      {loaded && !error && results && runs.length > 0 ? (
        <div className="mt-4">
          {running ? (
            <div className="mb-4 rounded-md border border-bifrost/30 bg-bifrost/10 px-4 py-3 text-sm text-mist">
              Testing is still running — progress will appear as each step reports.
            </div>
          ) : failed ? (
            <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-mist">
              {summary.failed} failure{summary.failed === 1 ? "" : "s"}{" "}
              &rarr; feature sent back to Implementation with a comment.
            </div>
          ) : (
            <div className="mb-4 rounded-md border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-mist">
              All {summary.total} tests passed — proceeding to Agentic Review.
            </div>
          )}

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

          <div className="mt-4 space-y-5">
            {runs.map((run) => {
              const visible = subview === "failed" && run.report
                ? run.report.failed > 0
                  ? [run]
                  : []
                : [run];
              return visible.length > 0 ? (
                <div key={run.jobId}>
                  <p className="flex items-baseline gap-2 text-[13px] font-medium text-mist">
                    {testGroupLabel(run.testGroup)}
                    <span className="text-xs font-normal text-shadow">
                      {run.status}
                    </span>
                  </p>
                  {run.report ? (
                    <div className="mt-2 rounded-md border border-rime-soft px-3 py-2 text-[13px]">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-frost">
                        <span>{run.report.passed} passed</span>
                        <span>{run.report.failed} failed</span>
                        <span>{run.report.skipped} skipped</span>
                        <span>{run.report.total} total</span>
                        {run.report.coveragePercent != null ? (
                          <span>{run.report.coveragePercent}% coverage</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-shadow">{run.report.summary}</p>
                      {run.report.failingTests.length > 0 ? (
                        <ul className="mt-2 list-disc pl-4 text-xs text-destructive">
                          {run.report.failingTests.map((test) => (
                            <li key={test}>{test}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {run.steps.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {run.steps.map((step) => (
                        <div
                          key={`${run.jobId}-${step.name}`}
                          className="flex items-center gap-2.5 rounded-md border border-rime-soft px-3 py-2 text-[13px]"
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
                </div>
              ) : null;
            })}
          </div>

          {reports.some((report) => report.coveragePercent != null) ? (
            <p className="mt-4 text-xs text-shadow">
              Coverage: {reports.find((report) => report.coveragePercent != null)?.coveragePercent}%
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}