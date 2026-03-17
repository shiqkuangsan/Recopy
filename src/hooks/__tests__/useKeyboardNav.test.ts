import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ClipboardItem } from "../../lib/types";

// Must mock matchMedia before importing stores (module-level code uses it)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

vi.mock("../../lib/paste", () => ({
  pasteItem: vi.fn(),
  copyToClipboard: vi.fn(() => Promise.resolve()),
}));

// Import stores AFTER matchMedia is mocked
const { useClipboardStore } = await import("../../stores/clipboard-store");
const { useSettingsStore } = await import("../../stores/settings-store");
const { useCopyHud } = await import("../../components/CopyHud");
const { useKeyboardNav, previewState } = await import("../useKeyboardNav");
const { pasteItem, copyToClipboard } = await import("../../lib/paste");

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);
const mockedPasteItem = vi.mocked(pasteItem);
const mockedCopyToClipboard = vi.mocked(copyToClipboard);
const tauriEventHandlers = new Map<string, (event: { payload: unknown }) => void>();

const mockItem = (overrides: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: "test-id-1",
  content_type: "plain_text",
  plain_text: "Hello World",
  source_app: "com.test",
  source_app_name: "TestApp",
  content_size: 11,
  content_hash: "abc123",
  is_favorited: false,
  created_at: "2026-02-23 10:00:00",
  updated_at: "2026-02-23 10:00:00",
  ...overrides,
});

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}, target?: HTMLElement) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    ...opts,
  });
  (target ?? document).dispatchEvent(event);
}

function fireKeyUp(key: string, opts: Partial<KeyboardEventInit> = {}, target?: HTMLElement) {
  const event = new KeyboardEvent("keyup", {
    key,
    bubbles: true,
    ...opts,
  });
  (target ?? document).dispatchEvent(event);
}

function setupItems(items: ClipboardItem[], selectedIndex = 0) {
  useClipboardStore.setState({ items, selectedIndex });
}

function setupSettings(overrides: Partial<{ panel_position: string; flat_mode_tb: string }> = {}) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      panel_position: overrides.panel_position ?? "bottom",
      flat_mode_tb: overrides.flat_mode_tb ?? "false",
    },
  });
}

function emitTauriEvent<T>(eventName: string, payload: T) {
  tauriEventHandlers.get(eventName)?.({ payload });
}

