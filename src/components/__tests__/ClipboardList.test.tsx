import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, cleanup, fireEvent } from "@testing-library/react";
import { ClipboardList } from "../ClipboardList";
import { useClipboardStore } from "../../stores/clipboard-store";
import { useSettingsStore, type Settings } from "../../stores/settings-store";
import type { ClipboardItem } from "../../lib/types";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
    const size = estimateSize();
    return {
      getTotalSize: () => count * size,
      getVirtualItems: () =>
        Array.from({ length: count }, (_, index) => ({
          index,
          start: index * size,
          size,
        })),
      scrollToIndex: vi.fn(),
    };
  },
}));

vi.mock("../ClipboardCard", () => ({
  ClipboardCard: ({
    item,
    selected,
    onClick,
  }: {
    item: ClipboardItem;
    selected: boolean;
    onClick: () => void;
  }) => (
    <div data-testid={`card-${item.id}`} data-selected={selected} onClick={onClick}>
      {item.content_type === "rich_text" && (
        <div data-testid={`scrollable-${item.id}`} style={{ overflowY: "auto" }}>
          scrollable content
        </div>
      )}
      {item.plain_text}
    </div>
  ),
}));

const DEFAULT_SETTINGS: Settings = {
  shortcut: "CommandOrControl+Shift+V",
  auto_start: "false",
  theme: "system",
  language: "system",
  retention_policy: "unlimited",
  retention_days: "0",
  retention_count: "0",
  max_item_size_mb: "10",
  close_on_blur: "true",
  update_check_interval: "weekly",
  panel_position: "bottom",
  flat_mode_tb: "false",
  show_tray_icon: "true",
};

const scrollIntoViewSpy = vi.fn();

const mockItem = (overrides: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: "item-1",
  content_type: "plain_text",
  plain_text: "Hello",
  source_app: "com.test",
  source_app_name: "TestApp",
  content_size: 5,
  content_hash: "hash",
  is_favorited: false,
  created_at: "2026-03-18 10:00:00",
  updated_at: "2026-03-18 10:00:00",
  ...overrides,
});

