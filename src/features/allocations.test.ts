import { describe, expect, it } from "vitest";
import {
  APPROACHING_THRESHOLD_PERCENT,
  capPercent,
  capStatus,
  capSummary,
  formatCpu,
  formatMemory,
  formatPeriod,
  formatQuotaSummary,
  formatTokenCap,
  formatTokensCompact,
  gibToMib,
  mibToGib,
  millicoresToVcpu,
  quotaSourceLabel,
  validateQuotaInput,
  vcpuToMillicores,
} from "@/lib/features/allocations";
import type { ProjectResourceQuota, TokenCapState } from "@/lib/features/types";

function capState(overrides: Partial<TokenCapState> = {}): TokenCapState {
  return {
    projectId: "proj-1",
    cap: 1000,
    usedTokens: 0,
    remainingTokens: 1000,
    exceeded: false,
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("capStatus / capPercent", () => {
  it("reports an uncapped project as uncapped regardless of usage", () => {
    const state = capState({ cap: null, usedTokens: 999_999, remainingTokens: null });
    expect(capStatus(state)).toBe("uncapped");
    expect(capPercent(state)).toBeNull();
  });

  it("reports ok well below the cap", () => {
    expect(capStatus(capState({ usedTokens: 100 }))).toBe("ok");
    expect(capPercent(capState({ usedTokens: 250 }))).toBe(25);
  });

  it("reports approaching at exactly the threshold", () => {
    // The boundary the threshold exists for: 80% is "approaching", not "ok".
    const state = capState({ usedTokens: (1000 * APPROACHING_THRESHOLD_PERCENT) / 100 });
    expect(capStatus(state)).toBe("approaching");
  });

  it("reports approaching just below the cap", () => {
    expect(capStatus(capState({ usedTokens: 999 }))).toBe("approaching");
  });

  it("reports exceeded from the state, not from arithmetic", () => {
    // `exceeded` is the API's decision (used >= cap). The display must follow it
    // rather than re-deriving, so the two can never disagree.
    expect(capStatus(capState({ usedTokens: 1000, exceeded: true }))).toBe("exceeded");
  });

  it("shows an overshoot past 100% rather than clamping it", () => {
    const state = capState({ usedTokens: 1500, exceeded: true, remainingTokens: 0 });
    expect(capPercent(state)).toBe(150);
  });

  it("treats a zero cap as fully consumed", () => {
    const state = capState({ cap: 0, usedTokens: 0, exceeded: true, remainingTokens: 0 });
    expect(capStatus(state)).toBe("exceeded");
    expect(capPercent(state)).toBe(100);
  });
});

describe("formatTokenCap", () => {
  it("renders millions in the shape the design mock uses", () => {
    expect(formatTokenCap(4_000_000)).toBe("4M tokens");
  });

  it("keeps a decimal for a non-round million", () => {
    expect(formatTokenCap(4_500_000)).toBe("4.5M tokens");
  });

  it("renders thousands, and small values plainly", () => {
    expect(formatTokenCap(75_000)).toBe("75K tokens");
    expect(formatTokenCap(500)).toBe("500 tokens");
  });

  it("distinguishes uncapped from a zero cap", () => {
    // The two are different facts, and this is the label a human sees.
    expect(formatTokenCap(null)).toBe("Uncapped");
    expect(formatTokenCap(0)).toBe("No further work");
  });
});

describe("formatTokensCompact", () => {
  it("compacts millions and thousands", () => {
    expect(formatTokensCompact(1_200_000)).toBe("1.2M");
    expect(formatTokensCompact(12_000_000)).toBe("12M");
    expect(formatTokensCompact(4_500)).toBe("4.5K");
    expect(formatTokensCompact(450_000)).toBe("450K");
  });

  it("leaves small counts alone", () => {
    expect(formatTokensCompact(42)).toBe("42");
  });
});

describe("formatPeriod", () => {
  it("names the month the cap is enforced over, in UTC", () => {
    expect(formatPeriod("2026-09-01T00:00:00.000Z")).toBe("September 2026");
  });

  it("does not drift a day for a UTC boundary in a negative-offset zone", () => {
    // 2026-10-01T00:00Z is still September 30th in the Americas; the label must
    // follow the period the API actually enforces.
    expect(formatPeriod("2026-10-01T00:00:00.000Z")).toBe("October 2026");
  });
});

describe("capSummary", () => {
  it("explains a blocked project and what to do about it", () => {
    const summary = capSummary(capState({ usedTokens: 1200, exceeded: true, remainingTokens: 0 }));
    expect(summary).toContain("At the cap");
    expect(summary).toContain("blocked");
    expect(summary).toContain("raised, cleared, or the period rolls over");
  });

  it("warns as a project approaches the cap", () => {
    expect(capSummary(capState({ usedTokens: 900 }))).toContain("approaching the cap");
  });

  it("says so plainly when nothing is capped", () => {
    expect(
      capSummary(capState({ cap: null, remainingTokens: null })),
    ).toContain("No monthly cap");
  });
});

describe("unit conversions (ADR 030 §5)", () => {
  it("round-trips vCPU and millicores", () => {
    expect(vcpuToMillicores(2)).toBe(2000);
    expect(vcpuToMillicores(0.5)).toBe(500);
    expect(millicoresToVcpu(500)).toBe(0.5);
  });

  it("rounds rather than truncates, so a value never comes back smaller", () => {
    expect(vcpuToMillicores(0.333)).toBe(333);
    expect(gibToMib(0.1)).toBe(102);
  });

  it("round-trips GiB and MiB", () => {
    expect(gibToMib(4)).toBe(4096);
    expect(mibToGib(4096)).toBe(4);
  });
});

describe("quota formatting", () => {
  it("renders whole values without a trailing decimal", () => {
    expect(formatCpu(2000)).toBe("2 vCPU");
    expect(formatMemory(4096)).toBe("4 GiB");
  });

  it("renders fractional values to two places", () => {
    expect(formatCpu(500)).toBe("0.5 vCPU");
    expect(formatMemory(512)).toBe("0.5 GiB");
  });

  it("summarizes a quota for one table cell", () => {
    expect(
      formatQuotaSummary({
        cpuMillicores: 2000,
        memoryMib: 4096,
        pods: 6,
        fromOverride: true,
      } as ProjectResourceQuota),
    ).toBe("2 vCPU · 4 GiB · 6 pods");
  });

  it("labels whether the numbers are the project's own or the platform default", () => {
    const base = { cpuMillicores: 2000, memoryMib: 4096, pods: 6 };
    expect(quotaSourceLabel({ ...base, fromOverride: true })).toBe("Project override");
    expect(quotaSourceLabel({ ...base, fromOverride: false })).toBe("Platform default");
  });
});

describe("validateQuotaInput", () => {
  const valid = { vcpu: 2, gib: 4, pods: 6 };

  it("accepts a realistic quota", () => {
    expect(validateQuotaInput(valid)).toBeNull();
  });

  it("rejects a namespace too small to hold the project's own deployment", () => {
    // 0 pods or 0 CPU would make every job in the namespace fail at admission.
    expect(validateQuotaInput({ ...valid, pods: 0 })).toContain("at least 1");
    expect(validateQuotaInput({ ...valid, vcpu: 0 })).toContain("greater than zero");
  });

  it("rejects non-finite and negative numbers", () => {
    expect(validateQuotaInput({ ...valid, vcpu: Number.NaN })).not.toBeNull();
    expect(validateQuotaInput({ ...valid, gib: -1 })).not.toBeNull();
  });

  it("rejects fractional pod counts", () => {
    expect(validateQuotaInput({ ...valid, pods: 2.5 })).toContain("whole number");
  });

  it("enforces the same bounds the API does", () => {
    expect(validateQuotaInput({ ...valid, vcpu: 0.05 })).toContain("between 0.1 and 1000");
    expect(validateQuotaInput({ ...valid, vcpu: 2000 })).toContain("between 0.1 and 1000");
    expect(validateQuotaInput({ ...valid, gib: 0.01 })).toContain("between 0.125 and 1024");
    expect(validateQuotaInput({ ...valid, pods: 5000 })).toContain("1000 or fewer");
  });
});
