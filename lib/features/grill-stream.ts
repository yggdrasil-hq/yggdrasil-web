import type { FeatureEvent, JobStatus } from "./types";

/**
 * The streaming-text buffer's lifecycle for the grill transcript (ADR 019 item
 * 13).
 *
 * The buffer holds assistant text that has arrived over the live relay but is
 * not yet in the transcript. It is *provisional*: the deltas for one message
 * concatenate to exactly the text the authoritative `agent_text` event carries
 * at `message_end`, so the buffer is a preview of a record that is about to
 * exist, never a record in its own right.
 *
 * These two rules are what keep that true, and they live here rather than inline
 * in the component so they can be unit-tested — this repo has no component
 * testing library by design, so anything only expressed in JSX is unverified.
 */

/**
 * How many authoritative assistant messages a transcript contains.
 *
 * Counting `agent_text` (rather than, say, looking for the buffer's own text)
 * is what makes the supersede rule robust: the finished event is a faithful
 * superset of what the deltas built, so it cannot fail to match on some
 * whitespace or markdown nuance the way a substring comparison could.
 */
export function countAgentTextEvents(events: Array<Pick<FeatureEvent, "type">>): number {
  return events.filter((event) => event.type === "agent_text").length;
}

/**
 * Whether a completed transcript read means the streaming buffer is stale.
 *
 * Two ways, and both are needed:
 *
 *  - **A new authoritative message.** The count rose, so the message whose
 *    deltas are buffered has now been persisted in full. Keeping the buffer
 *    would render the same text twice.
 *  - **The run is no longer running.** A stream that stops mid-message — a
 *    crash, a cancel — never persists its partial text, so the buffer would
 *    leave an agent utterance on screen that is not in the transcript and never
 *    will be.
 *
 * Comparing counts rather than clearing on every read is what keeps this from
 * flickering: a mid-stream read that has not yet seen the finished message must
 * leave the growing bubble alone, or the text would blink away and re-appear on
 * the next chunk.
 */
export function shouldDropStreamBuffer(input: {
  previousAgentTextCount: number;
  agentTextCount: number;
  jobStatus: JobStatus | null;
}): boolean {
  if (input.agentTextCount > input.previousAgentTextCount) return true;
  return input.jobStatus !== "running";
}
