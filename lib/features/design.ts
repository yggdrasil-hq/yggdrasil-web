import type { FeatureEvent } from "./types";

export function getLatestDesignSnapshot(
  events: FeatureEvent[],
): Record<string, string> {
  let latest: Record<string, string> = {};
  for (const event of events) {
    if (
      (event.type === "update_design_preview" || event.type === "submit_design") &&
      event.snapshot
    ) {
      latest = event.snapshot;
    }
  }
  return latest;
}

export function isDesignReplyPending(events: FeatureEvent[]): boolean {
  let lastAsk = -1;
  let lastReply = -1;
  events.forEach((event, index) => {
    if (event.type === "ask_user" && event.question) lastAsk = index;
    if (event.type === "user_message") lastReply = index;
  });
  return lastAsk > lastReply;
}
