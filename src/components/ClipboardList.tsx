import { useMemo, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useClipboardStore } from "../stores/clipboard-store";
import { ClipboardCard } from "./ClipboardCard";
import { dateGroupLabel } from "../lib/time";
import { Clipboard } from "lucide-react";

import type { ClipboardItem } from "../lib/types";

interface DateGroup {
  label: string;
  items: { item: ClipboardItem; flatIndex: number }[];
}

export function ClipboardList() {
  const { t } = useTranslation();
  const items = useClipboardStore((s) => s.items);
  const selectedIndex = useClipboardStore((s) => s.selectedIndex);
  const setSelectedIndex = useClipboardStore((s) => s.setSelectedIndex);
  const loading = useClipboardStore((s) => s.loading);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Group items by date
  const groups = useMemo(() => {
    const result: DateGroup[] = [];
    let lastLabel = "";
    let currentGroup: DateGroup | null = null;

    items.forEach((item, flatIndex) => {
      const label = dateGroupLabel(item.updated_at);
      if (label !== lastLabel) {
        currentGroup = { label, items: [] };
        result.push(currentGroup);
        lastLabel = label;
      }
      currentGroup!.items.push({ item, flatIndex });
    });

    return result;
  }, [items]);

  // Convert vertical-only wheel events to horizontal scroll on card rows.
  // Mouse wheels only produce deltaY, which overflow-x containers ignore.
  // Trackpad horizontal swipes (deltaX !== 0) and shift+wheel are left
  // to the browser's native handling.
  const onRowWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
    if (e.deltaX !== 0 || e.shiftKey) return; // native horizontal scroll
    if (e.deltaY !== 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  }, []);

  // Auto-scroll selected card into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedIndex]);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t("list.loading")}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Clipboard size={40} strokeWidth={1.5} />
        <p className="text-sm">{t("list.empty")}</p>
        <p className="text-xs">{t("list.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      {groups.map((group) => (
        <div key={group.label} className="mb-1">
          <div className="text-xs font-medium text-muted-foreground px-1 py-1">
            {t(group.label)}
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1" onWheel={onRowWheel}>
            {group.items.map(({ item, flatIndex }) => (
              <div
                key={item.id}
                ref={flatIndex === selectedIndex ? selectedRef : undefined}
                className="shrink-0 w-[300px] h-[260px]"
              >
                <ClipboardCard
                  item={item}
                  selected={flatIndex === selectedIndex}
                  onClick={() => setSelectedIndex(flatIndex)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
