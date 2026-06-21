"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight } from "lucide-react";
import type { ActionQueueItem } from "@/lib/features/types";
import { ACTION_QUEUE_LABELS } from "@/lib/features/statuses";
import { appRoute } from "@/lib/config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ActionQueueProps {
  items: ActionQueueItem[];
}

export function ActionQueue({ items }: ActionQueueProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action queue</CardTitle>
          <CardDescription>Nothing needs your attention right now.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Action queue</CardTitle>
        <CardDescription>Items blocking progress, oldest first.</CardDescription>
      </CardHeader>
      <ul className="divide-y divide-rime-soft border-t border-rime-soft">
        {items.map((item) => (
          <li key={`${item.type}-${item.featureId ?? item.testId}`}>
            <Link
              href={appRoute(item.linkPath)}
              className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-02"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-shadow">
                  {ACTION_QUEUE_LABELS[item.type] ?? item.type}
                </p>
                <p className="truncate font-medium text-frost">{item.title}</p>
                <p className="text-xs text-shadow">
                  Waiting{" "}
                  {formatDistanceToNow(new Date(item.waitingSince), { addSuffix: true })}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-hidden>
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
