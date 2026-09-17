import type { JobRecording } from "./types";

/**
 * ADR 029: the pure half of playing back a run's screen recording.
 *
 * The Web app has no React testing library (deliberately — vitest runs in a
 * `node` environment), so every decision the recording UI makes lives here where
 * it can be unit-tested, and the component is left with markup and fetching.
 *
 * The decision that matters most is which of five states the player is in.
 * Getting that wrong is what produces the two failure modes this feature is
 * built to avoid: an empty player with no explanation when a recording was
 * legitimately reclaimed, and a broken `<video>` element when no recording ever
 * existed.
 */

/**
 * What the player should render.
 *
 * `loading` and `unavailable` are client-side concerns — a request in flight, or
 * one that failed outright — while `available`, `expired` and `never_recorded`
 * are the three states the API can actually report. Keeping them in one union
 * means the component has a single switch to get right rather than a pile of
 * booleans that can contradict each other.
 */
export type RecordingViewState =
  | "loading"
  | "available"
  | "expired"
  | "never_recorded"
  | "unavailable";

/**
 * The view state for one run.
 *
 * `requestFailed` is a separate input rather than being folded into `recording`
 * because "the API could not tell us" must not be shown as "there is no
 * recording": the second would quietly assert a fact we do not know, and an
 * operator chasing a missing artifact would be told the wrong thing. If a fetch
 * fails, the UI says so and offers a retry.
 */
export function recordingViewState(input: {
  loading: boolean;
  requestFailed: boolean;
  recording: JobRecording | null;
}): RecordingViewState {
  if (input.loading) return "loading";
  if (input.requestFailed) return "unavailable";
  if (!input.recording) return "never_recorded";
  return input.recording.state === "expired" ? "expired" : "available";
}

/** Whether a player should actually be rendered (i.e. bytes are fetchable). */
export function isPlayable(state: RecordingViewState): boolean {
  return state === "available";
}

/**
 * A stable size, in decimal units (MB = 10^6) so it matches both how storage
 * reports the artifact and the API's own cap, which is stated in the same units.
 */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1_000) return `${bytes} B`;
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1_000;
  let unit = 0;
  while (value >= 1_000 && unit < units.length - 1) {
    value /= 1_000;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * The one-line label beside the player, e.g. "Recording · 4.2 MB".
 *
 * Returns null when there is nothing to say, so the caller renders no line at
 * all rather than an empty one.
 */
export function recordingLabel(recording: JobRecording): string | null {
  if (recording.state === "expired") return null;
  return `Recording · ${formatByteSize(recording.byteSize)}`;
}

/**
 * Why a recording is no longer playable, in the user's terms.
 *
 * Never mentions retention *days* directly — the API does not tell us the
 * configured window, and inventing a number here would be a fabricated claim
 * that silently goes stale if an operator changes the setting. "After its
 * retention window" is true regardless of what that window is.
 *
 * Returns null for the states that need no explanation (available, loading),
 * so the caller can render conditionally on a null rather than on a state name.
 */
export function expiredMessage(recording: JobRecording): string | null {
  if (recording.state !== "expired") return null;
  const size = formatByteSize(recording.byteSize);
  return `This run was recorded (${size}), but the recording was removed after its retention window.`;
}

/**
 * Whether an expiry timestamp has passed, using the browser's clock.
 *
 * Only used for the *countdown* copy below, never to decide whether a recording
 * is playable — that comes from the API's own `state`, computed on the server
 * against the same rule the retention sweep uses. A client clock that is wrong
 * (or a machine in a different timezone) must not be able to make an expired
 * recording look playable or vice versa.
 */
function hasExpired(expiresAt: string, now: Date): boolean {
  const parsed = new Date(expiresAt).getTime();
  if (!Number.isFinite(parsed)) return false;
  return parsed <= now.getTime();
}

/**
 * A short note about how long the recording will remain, or null when there is
 * nothing useful to add (already expired, unparseable date, or a window of a
 * year or more, where a countdown is noise rather than information).
 */
export function retentionNote(recording: JobRecording, now: Date): string | null {
  if (recording.state === "expired") return null;
  const expiry = new Date(recording.expiresAt).getTime();
  if (!Number.isFinite(expiry)) return null;
  if (hasExpired(recording.expiresAt, now)) return null;

  const days = Math.floor((expiry - now.getTime()) / 86_400_000);
  if (days >= 365) return null;
  if (days <= 0) return "Removed today";
  if (days === 1) return "Removed tomorrow";
  return `Removed in ${days} days`;
}

/**
 * What to show for a run that is still going.
 *
 * A running test cannot have a recording yet — the artifact is written when the
 * session ends — so asking the API would always answer "none", and rendering
 * that as "this run was not recorded" would be actively misleading while the run
 * is still in progress. The caller uses this to stay quiet instead.
 */
export function isRunStillRunning(status: string): boolean {
  return status === "running" || status === "pending";
}

/**
 * Which runs are worth asking the API about.
 *
 * Only finished runs can have a recording, so a run still going is skipped
 * rather than fetched-and-disappointing. Pure so the component's fetch loop
 * stays trivial.
 */
export function shouldFetchRecording(status: string): boolean {
  return !isRunStillRunning(status);
}
