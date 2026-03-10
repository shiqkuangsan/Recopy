import {
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useClipboardStore } from "../stores/clipboard-store";
import { useSettingsStore } from "../stores/settings-store";
import { ClipboardCard } from "./ClipboardCard";
import { dateGroupLabel } from "../lib/time";
import { Clipboard, Loader2 } from "lucide-react";

import type { ClipboardItem } from "../lib/types";

interface DateGroup {
  label: string;
  items: { item: ClipboardItem; flatIndex: number }[];
}

// --- GroupRow: horizontally virtualized row for T/B mode ---

export interface GroupRowHandle {
  scrollToIndex: (index: number) => void;
}

interface GroupRowProps {
  items: { item: ClipboardItem; flatIndex: number }[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  onRowWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
}

const CARD_WIDTH = 300;
const CARD_GAP = 12;
const CARD_HEIGHT = 260;
const HORIZONTAL_ESTIMATE = CARD_WIDTH + CARD_GAP; // 312

const GroupRow = forwardRef<GroupRowHandle, GroupRowProps>(
  ({ items, selectedIndex, setSelectedIndex, onRowWheel }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
      count: items.length,
      horizontal: true,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => HORIZONTAL_ESTIMATE,
      overscan: 3,
    });

    useImperativeHandle(ref, () => ({
      scrollToIndex: (i: number) => virtualizer.scrollToIndex(i, { align: "auto" }),
    }));

    return (
      <div ref={scrollRef} className="overflow-x-auto no-scrollbar pb-1 px-5" onWheel={onRowWheel}>
        <div
          className="relative"
          style={{
            width: virtualizer.getTotalSize(),
            height: `${CARD_HEIGHT}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const { item, flatIndex } = items[vi.index];
            return (
              <div
                key={item.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${CARD_WIDTH}px`,
                  height: "100%",
                  transform: `translateX(${vi.start}px)`,
                }}
              >
                <ClipboardCard
                  item={item}
                  selected={flatIndex === selectedIndex}
                  onClick={() => setSelectedIndex(flatIndex)}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

GroupRow.displayName = "GroupRow";

// --- ClipboardList ---

export function ClipboardList() {
  const { t } = useTranslation();
  const items = useClipboardStore((s) => s.items);
  const selectedIndex = useClipboardStore((s) => s.selectedIndex);
  const setSelectedIndex = useClipboardStore((s) => s.setSelectedIndex);
  const loading = useClipboardStore((s) => s.loading);
  const hasMore = useClipboardStore((s) => s.hasMore);
  const isFetchingMore = useClipboardStore((s) => s.isFetchingMore);
  const fetchMore = useClipboardStore((s) => s.fetchMore);
  const panelPosition = useSettingsStore((s) => s.settings.panel_position);
  const flatModeTB = useSettingsStore((s) => s.settings.flat_mode_tb) === "true";
  const isVertical = panelPosition === "left" || panelPosition === "right";
  const shouldGroup = !isVertical && !flatModeTB;
  // Vertical virtualizer scroll container ref
  const verticalParentRef = useRef<HTMLDivElement>(null);

  // GroupRow refs for T/B grouped mode horizontal virtualization (keyed by group index)
  const groupRowRefs = useRef<Map<number, GroupRowHandle>>(new Map());
  // Group container DOM refs for vertical scroll-into-view (keyed by group index)
  const groupDivRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Scroll container ref for T/B grouped mode (used to clamp ancestor scroll after scrollIntoView)
  const groupScrollRef = useRef<HTMLDivElement>(null);
  // Single GroupRow ref for T/B flat mode
  const flatRowRef = useRef<GroupRowHandle>(null);

  // Sentinel ref for infinite scroll trigger
  const sentinelRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver: trigger fetchMore when sentinel scrolls into view.
  // rootMargin extends both top and bottom by 200px for prefetch — covers both
  // normal (sentinel at bottom, scroll down) and Top mode (sentinel at visual top
  // via flex-col-reverse, scroll up).
  // isVertical in deps ensures re-attach when layout mode switches (different sentinel DOM element).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchMore();
        }
      },
      { threshold: 0, rootMargin: "200px 0px 200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, fetchMore, isVertical, flatModeTB]);

  // Group items by date (used by T/B grouped mode only)
  const groups = useMemo(() => {
    if (!shouldGroup) return []; // L/R or T/B flat mode: skip grouping
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
  }, [items, shouldGroup]);

  // Flat items for T/B flat mode (single row with all items)
  const flatItems = useMemo(() => {
    if (isVertical || shouldGroup) return [];
    return items.map((item, i) => ({ item, flatIndex: i }));
  }, [items, isVertical, shouldGroup]);

  // Vertical virtualizer for L/R mode
  const verticalVirtualizer = useVirtualizer({
    count: isVertical ? items.length : 0,
    getScrollElement: () => verticalParentRef.current,
    estimateSize: () => 192, // 180px card + 12px gap
    overscan: 5,
  });

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

  // Auto-scroll selected card into view (T/B grouped mode; L/R uses virtualizer).
  // useLayoutEffect runs before browser paint, preventing visible jump when the
  // panel opens with a non-Today selection (e.g. This Week / This Month).
  useLayoutEffect(() => {
    if (!shouldGroup || selectedIndex < 0) return;
    // Find which group contains the selected item and scroll within it
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const localIdx = group.items.findIndex((entry) => entry.flatIndex === selectedIndex);
      if (localIdx !== -1) {
        // Scroll the group container into the vertical viewport
        groupDivRefs.current.get(gi)?.scrollIntoView({ block: "nearest" });
        // scrollIntoView can inadvertently scroll ancestor containers (especially
        // the panel root which has a CSS transform offset during entrance animation).
        // Reset all ancestors above the intended scroll container to prevent this.
        let ancestor = groupScrollRef.current?.parentElement;
        while (ancestor) {
          ancestor.scrollTop = 0;
          ancestor = ancestor.parentElement;
        }
        // Scroll the card into view within the horizontal row
        groupRowRefs.current.get(gi)?.scrollToIndex(localIdx);
        break;
      }
    }
  }, [selectedIndex, shouldGroup, groups]);

