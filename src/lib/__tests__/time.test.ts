import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { relativeTime, dateGroupLabel, formatSize } from "../time";

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return just now for less than 60 seconds ago", () => {
    expect(relativeTime("2026-03-12 11:59:30")).toBe("just now");
  });

  it("should return just now for 0 seconds ago", () => {
    expect(relativeTime("2026-03-12 12:00:00")).toBe("just now");
  });

  it("should return just now for 59 seconds ago", () => {
    expect(relativeTime("2026-03-12 11:59:01")).toBe("just now");
  });

  it("should return minutes ago at exactly 60 seconds", () => {
    expect(relativeTime("2026-03-12 11:59:00")).toBe("1m ago");
  });

  it("should return minutes ago for 30 minutes", () => {
    expect(relativeTime("2026-03-12 11:30:00")).toBe("30m ago");
  });

  it("should return minutes ago for 59 minutes", () => {
    expect(relativeTime("2026-03-12 11:01:00")).toBe("59m ago");
  });

  it("should return hours ago at exactly 60 minutes", () => {
    expect(relativeTime("2026-03-12 11:00:00")).toBe("1h ago");
  });

  it("should return hours ago for 12 hours", () => {
    expect(relativeTime("2026-03-12 00:00:00")).toBe("12h ago");
  });

  it("should return hours ago for 23 hours", () => {
    expect(relativeTime("2026-03-11 13:00:00")).toBe("23h ago");
  });

  it("should return days ago at exactly 24 hours", () => {
    expect(relativeTime("2026-03-11 12:00:00")).toBe("1d ago");
  });

  it("should return days ago for 3 days", () => {
    expect(relativeTime("2026-03-09 12:00:00")).toBe("3d ago");
  });

  it("should return days ago for 6 days", () => {
    expect(relativeTime("2026-03-06 12:00:00")).toBe("6d ago");
  });

  it("should return formatted date at exactly 7 days", () => {
    const result = relativeTime("2026-03-05 12:00:00");
    expect(result).not.toContain("ago");
    expect(result).not.toBe("just now");
  });

  it("should return formatted date for 30 days ago", () => {
    const result = relativeTime("2026-02-10 12:00:00");
    expect(result).not.toContain("ago");
    expect(result).not.toBe("just now");
  });
});

describe("dateGroupLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return today for items from today", () => {
    expect(dateGroupLabel("2026-03-12 08:00:00")).toBe("time.today");
  });

  it("should return today for items from very early today", () => {
    expect(dateGroupLabel("2026-03-12 00:00:01")).toBe("time.today");
  });

  it("should return thisWeek for 1 day ago", () => {
    expect(dateGroupLabel("2026-03-10 12:00:00")).toBe("time.thisWeek");
  });

  it("should return thisWeek for 2 days ago", () => {
    expect(dateGroupLabel("2026-03-10 12:00:00")).toBe("time.thisWeek");
  });

  it("should return thisWeek for 6 days ago", () => {
    expect(dateGroupLabel("2026-03-06 12:00:00")).toBe("time.thisWeek");
  });

  it("should return thisMonth for exactly 7 days ago", () => {
    expect(dateGroupLabel("2026-03-05 12:00:00")).toBe("time.thisMonth");
  });

  it("should return thisMonth for 15 days ago", () => {
    expect(dateGroupLabel("2026-02-25 12:00:00")).toBe("time.thisMonth");
  });

  it("should return thisMonth for 29 days ago", () => {
    expect(dateGroupLabel("2026-02-11 12:00:00")).toBe("time.thisMonth");
  });

  it("should return earlier for exactly 30 days ago", () => {
    expect(dateGroupLabel("2026-02-10 12:00:00")).toBe("time.earlier");
  });

  it("should return earlier for 60 days ago", () => {
    expect(dateGroupLabel("2026-01-11 12:00:00")).toBe("time.earlier");
  });

  it("should return earlier for items from a different year", () => {
    expect(dateGroupLabel("2025-06-01 12:00:00")).toBe("time.earlier");
  });
});

describe("formatSize", () => {
  it("should return bytes for 0", () => {
    expect(formatSize(0)).toBe("0 B");
  });

  it("should return bytes for small values", () => {
    expect(formatSize(500)).toBe("500 B");
  });

  it("should return bytes for 1023", () => {
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("should return KB at exactly 1024 bytes", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
  });

  it("should return KB for typical file sizes", () => {
    expect(formatSize(5120)).toBe("5.0 KB");
  });

  it("should return KB with decimal precision", () => {
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it("should return KB for values just under 1 MB", () => {
    expect(formatSize(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("should return MB at exactly 1 MB", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("should return MB for typical values", () => {
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("should return MB with decimal precision", () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("should return MB for very large values", () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe("1024.0 MB");
  });

  it("should return 1 B for 1 byte", () => {
    expect(formatSize(1)).toBe("1 B");
  });
});
