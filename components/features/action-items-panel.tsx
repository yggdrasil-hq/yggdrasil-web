"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  autoResolveFeatureActionItems,
  createTestFromActionItem,
  fetchFeatureActionItems,
  resolveFeatureActionItem,
} from "@/lib/api";
import type { ActionItem } from "@/lib/api";
import type { FeatureStatus } from "@/lib/features/statuses";
import { appRoute } from "@/lib/config";

const ACTION_TYPE_LABELS: Record<ActionItem["type"], string> = {
  secret_request: "Secret / env var",
  design_grill: "Design session",
  subtask_feature: "Blocking subtask feature",
  test_request: "Test request",
};

interface ActionItemsPanelProps {
  projectId: string;
  featureId: string;
  status: FeatureStatus;
  /**
   * Reports the current count of open (unresolved) action items whenever it
   * changes, so the feature-detail page can gate "Start build" preemptively
   * (ADR 015 item 2) without also fetching the list itself.
   */
  onOpenCountChange?: (openCount: number) => void;
}

/**
 * ADR 015 items 2 & 5: an Action Items view of the `spec_ready` state. Lists
 * the batch `spec_grill` produced, offers mechanical resolution (secret sweep,
 * manual mark-resolved for human-supervised types), and shows that "Start
 * build" stays gated until every item is resolved.
 */
export function ActionItemsPanel({
  projectId,
  featureId,
  status,
  onOpenCountChange,
}: ActionItemsPanelProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testInputs, setTestInputs] = useState<
    Record<string, { name: string; scheduleCron: string }>
  >({});

  function load() {
    setLoading(true);
    fetchFeatureActionItems(projectId, featureId)
      .then((next) => {
        setItems(next);
        const open = next.filter((item) => item.status === "open").length;
        onOpenCountChange?.(open);
      })
      .catch(() => setError("Unable to load action items."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [projectId, featureId]);

  const open = items.filter((item) => item.status === "open");
  const resolved = items.filter((item) => item.status === "resolved");

  if (status !== "spec_ready" && items.length === 0) {
    return null;
  }

  async function sweep() {
    setError(null);
    try {
      const result = await autoResolveFeatureActionItems(projectId, featureId);
      // Re-fetch to reflect any newly resolved items.
      await load();
      if (result.resolved > 0) {
        void result;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resolve action items.");
    }
  }

  async function markResolved(itemId: string) {
    setError(null);
    try {
      await resolveFeatureActionItem(projectId, featureId, itemId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resolve action item.");
    }
  }

  async function createTest(item: ActionItem) {
    const input = testInputs[item.id] ?? {
      name: item.description.slice(0, 256),
      scheduleCron: "0 0 * * *",
    };
    setError(null);
    try {
      await createTestFromActionItem(projectId, featureId, item.id, {
        ...input,
        specMarkdown: item.draftTestMarkdown ?? item.description,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create test.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Action Items</CardTitle>
        <CardDescription>
          Requirements raised by spec_grill before implementation can start.
          {open.length > 0 ? ` ${open.length} still open — Start build is disabled until all resolve.` : ""}
        </CardDescription>
      </CardHeader>
      <div className="space-y-2 px-4 pb-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading ? <p className="text-sm text-mist">Loading…</p> : null}

        {!loading && open.length === 0 && resolved.length === 0 ? (
          <p className="text-sm text-mist">No action items for this feature.</p>
        ) : null}

        {open.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-shadow">Open</p>
            {open.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-md border border-rime px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-shadow">{ACTION_TYPE_LABELS[item.type]}</p>
                  <p className="text-sm text-frost">{item.description}</p>
                  {item.secretKey ? (
                    <p className="mt-0.5 font-mono text-xs text-mist">{item.secretKey}</p>
                  ) : null}
                </div>
                {item.type === "design_grill" ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={appRoute(
                        `/projects/${projectId}/designs/new?featureId=${featureId}&actionItemId=${item.id}`,
                      )}
                    >
                      Start design
                    </Link>
                  </Button>
                ) : item.type === "subtask_feature" && item.subtaskFeatureId ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={appRoute(
                        `/projects/${projectId}/features/${item.subtaskFeatureId}`,
                      )}
                    >
                      Open subtask
                    </Link>
                  </Button>
                ) : item.type === "test_request" ? (
                  <div className="flex w-56 flex-col gap-2">
                    <Input
                      value={testInputs[item.id]?.name ?? item.description.slice(0, 256)}
                      onChange={(event) =>
                        setTestInputs((current) => ({
                          ...current,
                          [item.id]: {
                            name: event.target.value,
                            scheduleCron: current[item.id]?.scheduleCron ?? "0 0 * * *",
                          },
                        }))
                      }
                      placeholder="Test name"
                    />
                    <Input
                      value={testInputs[item.id]?.scheduleCron ?? "0 0 * * *"}
                      onChange={(event) =>
                        setTestInputs((current) => ({
                          ...current,
                          [item.id]: {
                            name: current[item.id]?.name ?? item.description.slice(0, 256),
                            scheduleCron: event.target.value,
                          },
                        }))
                      }
                      placeholder="Cron schedule"
                    />
                    <Button variant="outline" size="sm" onClick={() => void createTest(item)}>
                      Create test
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void markResolved(item.id)}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            ))}
            {open.some((item) => item.type === "secret_request") ? (
              <Button variant="ghost" size="sm" onClick={() => void sweep()}>
                Check secrets &amp; auto-resolve
              </Button>
            ) : null}
          </div>
        ) : null}

        {resolved.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-shadow">Resolved</p>
            {resolved.map((item) => (
              <div key={item.id} className="rounded-md border border-rime-soft px-3 py-2 text-sm">
                <span className="text-mist line-through">{item.description}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}