  // Auto-scroll selected card into view for T/B flat mode
  useLayoutEffect(() => {
    if (isVertical || shouldGroup || selectedIndex < 0) return;
    flatRowRef.current?.scrollToIndex(selectedIndex);
  }, [selectedIndex, isVertical, shouldGroup]);

  // Auto-scroll selected item into view for L/R virtualized mode
  useEffect(() => {
    if (!isVertical || selectedIndex < 0 || selectedIndex >= items.length) return;
    verticalVirtualizer.scrollToIndex(selectedIndex, { align: "auto" });
  }, [selectedIndex, isVertical, items.length, verticalVirtualizer]);

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

  // L/R mode: flat virtualized vertical list without grouping
  if (isVertical) {
    return (
      <div ref={verticalParentRef} className="h-full overflow-y-auto no-scrollbar">
        <div className="relative w-full" style={{ height: verticalVirtualizer.getTotalSize() }}>
          {verticalVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <div
                key={item.id}
                className="absolute top-0 left-0 w-full px-5"
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="w-full h-[180px] pt-3">
                  <ClipboardCard
                    item={item}
                    selected={virtualRow.index === selectedIndex}
                    onClick={() => setSelectedIndex(virtualRow.index)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingMore && <Loader2 className="animate-spin text-muted-foreground" size={20} />}
          </div>
        )}
      </div>
    );
  }

  // T/B flat mode: single horizontal row without grouping
  if (!isVertical && flatModeTB) {
    return (
      <div className="h-full flex items-center relative px-1">
        <GroupRow
          ref={flatRowRef}
          items={flatItems}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          onRowWheel={onRowWheel}
        />
        {hasMore && (
          <div
            ref={sentinelRef}
            className="absolute bottom-0 inset-x-0 flex justify-center py-2 pointer-events-none"
          >
            {isFetchingMore && <Loader2 className="animate-spin text-muted-foreground" size={20} />}
          </div>
        )}
      </div>
    );
  }

  // T/B grouped mode: horizontal rows with per-group horizontal virtualization.
  // Top mode: reverse group order so "Today" appears at the bottom (closest to workspace).
  // flex-col-reverse also anchors scroll to the bottom, showing newest items first.
  const isReversed = panelPosition === "top";

  return (
    <div
      ref={groupScrollRef}
      className={`h-full overflow-y-auto no-scrollbar ${isReversed ? "flex flex-col-reverse" : "pb-4"}`}
    >
      {/* Spacer at scroll-end for reversed mode (visually at top due to flex-col-reverse) */}
      {isReversed && <div className="shrink-0 h-4" />}
      {groups.map((group, groupIndex) => (
        <div
          key={group.label}
          className="mb-1"
          ref={(el) => {
            if (el) {
              groupDivRefs.current.set(groupIndex, el);
            } else {
              groupDivRefs.current.delete(groupIndex);
            }
          }}
        >
          <div
            className="px-5 py-1 text-muted-foreground text-xs font-medium cursor-pointer select-none"
            onClick={() => {
              groupRowRefs.current.get(groupIndex)?.scrollToIndex(0);
            }}
          >
            {t(group.label)}
          </div>
          <GroupRow
            ref={(handle) => {
              if (handle) {
                groupRowRefs.current.set(groupIndex, handle);
              } else {
                groupRowRefs.current.delete(groupIndex);
              }
            }}
            items={group.items}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            onRowWheel={onRowWheel}
          />
        </div>
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {isFetchingMore && <Loader2 className="animate-spin text-muted-foreground" size={20} />}
        </div>
      )}
    </div>
  );
}