describe("useKeyboardNav", () => {
  let hookResult: ReturnType<typeof renderHook>;

  beforeEach(() => {
    vi.clearAllMocks();
    tauriEventHandlers.clear();
    mockedListen.mockImplementation(((
      eventName: string,
      handler: (event: { payload: unknown }) => void,
    ) => {
      tauriEventHandlers.set(eventName, handler);
      return Promise.resolve(() => {
        tauriEventHandlers.delete(eventName);
      });
    }) as typeof listen);
    useClipboardStore.setState({
      items: [],
      loading: false,
      searchQuery: "",
      filterType: "all",
      viewMode: "history",
      selectedIndex: 0,
      hasMore: true,
      isFetchingMore: false,
    } as never);
    setupSettings();
    previewState.open = false;
    hookResult = renderHook(() => useKeyboardNav());
  });

  afterEach(() => {
    hookResult.unmount();
  });

  describe("IME composition", () => {
    it("should skip all handlers when isComposing is true", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("ArrowRight", { isComposing: true });

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });

    it("should skip all handlers when keyCode is 229", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 0);
      hookResult.rerender();

      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        keyCode: 229,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("Tab key", () => {
    it("should prevent default on Tab", () => {
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe("Cmd+F / Ctrl+F — focus search", () => {
    it("should focus search input on Cmd+F", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      fireKey("f", { metaKey: true });

      expect(focusSpy).toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it("should focus search input on Ctrl+F", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      fireKey("f", { ctrlKey: true });

      expect(focusSpy).toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });

  describe("Cmd+, / Ctrl+, — open settings", () => {
    it("should invoke open_settings_window on Cmd+,", () => {
      fireKey(",", { metaKey: true });

      expect(mockedInvoke).toHaveBeenCalledWith("open_settings_window");
    });

    it("should invoke open_settings_window on Ctrl+,", () => {
      fireKey(",", { ctrlKey: true });

      expect(mockedInvoke).toHaveBeenCalledWith("open_settings_window");
    });
  });

  describe("Cmd+ArrowUp — go to top", () => {
    it("should select first item on Cmd+ArrowUp", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" }), mockItem({ id: "test-id-3" })];
      setupItems(items, 2);
      hookResult.rerender();

      fireKey("ArrowUp", { metaKey: true });

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("Cmd+ArrowLeft — go to group start (T/B mode)", () => {
    it("should select first item of current group in bottom grouped mode", () => {
      const items = [
        mockItem({ id: "a", updated_at: new Date().toISOString().replace("T", " ").slice(0, 19) }),
        mockItem({ id: "b", updated_at: new Date().toISOString().replace("T", " ").slice(0, 19) }),
        mockItem({ id: "c", updated_at: "2020-01-01 10:00:00" }),
      ];
      setupItems(items, 1);
      setupSettings({ panel_position: "bottom", flat_mode_tb: "false" });
      hookResult.rerender();

      fireKey("ArrowLeft", { metaKey: true });

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });

    it("should select first item in flat mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 1);
      setupSettings({ panel_position: "bottom", flat_mode_tb: "true" });
      hookResult.rerender();

      fireKey("ArrowLeft", { metaKey: true });

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });

    it("should not activate in vertical (L/R) mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 1);
      setupSettings({ panel_position: "left" });
      hookResult.rerender();

      fireKey("ArrowLeft", { metaKey: true });

      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });
  });

  describe("modifier-held state", () => {
    it("should set modifierHeld on Meta keydown and clear it on keyup", () => {
      fireKey("Meta", { metaKey: true });
      expect((useClipboardStore.getState() as Record<string, unknown>).modifierHeld).toBe(true);

      fireKeyUp("Meta");
      expect((useClipboardStore.getState() as Record<string, unknown>).modifierHeld).toBe(false);
    });

    it("should reset modifierHeld on window blur", () => {
      useClipboardStore.setState({ modifierHeld: true } as never);

      window.dispatchEvent(new Event("blur"));

      expect((useClipboardStore.getState() as Record<string, unknown>).modifierHeld).toBe(false);
    });
  });

  describe("input focused behavior", () => {
    let input: HTMLInputElement;

    beforeEach(() => {
      input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      input.focus();
    });

    afterEach(() => {
      document.body.removeChild(input);
    });

    it("should blur input on Escape when input focused", () => {
      const blurSpy = vi.spyOn(input, "blur");

      fireKey("Escape", {}, input);

      expect(blurSpy).toHaveBeenCalled();
    });

    it("should blur input on ArrowDown in bottom mode", () => {
      setupSettings({ panel_position: "bottom" });
      hookResult.rerender();
      const blurSpy = vi.spyOn(input, "blur");

      fireKey("ArrowDown", {}, input);

      expect(blurSpy).toHaveBeenCalled();
    });

    it("should not blur input on ArrowDown in top mode", () => {
      setupSettings({ panel_position: "top" });
      hookResult.rerender();
      const blurSpy = vi.spyOn(input, "blur");

      fireKey("ArrowDown", {}, input);

      expect(blurSpy).not.toHaveBeenCalled();
    });

    it("should blur input on ArrowUp in top mode", () => {
      setupSettings({ panel_position: "top" });
      hookResult.rerender();
      const blurSpy = vi.spyOn(input, "blur");

      fireKey("ArrowUp", {}, input);

      expect(blurSpy).toHaveBeenCalled();
    });

    it("should paste selected item on Enter when input focused", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("Enter", {}, input);

      expect(mockedPasteItem).toHaveBeenCalledWith(items[0]);
    });

    it("should not paste on Enter when no items exist", () => {
      setupItems([], 0);
      hookResult.rerender();

      fireKey("Enter", {}, input);

      expect(mockedPasteItem).not.toHaveBeenCalled();
    });

    it("should not handle other keys when input focused", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("ArrowRight", {}, input);

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("Space — preview toggle", () => {
    it("should open preview on Space when preview is closed", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey(" ");

      expect(mockedInvoke).toHaveBeenCalledWith("show_preview_window", { id: "test-id-1" });
      expect(previewState.open).toBe(true);
    });

    it("should close preview on Space when preview is open", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      // Open preview first
      fireKey(" ");
      vi.clearAllMocks();

      // Now close it
      fireKey(" ");

      expect(mockedInvoke).toHaveBeenCalledWith("animate_close_preview");
      expect(previewState.open).toBe(false);
    });

    it("should ignore key repeat on Space", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      const event = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        repeat: true,
      });
      document.dispatchEvent(event);

      expect(mockedInvoke).not.toHaveBeenCalledWith("show_preview_window", expect.anything());
    });

    it("should not open preview when no items", () => {
      setupItems([], 0);
      hookResult.rerender();

      fireKey(" ");

      expect(mockedInvoke).not.toHaveBeenCalledWith("show_preview_window", expect.anything());
    });
  });

  describe("Escape — close preview or hide window", () => {
    it("should close preview first if preview is open", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      // Open preview
      fireKey(" ");
      vi.clearAllMocks();

      fireKey("Escape");

      expect(mockedInvoke).toHaveBeenCalledWith("animate_close_preview");
      expect(mockedInvoke).not.toHaveBeenCalledWith("hide_window");
    });

    it("should hide window when preview is not open", () => {
      fireKey("Escape");

      expect(mockedInvoke).toHaveBeenCalledWith("hide_window");
    });
  });

  describe("Enter — paste", () => {
    it("should paste selected item on Enter", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 1);
      hookResult.rerender();

      fireKey("Enter");

      expect(mockedPasteItem).toHaveBeenCalledWith(items[1]);
    });

    it("should not paste when no items exist", () => {
      setupItems([], 0);
      hookResult.rerender();

      fireKey("Enter");

      expect(mockedPasteItem).not.toHaveBeenCalled();
    });

    it("should not paste when preview is open", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      // Open preview
      fireKey(" ");
      vi.clearAllMocks();

      fireKey("Enter");

      expect(mockedPasteItem).not.toHaveBeenCalled();
    });
  });

  describe("Delete / Backspace — delete item", () => {
    it("should delete selected item on Delete", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      mockedInvoke.mockResolvedValueOnce(undefined);
      hookResult.rerender();

      fireKey("Delete");

      expect(mockedInvoke).toHaveBeenCalledWith("delete_clipboard_item", { id: "test-id-1" });
    });

    it("should delete selected item on Backspace", () => {
      const items = [mockItem({ id: "item-2" })];
      setupItems(items, 0);
      mockedInvoke.mockResolvedValueOnce(undefined);
      hookResult.rerender();

      fireKey("Backspace");

      expect(mockedInvoke).toHaveBeenCalledWith("delete_clipboard_item", { id: "item-2" });
    });

    it("should not delete when no items exist", () => {
      setupItems([], 0);
      hookResult.rerender();

      fireKey("Delete");

      expect(mockedInvoke).not.toHaveBeenCalledWith("delete_clipboard_item", expect.anything());
    });
  });

  describe("ArrowRight / ArrowLeft — horizontal navigation (T/B mode)", () => {
    it("should move selection right on ArrowRight in bottom mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" }), mockItem({ id: "test-id-3" })];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("ArrowRight");

      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });

    it("should move selection left on ArrowLeft in bottom mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" }), mockItem({ id: "test-id-3" })];
      setupItems(items, 2);
      hookResult.rerender();

      fireKey("ArrowLeft");

      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });

    it("should clamp at last item on ArrowRight", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 1);
      hookResult.rerender();

      fireKey("ArrowRight");

      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });

    it("should clamp at first item on ArrowLeft", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("ArrowLeft");

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });

    it("should not move on ArrowRight in vertical (left) mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 0);
      setupSettings({ panel_position: "left" });
      hookResult.rerender();

      fireKey("ArrowRight");

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });

    it("should not move on ArrowLeft in vertical (right) mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 1);
      setupSettings({ panel_position: "right" });
      hookResult.rerender();

      fireKey("ArrowLeft");

      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });
  });

  describe("ArrowDown — vertical/grouped navigation", () => {
    it("should move down in vertical (left/right) mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" }), mockItem({ id: "test-id-3" })];
      setupItems(items, 0);
      setupSettings({ panel_position: "left" });
      hookResult.rerender();

      fireKey("ArrowDown");

      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });

    it("should clamp at last item in vertical mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 1);
      setupSettings({ panel_position: "right" });
      hookResult.rerender();

      fireKey("ArrowDown");

      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });

    it("should focus search on ArrowDown in top flat mode", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      const items = [mockItem()];
      setupItems(items, 0);
      setupSettings({ panel_position: "top", flat_mode_tb: "true" });
      hookResult.rerender();

      fireKey("ArrowDown");

      expect(focusSpy).toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it("should not focus search on ArrowDown in bottom flat mode", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      const items = [mockItem()];
      setupItems(items, 0);
      setupSettings({ panel_position: "bottom", flat_mode_tb: "true" });
      hookResult.rerender();

      fireKey("ArrowDown");

      expect(focusSpy).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });

  describe("ArrowUp — vertical/grouped navigation", () => {
    it("should move up in vertical mode", () => {
      const items = [mockItem(), mockItem({ id: "test-id-2" }), mockItem({ id: "test-id-3" })];
      setupItems(items, 2);
      setupSettings({ panel_position: "left" });
      hookResult.rerender();

      fireKey("ArrowUp");

      expect(useClipboardStore.getState().selectedIndex).toBe(1);
    });

    it("should focus search when at first item in vertical mode", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      const items = [mockItem(), mockItem({ id: "test-id-2" })];
      setupItems(items, 0);
      setupSettings({ panel_position: "left" });
      hookResult.rerender();

      fireKey("ArrowUp");

      expect(focusSpy).toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it("should focus search on ArrowUp in bottom flat mode", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      const items = [mockItem()];
      setupItems(items, 0);
      setupSettings({ panel_position: "bottom", flat_mode_tb: "true" });
      hookResult.rerender();

      fireKey("ArrowUp");

      expect(focusSpy).toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it("should not focus search on ArrowUp in top flat mode", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      const items = [mockItem()];
      setupItems(items, 0);
      setupSettings({ panel_position: "top", flat_mode_tb: "true" });
      hookResult.rerender();

      fireKey("ArrowUp");

      expect(focusSpy).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });

  describe("group-aware navigation (T/B grouped mode)", () => {
    const now = new Date();
    const todayStr = now.toISOString().replace("T", " ").slice(0, 19);
    const oldStr = "2020-01-01 10:00:00";

    function setupGroupedItems() {
      const items = [
        mockItem({ id: "today-0", updated_at: todayStr }),
        mockItem({ id: "today-1", updated_at: todayStr }),
        mockItem({ id: "today-2", updated_at: todayStr }),
        mockItem({ id: "old-0", updated_at: oldStr }),
        mockItem({ id: "old-1", updated_at: oldStr }),
      ];
      setupItems(items, 0);
      setupSettings({ panel_position: "bottom", flat_mode_tb: "false" });
    }

    it("should jump to next group on ArrowDown in bottom mode", () => {
      setupGroupedItems();
      useClipboardStore.setState({ selectedIndex: 1 });
      hookResult.rerender();

      fireKey("ArrowDown");

      expect(useClipboardStore.getState().selectedIndex).toBe(4);
    });

    it("should clamp column when target group is shorter", () => {
      setupGroupedItems();
      useClipboardStore.setState({ selectedIndex: 2 });
      hookResult.rerender();

      fireKey("ArrowDown");

      expect(useClipboardStore.getState().selectedIndex).toBe(4);
    });

    it("should jump to previous group on ArrowUp in bottom mode", () => {
      setupGroupedItems();
      useClipboardStore.setState({ selectedIndex: 3 });
      hookResult.rerender();

      fireKey("ArrowUp");

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });

    it("should focus search when ArrowUp at first group in bottom mode", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      setupGroupedItems();
      useClipboardStore.setState({ selectedIndex: 1 });
      hookResult.rerender();

      fireKey("ArrowUp");

      expect(focusSpy).toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it("should focus search on ArrowDown in top mode at first group", () => {
      setupGroupedItems();
      setupSettings({ panel_position: "top", flat_mode_tb: "false" });
      useClipboardStore.setState({ selectedIndex: 1 });
      hookResult.rerender();

      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");

      fireKey("ArrowDown");

      expect(focusSpy).toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it("should jump to next group on ArrowUp in top mode (visually up = higher index)", () => {
      setupGroupedItems();
      setupSettings({ panel_position: "top", flat_mode_tb: "false" });
      useClipboardStore.setState({ selectedIndex: 0 });
      hookResult.rerender();

      fireKey("ArrowUp");

      expect(useClipboardStore.getState().selectedIndex).toBe(3);
    });
  });

  describe("Cmd+C / Ctrl+C — copy to clipboard", () => {
    it("should copy selected item on Cmd+C", async () => {
      const showSpy = vi.fn();
      useCopyHud.setState({ show: showSpy });

      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("c", { metaKey: true });

      await vi.waitFor(() => {
        expect(mockedCopyToClipboard).toHaveBeenCalledWith(items[0]);
      });
    });

    it("should copy selected item on Ctrl+C", async () => {
      const items = [mockItem({ id: "ctrl-c-item" })];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("c", { ctrlKey: true });

      await vi.waitFor(() => {
        expect(mockedCopyToClipboard).toHaveBeenCalledWith(items[0]);
      });
    });

    it("should not copy when no items exist", () => {
      setupItems([], 0);
      hookResult.rerender();

      fireKey("c", { metaKey: true });

      expect(mockedCopyToClipboard).not.toHaveBeenCalled();
    });

    it("should show HUD after successful copy", async () => {
      const showSpy = vi.fn();
      useCopyHud.setState({ show: showSpy });

      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("c", { metaKey: true });

      await vi.waitFor(() => {
        expect(showSpy).toHaveBeenCalled();
      });
    });
  });

  describe("Cmd/Ctrl+1..9 — quick paste", () => {
    const now = new Date();
    const todayStr = now.toISOString().replace("T", " ").slice(0, 19);
    const oldStr = "2020-01-01 10:00:00";

    it("should paste from the selected group in grouped mode", () => {
      const items = [
        mockItem({ id: "today-0", updated_at: todayStr }),
        mockItem({ id: "today-1", updated_at: todayStr }),
        mockItem({ id: "today-2", updated_at: todayStr }),
        mockItem({ id: "old-0", updated_at: oldStr }),
        mockItem({ id: "old-1", updated_at: oldStr }),
      ];
      setupItems(items, 3);
      setupSettings({ panel_position: "bottom", flat_mode_tb: "false" });
      hookResult.rerender();

      fireKey("2", { metaKey: true });

      expect(mockedPasteItem).toHaveBeenCalledWith(items[4]);
    });

    it("should paste from the first nine items in flat mode", () => {
      const items = Array.from({ length: 10 }, (_, i) => mockItem({ id: `flat-${i}` }));
      setupItems(items, 7);
      setupSettings({ panel_position: "left", flat_mode_tb: "false" });
      hookResult.rerender();

      fireKey("3", { metaKey: true });

      expect(mockedPasteItem).toHaveBeenCalledWith(items[2]);
    });

    it("should support Ctrl+number shortcuts", () => {
      const items = Array.from({ length: 4 }, (_, i) => mockItem({ id: `ctrl-${i}` }));
      setupItems(items, 0);
      setupSettings({ panel_position: "bottom", flat_mode_tb: "true" });
      hookResult.rerender();

      fireKey("4", { ctrlKey: true });

      expect(mockedPasteItem).toHaveBeenCalledWith(items[3]);
    });

    it("should ignore out-of-range quick paste indices", () => {
      const items = [mockItem({ id: "only-one" })];
      setupItems(items, 0);
      setupSettings({ panel_position: "bottom", flat_mode_tb: "true" });
      hookResult.rerender();

      fireKey("9", { metaKey: true });

      expect(mockedPasteItem).not.toHaveBeenCalled();
    });

    it("should handle Windows platform Ctrl keydown and keyup events", () => {
      emitTauriEvent("platform-keydown", {
        key: "Control",
        ctrlKey: true,
        shiftKey: false,
      });
      expect((useClipboardStore.getState() as Record<string, unknown>).modifierHeld).toBe(true);

      emitTauriEvent("platform-keyup", {
        key: "Control",
        ctrlKey: false,
        shiftKey: false,
      });
      expect((useClipboardStore.getState() as Record<string, unknown>).modifierHeld).toBe(false);
    });

    it("should handle Windows platform Ctrl+number quick paste events", () => {
      const items = Array.from({ length: 5 }, (_, i) => mockItem({ id: `win-${i}` }));
      setupItems(items, 0);
      setupSettings({ panel_position: "left", flat_mode_tb: "false" });
      hookResult.rerender();

      emitTauriEvent("platform-keydown", {
        key: "5",
        ctrlKey: true,
        shiftKey: false,
      });

      expect(mockedPasteItem).toHaveBeenCalledWith(items[4]);
    });
  });

  describe("edge cases", () => {
    it("should handle navigation with empty items list", () => {
      setupItems([], 0);
      hookResult.rerender();

      fireKey("ArrowRight");
      fireKey("ArrowLeft");
      fireKey("ArrowDown");
      fireKey("ArrowUp");

      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });

    it("should handle navigation with single item", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("ArrowRight");
      expect(useClipboardStore.getState().selectedIndex).toBe(0);

      fireKey("ArrowLeft");
      expect(useClipboardStore.getState().selectedIndex).toBe(0);
    });

    it("should clean up event listener on unmount", () => {
      const removeListenerSpy = vi.spyOn(document, "removeEventListener");

      hookResult.unmount();

      expect(removeListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
      removeListenerSpy.mockRestore();
    });

    it("should not trigger c handler without modifier key", () => {
      const items = [mockItem()];
      setupItems(items, 0);
      hookResult.rerender();

      fireKey("c");

      expect(mockedCopyToClipboard).not.toHaveBeenCalled();
    });
  });
});
