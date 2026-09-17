import { describe, expect, it } from "vitest";
import {
  expiredMessage,
  formatByteSize,
  isPlayable,
  isRunStillRunning,
  recordingLabel,
  recordingViewState,
  retentionNote,
  shouldFetchRecording,
} from "@/lib/features/recordings";
import type { JobRecording } from "@/lib/features/types";

const NOW = new Date("2026-09-18T12:00:00.000Z");

function recording(overrides: Partial<JobRecording> = {}): JobRecording {
  return {
    jobId: "job-1",
    state: "available",
    contentType: "video/webm",
    byteSize: 4_200_000,
    expiresAt: "2026-10-18T12:00:00.000Z",
    purgedAt: null,
    createdAt: "2026-09-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("recordingViewState", () => {
  it("is loading while the request is in flight", () => {
    expect(
      recordingViewState({ loading: true, requestFailed: false, recording: null }),
    ).toBe("loading");
  });

  it("is available for a live recording", () => {
    expect(
      recordingViewState({
        loading: false,
        requestFailed: false,
        recording: recording(),
      }),
    ).toBe("available");
  });

  it("is expired for a reclaimed recording", () => {
    expect(
      recordingViewState({
        loading: false,
        requestFailed: false,
        recording: recording({ state: "expired", purgedAt: NOW.toISOString() }),
      }),
    ).toBe("expired");
  });

  it("is never_recorded when the API answered null", () => {
    // Null is a real answer, not an error: the run finished and produced no
    // recording.
    expect(
      recordingViewState({ loading: false, requestFailed: false, recording: null }),
    ).toBe("never_recorded");
  });

  it("is unavailable — not never_recorded — when the request failed", () => {
    // The distinction matters: claiming "not recorded" would assert a fact we do
    // not have, and would misinform exactly the person chasing a missing
    // artifact.
    expect(
      recordingViewState({ loading: false, requestFailed: true, recording: null }),
    ).toBe("unavailable");
  });

  it("prefers loading over a stale error from a previous attempt", () => {
    // A retry in flight must not keep showing the previous failure.
    expect(
      recordingViewState({ loading: true, requestFailed: true, recording: null }),
    ).toBe("loading");
  });

  it("treats a failure as unavailable even if a stale recording survives", () => {
    expect(
      recordingViewState({
        loading: false,
        requestFailed: true,
        recording: recording(),
      }),
    ).toBe("unavailable");
  });
});

describe("isPlayable", () => {
  it("is true only when bytes are actually fetchable", () => {
    expect(isPlayable("available")).toBe(true);
    for (const state of ["loading", "expired", "never_recorded", "unavailable"] as const) {
      expect(isPlayable(state)).toBe(false);
    }
  });
});

describe("formatByteSize", () => {
  it("uses decimal units, matching the API's own stated cap", () => {
    expect(formatByteSize(999)).toBe("999 B");
    expect(formatByteSize(1_000)).toBe("1.0 kB");
    expect(formatByteSize(25_000_000)).toBe("25 MB");
    expect(formatByteSize(4_200_000)).toBe("4.2 MB");
  });

  it("keeps a decimal only while the number is small enough to need one", () => {
    expect(formatByteSize(1_500)).toBe("1.5 kB");
    expect(formatByteSize(15_000)).toBe("15 kB");
  });

  it("renders a non-value as a dash rather than NaN", () => {
    expect(formatByteSize(Number.NaN)).toBe("—");
    expect(formatByteSize(-1)).toBe("—");
  });
});

describe("recordingLabel", () => {
  it("names the size for a playable recording", () => {
    expect(recordingLabel(recording())).toBe("Recording · 4.2 MB");
  });

  it("says nothing for one whose bytes are gone", () => {
    // The expired copy already explains the size; repeating it in the label
    // would read as a player that failed to load.
    expect(recordingLabel(recording({ state: "expired" }))).toBeNull();
  });
});

describe("expiredMessage", () => {
  it("explains that the recording existed and was removed", () => {
    const message = expiredMessage(
      recording({ state: "expired", purgedAt: NOW.toISOString() }),
    );
    expect(message).toContain("4.2 MB");
    expect(message).toMatch(/retention window/i);
  });

  it("does not invent a retention length the API never sent", () => {
    // The configured window is not in the payload; naming one here would be a
    // fabricated claim that goes stale the moment an operator changes it.
    const message = expiredMessage(
      recording({ state: "expired", purgedAt: NOW.toISOString() }),
    );
    expect(message).not.toMatch(/\b\d+\s*(day|days|week|month|year)/i);
  });

  it("says nothing for a playable recording", () => {
    expect(expiredMessage(recording())).toBeNull();
  });
});

describe("retentionNote", () => {
  it("counts down the days remaining", () => {
    expect(retentionNote(recording(), NOW)).toBe("Removed in 30 days");
  });

  it("says 'tomorrow' at one day rather than 'in 1 days'", () => {
    expect(
      retentionNote(
        recording({ expiresAt: "2026-09-19T12:00:00.000Z" }),
        NOW,
      ),
    ).toBe("Removed tomorrow");
  });

  it("says 'today' inside the final day instead of 'in 0 days'", () => {
    expect(
      retentionNote(
        recording({ expiresAt: "2026-09-18T18:00:00.000Z" }),
        NOW,
      ),
    ).toBe("Removed today");
  });

  it("stays quiet for a window of a year or more", () => {
    // A year-long countdown is noise, not information.
    expect(
      retentionNote(recording({ expiresAt: "2028-09-18T12:00:00.000Z" }), NOW),
    ).toBeNull();
  });

  it("stays quiet once the window has closed", () => {
    expect(
      retentionNote(recording({ expiresAt: "2026-09-01T12:00:00.000Z" }), NOW),
    ).toBeNull();
  });

  it("stays quiet for an unparseable date rather than printing NaN", () => {
    expect(retentionNote(recording({ expiresAt: "not-a-date" }), NOW)).toBeNull();
  });

  it("stays quiet for an already-expired recording", () => {
    expect(
      retentionNote(
        recording({ state: "expired", purgedAt: NOW.toISOString() }),
        NOW,
      ),
    ).toBeNull();
  });

  it("never derives playability from the client clock", () => {
    // A recording the API still calls available must keep its note even if this
    // browser's clock has already run past the expiry — the server decides
    // playability, and only the wording is client-side.
    const stale = recording({
      state: "available",
      expiresAt: "2026-09-01T12:00:00.000Z",
    });
    expect(recordingViewState({ loading: false, requestFailed: false, recording: stale })).toBe(
      "available",
    );
    expect(retentionNote(stale, NOW)).toBeNull();
  });
});

describe("isRunStillRunning / shouldFetchRecording", () => {
  it("skips a run that cannot have a recording yet", () => {
    // The artifact is written when the session ends, so asking during a run
    // would always answer "none" — and showing that as "not recorded" would be
    // misleading while it is still going.
    expect(isRunStillRunning("running")).toBe(true);
    expect(isRunStillRunning("pending")).toBe(true);
    expect(shouldFetchRecording("running")).toBe(false);
    expect(shouldFetchRecording("pending")).toBe(false);
  });

  it("fetches for every finished run, including failed ones", () => {
    // A failed run is where a recording is most valuable, so it must not be
    // skipped by the same rule that skips a running one.
    for (const status of ["completed", "failed", "cancelled"]) {
      expect(shouldFetchRecording(status)).toBe(true);
    }
  });
});
