import { useMemo, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useClipboardStore } from "../stores/clipboard-store";
import { useSettingsStore } from "../stores/settings-store";
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
  const panelPosition = useSettingsStore((s) => s.settings.panel_position);
  const isVertical = panelPosition === "left" || panelPosition === "right";
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

  // Convert pure-deltaY wheel events (mouse wheel) to horizontal scroll on card rows.
  // Trackpad gestures produce deltaX and are handled natively — we only intercept pure deltaY.
  // At horizontal boundaries, let the event bubble for outer vertical scrolling.
  const EDGE_EPSILON = 1;
  const onRowWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
    if (e.deltaX !== 0 || e.shiftKey) return; // trackpad / shift+wheel → native
    if (e.deltaY === 0) return;

    const atLeft = el.scrollLeft <= EDGE_EPSILON;
    const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_EPSILON;

    // At boundary and scrolling further in that direction → let vertical scroll bubble
    if ((atLeft && e.deltaY < 0) || (atRight && e.deltaY > 0)) return;

    e.preventDefault();
    el.scrollLeft += e.deltaY;
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

  // Top mode: reverse group order so "Today" appears at the bottom (closest to workspace).
  // flex-col-reverse also anchors scroll to the bottom, showing newest items first.
  const isReversed = panelPosition === "top";

  return (
    <div
      className={`h-full overflow-y-auto no-scrollbar ${isReversed ? "flex flex-col-reverse" : "pb-4"}`}
    >
      {/* Spacer at scroll-end for reversed mode (visually at top due to flex-col-reverse) */}
      {isReversed && <div className="shrink-0 h-4" />}
      {groups.map((group, groupIdx) => (
        <div key={group.label} className={isVertical ? (groupIdx > 0 ? "mt-2" : "") : "mb-1"}>
          {isVertical ? (
            <>
              <div
                className="px-5 py-2 sticky top-0 z-10 bg-muted/50 backdrop-blur-md text-muted-foreground/80 border-b border-border/15 text-xs font-medium cursor-pointer select-none"
                onClick={(e) =>
                  e.currentTarget.parentElement?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                {t(group.label)}
              </div>
              <div className="flex flex-col gap-3 pb-1 px-5">
                {group.items.map(({ item, flatIndex }) => (
                  <div
                    key={item.id}
                    ref={flatIndex === selectedIndex ? selectedRef : undefined}
                    className="w-full h-[180px]"
                  >
                    <ClipboardCard
                      item={item}
                      selected={flatIndex === selectedIndex}
                      onClick={() => setSelectedIndex(flatIndex)}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div
                className="px-5 py-1 text-muted-foreground text-xs font-medium cursor-pointer select-none"
                onClick={(e) => {
                  const row = e.currentTarget.nextElementSibling as HTMLElement | null;
                  row?.scrollTo({ left: 0, behavior: "smooth" });
                }}
              >
                {t(group.label)}
              </div>
              <div
                className="flex gap-3 overflow-x-auto no-scrollbar pb-1 px-5"
                onWheel={onRowWheel}
              >
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
            </>
          )}
        </div>
      ))}
    </div>
  );
}