describe("ClipboardList", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();

    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: vi.fn(
        class {
          observe = vi.fn();
          disconnect = vi.fn();
        },
      ),
    });

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewSpy,
    });

    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, panel_position: "bottom", flat_mode_tb: "false" },
      menuBarHeight: 0,
      loaded: true,
    });

    useClipboardStore.setState({
      items: [],
      loading: false,
      searchQuery: "",
      filterType: "all",
      viewMode: "history",
      selectedIndex: 0,
      panelShowVersion: 0,
      modifierHeld: false,
      hasMore: false,
      isFetchingMore: false,
    });
  });

  it("does not re-scroll the selected group when older grouped items append", () => {
    const todayA = mockItem({
      id: "today-a",
      plain_text: "today-a",
      updated_at: "2026-03-18 10:00:00",
    });
    const todayB = mockItem({
      id: "today-b",
      plain_text: "today-b",
      updated_at: "2026-03-18 09:00:00",
    });
    const weekA = mockItem({
      id: "week-a",
      plain_text: "week-a",
      updated_at: "2026-03-16 10:00:00",
    });
    const monthA = mockItem({
      id: "month-a",
      plain_text: "month-a",
      updated_at: "2026-03-02 10:00:00",
    });

    useClipboardStore.setState({
      items: [todayA, todayB, weekA],
      selectedIndex: 0,
    });

    const view = render(<ClipboardList />);

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    act(() => {
      useClipboardStore.setState({
        items: [todayA, todayB, weekA, monthA],
      });
    });

    view.rerender(<ClipboardList />);

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
  });

  it("still scrolls when the selected item changes groups via navigation", () => {
    const todayA = mockItem({
      id: "today-a",
      plain_text: "today-a",
      updated_at: "2026-03-18 10:00:00",
    });
    const todayB = mockItem({
      id: "today-b",
      plain_text: "today-b",
      updated_at: "2026-03-18 09:00:00",
    });
    const weekA = mockItem({
      id: "week-a",
      plain_text: "week-a",
      updated_at: "2026-03-16 10:00:00",
    });

    useClipboardStore.setState({
      items: [todayA, todayB, weekA],
      selectedIndex: 0,
    });

    const view = render(<ClipboardList />);

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    act(() => {
      useClipboardStore.setState({ selectedIndex: 2 });
    });

    view.rerender(<ClipboardList />);

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(2);
  });

  it("re-scrolls the selected group when the panel is shown again", () => {
    const todayA = mockItem({
      id: "today-a",
      plain_text: "today-a",
      updated_at: "2026-03-18 10:00:00",
    });
    const todayB = mockItem({
      id: "today-b",
      plain_text: "today-b",
      updated_at: "2026-03-18 09:00:00",
    });
    const weekA = mockItem({
      id: "week-a",
      plain_text: "week-a",
      updated_at: "2026-03-16 10:00:00",
    });

    useClipboardStore.setState({
      items: [todayA, todayB, weekA],
      selectedIndex: 0,
      panelShowVersion: 1,
    });

    const view = render(<ClipboardList />);

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    act(() => {
      useClipboardStore.setState({ panelShowVersion: 2 });
    });

    view.rerender(<ClipboardList />);

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(2);
  });

  it("fetches more in tb flat mode when horizontal scroll reaches the end", () => {
    const fetchMoreSpy = vi.fn();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, panel_position: "bottom", flat_mode_tb: "true" },
      menuBarHeight: 0,
      loaded: true,
    });
    useClipboardStore.setState({
      items: [
        mockItem({ id: "item-1", plain_text: "item-1" }),
        mockItem({ id: "item-2", plain_text: "item-2" }),
        mockItem({ id: "item-3", plain_text: "item-3" }),
      ],
      hasMore: true,
      fetchMore: fetchMoreSpy,
    });

    const view = render(<ClipboardList />);
    const row = view.container.querySelector(".overflow-x-auto") as HTMLDivElement | null;

    expect(row).not.toBeNull();

    Object.defineProperty(row!, "clientWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(row!, "scrollWidth", {
      configurable: true,
      value: 960,
    });
    Object.defineProperty(row!, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 640,
    });

    fireEvent.scroll(row!);

    expect(fetchMoreSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps horizontal row gutters outside the scroll viewport", () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, panel_position: "bottom", flat_mode_tb: "true" },
      menuBarHeight: 0,
      loaded: true,
    });
    useClipboardStore.setState({
      items: [
        mockItem({ id: "item-1", plain_text: "item-1" }),
        mockItem({ id: "item-2", plain_text: "item-2" }),
      ],
    });

    const view = render(<ClipboardList />);
    const row = view.container.querySelector(".overflow-x-auto") as HTMLDivElement | null;

    expect(row).not.toBeNull();
    expect(row).not.toHaveClass("px-5");
    expect(row!.parentElement).toHaveClass("px-5", "w-full", "min-w-0");
  });

  it("does not convert wheel events from a vertically scrollable card child into row scrolling", () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, panel_position: "bottom", flat_mode_tb: "true" },
      menuBarHeight: 0,
      loaded: true,
    });
    useClipboardStore.setState({
      items: [
        mockItem({
          id: "rich-1",
          content_type: "rich_text",
          plain_text: "rich text",
        }),
        mockItem({ id: "item-2", plain_text: "item-2" }),
        mockItem({ id: "item-3", plain_text: "item-3" }),
      ],
    });

    const view = render(<ClipboardList />);
    const row = view.container.querySelector(".overflow-x-auto") as HTMLDivElement | null;
    const scrollable = view.getByTestId("scrollable-rich-1");

    expect(row).not.toBeNull();

    Object.defineProperty(row!, "clientWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(row!, "scrollWidth", {
      configurable: true,
      value: 960,
    });
    Object.defineProperty(row!, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 120,
    });
    Object.defineProperty(scrollable, "clientHeight", {
      configurable: true,
      value: 80,
    });
    Object.defineProperty(scrollable, "scrollHeight", {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(scrollable, "scrollTop", {
      configurable: true,
      writable: true,
      value: 40,
    });

    fireEvent.wheel(scrollable, { deltaY: 32, deltaX: 0 });

    expect(row!.scrollLeft).toBe(120);
  });

  it("lets grouped vertical wheel events bubble instead of converting them to row scrolling", () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, panel_position: "bottom", flat_mode_tb: "false" },
      menuBarHeight: 0,
      loaded: true,
    });
    useClipboardStore.setState({
      items: [
        mockItem({ id: "today-a", plain_text: "today-a", updated_at: "2026-03-18 10:00:00" }),
        mockItem({ id: "today-b", plain_text: "today-b", updated_at: "2026-03-18 09:00:00" }),
        mockItem({ id: "week-a", plain_text: "week-a", updated_at: "2026-03-16 10:00:00" }),
      ],
    });

    const view = render(<ClipboardList />);
    const row = view.container.querySelector(".overflow-x-auto") as HTMLDivElement | null;

    expect(row).not.toBeNull();

    Object.defineProperty(row!, "clientWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(row!, "scrollWidth", {
      configurable: true,
      value: 960,
    });
    Object.defineProperty(row!, "scrollLeft", {
      configurable: true,
      writable: true,
      value: 120,
    });

    fireEvent.wheel(row!, { deltaY: 32, deltaX: 0 });

    expect(row!.scrollLeft).toBe(120);
  });
});
