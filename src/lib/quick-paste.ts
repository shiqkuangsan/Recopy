import { dateGroupLabel } from "./time";
import type { ClipboardItem } from "./types";

export const QUICK_PASTE_LIMIT = 9;

export interface QuickPasteTarget {
  item: ClipboardItem;
  flatIndex: number;
  quickIndex: number;
}

export function getFlatQuickPasteTargets(items: ClipboardItem[]): QuickPasteTarget[] {
  return items.slice(0, QUICK_PASTE_LIMIT).map((item, index) => ({
    item,
    flatIndex: index,
    quickIndex: index + 1,
  }));
}

export function getGroupedQuickPasteTargets(
  items: ClipboardItem[],
  selectedIndex: number,
): QuickPasteTarget[] {
  if (selectedIndex < 0 || selectedIndex >= items.length) return [];

  const selectedLabel = dateGroupLabel(items[selectedIndex].updated_at);
  const groupItems: Array<{ item: ClipboardItem; flatIndex: number }> = [];

  items.forEach((item, flatIndex) => {
    if (dateGroupLabel(item.updated_at) === selectedLabel) {
      groupItems.push({ item, flatIndex });
    }
  });

  return groupItems.slice(0, QUICK_PASTE_LIMIT).map(({ item, flatIndex }, index) => ({
    item,
    flatIndex,
    quickIndex: index + 1,
  }));
}

export function getQuickPasteTargets(
  items: ClipboardItem[],
  selectedIndex: number,
  grouped: boolean,
): QuickPasteTarget[] {
  return grouped
    ? getGroupedQuickPasteTargets(items, selectedIndex)
    : getFlatQuickPasteTargets(items);
}
