"use client";

import { Markdown } from "@/components/markdown";
import { grillBubbleFor, type GrillBubbleTone } from "@/lib/features/grill";
import type { FeatureEvent } from "@/lib/features/types";

/**
 * One turn of a grill transcript, rendered.
 *
 * **Extracted so a superseded run reads exactly like the current one** (issue #28
 * part 2). The read-only view of an earlier run has to present the same events the
 * live page does, and the alternative — a second bubble renderer in the new page —
 * would be two spellings of one presentation, drifting the first time either
 * changed. The *logic* was already shared (`grillBubbleFor` in
 * `lib/features/grill.ts`); this shares the markup around it.
 *
 * Deliberately presentation only: no reply box, no rewind control, no polling. The
 * live page composes those around these components, which is what keeps a terminal
 * run's transcript read-only by construction rather than by a flag someone could
 * forget to pass.
 */

export function GrillEvent({ event }: { event: FeatureEvent }) {
  const bubble = grillBubbleFor(event);
  if (!bubble) return null;
  return <GrillBubble label={bubble.label} tone={bubble.tone} content={bubble.content} />;
}

export function GrillBubble({
  label,
  tone = "default",
  content,
}: {
  label: string;
  tone?: GrillBubbleTone;
  content: string;
}) {
  return (
    <div className={`flex ${tone === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`w-[90%] max-w-3xl rounded-md border p-3 ${
          tone === "user" ? "border-rime bg-surface-03" : "border-rime-soft bg-surface-02"
        }`}
      >
        <p
          className={`text-xs font-medium ${tone === "error" ? "text-red-400" : "text-shadow"}`}
        >
          {label}
        </p>
        <Markdown content={content} className="mt-1" />
      </div>
    </div>
  );
}
