import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useClipboardStore } from "../clipboard-store";
import type { ClipboardItem } from "../../lib/types";

const mockedInvoke = vi.mocked(invoke);

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useClipboardStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useClipboardStore.setState({
      items: [],
      loading: false,
      searchQuery: "",
      filterType: "all",
      viewMode: "history",
      selectedIndex: 0,
    });
  });

  it("should have correct initial state", () => {
    const state = useClipboardStore.getState();
    expect(state.items).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.searchQuery).toBe("");
    expect(state.filterType).toBe("all");
    expect(state.viewMode).toBe("history");
    expect(state.selectedIndex).toBe(0);
  });

  it("should fetch items and update state", async () => {
    const items = [mockItem(), mockItem({ id: "test-id-2", plain_text: "Second" })];
    mockedInvoke.mockResolvedValueOnce(items);

    await useClipboardStore.getState().fetchItems();

    expect(mockedInvoke).toHaveBeenCalledWith("get_clipboard_items", {
      contentType: undefined,
      limit: 200,
      offset: 0,
    });
    expect(useClipboardStore.getState().items).toEqual(items);
    expect(useClipboardStore.getState().loading).toBe(false);
  });

  it("should fetch items with type filter", async () => {
    mockedInvoke.mockResolvedValueOnce([]);
    useClipboardStore.setState({ filterType: "image" });

    await useClipboardStore.getState().fetchItems();

    expect(mockedInvoke).toHaveBeenCalledWith("get_clipboard_items", {
      contentType: "image",
      limit: 200,
      offset: 0,
    });
  });

  it("should search items", async () => {
    const items = [mockItem()];
    mockedInvoke.mockResolvedValueOnce(items);

    await useClipboardStore.getState().searchItems("Hello");

    expect(mockedInvoke).toHaveBeenCalledWith("search_clipboard_items", {
      query: "Hello",
      contentType: undefined,
      limit: 200,
    });
    expect(useClipboardStore.getState().items).toEqual(items);
  });

  it("should delete item and remove from state", async () => {
    const items = [mockItem(), mockItem({ id: "test-id-2" })];
    useClipboardStore.setState({ items });
    mockedInvoke.mockResolvedValueOnce(undefined);

    await useClipboardStore.getState().deleteItem("test-id-1");

    expect(mockedInvoke).toHaveBeenCalledWith("delete_clipboard_item", {
      id: "test-id-1",
    });
    expect(useClipboardStore.getState().items).toHaveLength(1);
    expect(useClipboardStore.getState().items[0].id).toBe("test-id-2");
  });

  it("should set search query and reset selected index", () => {
    useClipboardStore.setState({ selectedIndex: 5 });
    useClipboardStore.getState().setSearchQuery("test");

    expect(useClipboardStore.getState().searchQuery).toBe("test");
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("should change view mode", () => {
    useClipboardStore.getState().setViewMode("pins");
    expect(useClipboardStore.getState().viewMode).toBe("pins");
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
  });

  it("should reset to history and fetch items on panel show", async () => {
    const historyItems = [mockItem({ id: "history-1" })];
    mockedInvoke.mockResolvedValueOnce(historyItems);
    useClipboardStore.setState({ viewMode: "pins", selectedIndex: 5 });

    await useClipboardStore.getState().onPanelShow();

    expect(useClipboardStore.getState().viewMode).toBe("history");
    expect(useClipboardStore.getState().selectedIndex).toBe(0);
    expect(useClipboardStore.getState().items).toEqual(historyItems);
    expect(mockedInvoke).toHaveBeenCalledWith("get_clipboard_items", {
      contentType: undefined,
      limit: 200,
      offset: 0,
    });
  });

  it("should ignore stale results from older requests", async () => {
    const historyDeferred = deferred<ClipboardItem[]>();
    const pinsDeferred = deferred<ClipboardItem[]>();

    mockedInvoke.mockImplementation((cmd) => {
      if (cmd === "get_clipboard_items") {
        return historyDeferred.promise;
      }
      if (cmd === "get_favorited_items") {
        return pinsDeferred.promise;
      }
      return Promise.resolve([]);
    });

    const historyPromise = useClipboardStore.getState().fetchItems();
    const pinsPromise = useClipboardStore.getState().fetchFavorites();

    const pinItems = [mockItem({ id: "pin-1", is_favorited: true })];
    pinsDeferred.resolve(pinItems);
    await pinsPromise;

    expect(useClipboardStore.getState().items).toEqual(pinItems);
    expect(useClipboardStore.getState().loading).toBe(false);

    const historyItems = [mockItem({ id: "history-late" })];
    historyDeferred.resolve(historyItems);
    await historyPromise;

    expect(useClipboardStore.getState().items).toEqual(pinItems);
  });
});
