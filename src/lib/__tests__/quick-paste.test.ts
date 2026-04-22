import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  QUICK_PASTE_LIMIT,
  getFlatQuickPasteTargets,
  getGroupedQuickPasteTargets,
} from "../quick-paste";
import type { ClipboardItem } from "../types";

const mockItem = (overrides: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: "1",
  content_type: "plain_text",
  plain_text: "Hello World",
  source_app: "com.test",
  source_app_name: "TestApp",
  content_size: 11,
  content_hash: "abc",
  is_favorited: false,
  created_at: "2026-02-23 10:00:00",
  updated_at: "2026-02-23 10:00:00",
  ...overrides,
});

describe("quick-paste helpers", () => {
  beforeEach(() => {
    // Freeze system time so dateGroupLabel bucketing is deterministic
    // and tests don't drift as real-world time passes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the selected item's group in grouped mode", () => {
    const items = [
      mockItem({ id: "today-0", updated_at: "2026-03-17 10:00:00" }),
      mockItem({ id: "today-1", updated_at: "2026-03-17 11:00:00" }),
      mockItem({ id: "older-0", updated_at: "2020-01-01 10:00:00" }),
      mockItem({ id: "older-1", updated_at: "2020-01-01 11:00:00" }),
    ];

    expect(getGroupedQuickPasteTargets(items, 2)).toEqual([
      { item: items[2], flatIndex: 2, quickIndex: 1 },
      { item: items[3], flatIndex: 3, quickIndex: 2 },
    ]);
  });

  it("returns the first nine items in flat mode", () => {
    const items = Array.from({ length: 12 }, (_, index) => mockItem({ id: `item-${index}` }));

    const targets = getFlatQuickPasteTargets(items);

    expect(targets).toHaveLength(QUICK_PASTE_LIMIT);
    expect(targets[0]).toEqual({ item: items[0], flatIndex: 0, quickIndex: 1 });
    expect(targets[8]).toEqual({ item: items[8], flatIndex: 8, quickIndex: 9 });
  });

  it("returns an empty array when the grouped selection is out of range", () => {
    const items = [mockItem({ id: "only-one" })];

    expect(getGroupedQuickPasteTargets(items, 3)).toEqual([]);
  });
});
