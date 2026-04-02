import { describe, it, expect } from "vitest";
import { formatTokens, formatCost, formatTimestamp } from "../src/utils/format.js";

describe("formatTokens", () => {
  it("returns raw number below 1000", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands with k suffix", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(42300)).toBe("42.3k");
    expect(formatTokens(999999)).toBe("1000.0k");
  });

  it("formats millions with M suffix", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(2_500_000)).toBe("2.5M");
    expect(formatTokens(10_000_000)).toBe("10.0M");
  });
});

describe("formatCost", () => {
  it("returns <$0.01 for very small costs", () => {
    expect(formatCost(100, 3.0)).toBe("<$0.01");
    expect(formatCost(0, 15.0)).toBe("<$0.01");
  });

  it("formats sub-dollar costs with two decimals", () => {
    expect(formatCost(100_000, 3.0)).toBe("$0.30");
    expect(formatCost(50_000, 15.0)).toBe("$0.75");
  });

  it("formats dollar+ costs with two decimals", () => {
    expect(formatCost(1_000_000, 3.0)).toBe("$3.00");
    expect(formatCost(200_000, 15.0)).toBe("$3.00");
    expect(formatCost(5_000_000, 2.5)).toBe("$12.50");
  });

  it("returns N/A for non-finite or negative inputs", () => {
    expect(formatCost(NaN, 3.0)).toBe("N/A");
    expect(formatCost(1000, NaN)).toBe("N/A");
    expect(formatCost(Infinity, 3.0)).toBe("N/A");
    expect(formatCost(1000, Infinity)).toBe("N/A");
    expect(formatCost(-1000, 3.0)).toBe("N/A");
    expect(formatCost(1000, -3.0)).toBe("N/A");
  });
});

describe("formatTimestamp", () => {
  it("formats a specific date correctly", () => {
    const d = new Date(2026, 3, 1, 14, 22, 5); // April 1, 2026 14:22:05
    expect(formatTimestamp(d)).toBe("04.01.2026 | 14:22:05");
  });

  it("pads single-digit months, days, hours, minutes, seconds", () => {
    const d = new Date(2026, 0, 5, 3, 7, 9); // Jan 5, 2026 03:07:09
    expect(formatTimestamp(d)).toBe("01.05.2026 | 03:07:09");
  });
});
