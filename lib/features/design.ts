import type { FeatureEvent } from "./types";

/**
 * How often a design session re-reads when the relay is **not** live (issue #25).
 *
 * Unchanged from the pre-relay value, so a socket that never connects degrades to
 * exactly the old behaviour. Lives here rather than inline in the component for the
 * same reason as `TESTING_POLL_INTERVAL_MS`: so a test can assert the fallback the
 * surface actually uses, rather than the test restating a number the component
 * might no longer contain.
 *
 * When the relay *is* live the interval becomes the shared 30s safety floor via
 * `pollIntervalMsForRelay` — the socket supplies the latency and the poll is only
 * the net under a silently-dead relay.
 */
export const DESIGN_POLL_INTERVAL_MS = 2000;

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
