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
      hasMore: true,
      isFetchingMore: false,
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
    expect(state.hasMore).toBe(true);
    expect(state.isFetchingMore).toBe(false);
  });

  it("should fetch items and update state", async () => {
    const items = [mockItem(), mockItem({ id: "test-id-2", plain_text: "Second" })];
    mockedInvoke.mockResolvedValueOnce(items);

    await useClipboardStore.getState().fetchItems();

    expect(mockedInvoke).toHaveBeenCalledWith("get_clipboard_items", {
      contentType: undefined,
      limit: 500,
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
      limit: 500,
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
      limit: 500,
      favoritesOnly: false,
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

  it("should preserve view mode and refresh data on panel show", async () => {
    // When in pins mode, onPanelShow should fetch favorites (not reset to history)
    const pinItems = [mockItem({ id: "pin-1", is_favorited: true })];
    mockedInvoke.mockResolvedValueOnce(pinItems);
    useClipboardStore.setState({ viewMode: "pins", selectedIndex: 5 });

    await useClipboardStore.getState().onPanelShow();

    expect(useClipboardStore.getState().viewMode).toBe("pins");
    expect(useClipboardStore.getState().items).toEqual(pinItems);
    expect(mockedInvoke).toHaveBeenCalledWith("get_favorited_items", {
      contentType: undefined,
      limit: 500,
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

  describe("hasMore state", () => {
    it("should set hasMore true when fetchItems returns full page", async () => {
      const fullPage = Array.from({ length: 500 }, (_, i) => mockItem({ id: `item-${i}` }));
      mockedInvoke.mockResolvedValueOnce(fullPage);

      await useClipboardStore.getState().fetchItems();

      expect(useClipboardStore.getState().hasMore).toBe(true);
    });

    it("should set hasMore false when fetchItems returns partial page", async () => {
      const partialPage = [mockItem({ id: "item-1" }), mockItem({ id: "item-2" })];
      mockedInvoke.mockResolvedValueOnce(partialPage);

      await useClipboardStore.getState().fetchItems();

      expect(useClipboardStore.getState().hasMore).toBe(false);
    });

    it("should set hasMore false for search results", async () => {
      mockedInvoke.mockResolvedValueOnce(
        Array.from({ length: 500 }, (_, i) => mockItem({ id: `item-${i}` })),
      );

      await useClipboardStore.getState().searchItems("test");

      expect(useClipboardStore.getState().hasMore).toBe(false);
    });

    it("should set hasMore based on page size for fetchFavorites", async () => {
      mockedInvoke.mockResolvedValueOnce([mockItem({ id: "fav-1" })]);

      await useClipboardStore.getState().fetchFavorites();

      expect(useClipboardStore.getState().hasMore).toBe(false);
    });
  });

  describe("fetchMore", () => {
    it("should append data to existing items", async () => {
      // Setup: first page already loaded
      const firstPage = Array.from({ length: 500 }, (_, i) => mockItem({ id: `item-${i}` }));
      mockedInvoke.mockResolvedValueOnce(firstPage);
      await useClipboardStore.getState().fetchItems();

      // fetchMore: returns second page
      const secondPage = Array.from({ length: 100 }, (_, i) => mockItem({ id: `item-${500 + i}` }));
      mockedInvoke.mockResolvedValueOnce(secondPage);
      await useClipboardStore.getState().fetchMore();

      expect(useClipboardStore.getState().items).toHaveLength(600);
      expect(useClipboardStore.getState().items[500].id).toBe("item-500");
      expect(useClipboardStore.getState().hasMore).toBe(false);
      expect(useClipboardStore.getState().isFetchingMore).toBe(false);
    });

    it("should deduplicate items by id", async () => {
      // Setup: items already loaded
      const existingItems = [mockItem({ id: "item-1" }), mockItem({ id: "item-2" })];
      useClipboardStore.setState({ items: existingItems, hasMore: true });

      // fetchMore returns one duplicate and one new
      const newItems = [mockItem({ id: "item-2" }), mockItem({ id: "item-3" })];
      mockedInvoke.mockResolvedValueOnce(newItems);
      await useClipboardStore.getState().fetchMore();

      const items = useClipboardStore.getState().items;
      expect(items).toHaveLength(3);
      expect(items.map((i) => i.id)).toEqual(["item-1", "item-2", "item-3"]);
    });

    it("should set hasMore false when returned items < page size", async () => {
      useClipboardStore.setState({ items: [mockItem({ id: "item-1" })], hasMore: true });

      mockedInvoke.mockResolvedValueOnce([mockItem({ id: "item-2" })]);
      await useClipboardStore.getState().fetchMore();

      expect(useClipboardStore.getState().hasMore).toBe(false);
    });

    it("should do nothing when hasMore is false", async () => {
      useClipboardStore.setState({ items: [mockItem()], hasMore: false });

      await useClipboardStore.getState().fetchMore();

      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it("should do nothing when isFetchingMore is true", async () => {
      useClipboardStore.setState({
        items: [mockItem()],
        hasMore: true,
        isFetchingMore: true,
      });

      await useClipboardStore.getState().fetchMore();

      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it("should do nothing in pins mode", async () => {
      useClipboardStore.setState({
        items: [mockItem()],
        hasMore: true,
        viewMode: "pins",
      });

      await useClipboardStore.getState().fetchMore();

      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it("should do nothing when search query is active", async () => {
      useClipboardStore.setState({
        items: [mockItem()],
        hasMore: true,
        searchQuery: "hello",
      });

      await useClipboardStore.getState().fetchMore();

      expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it("should pass correct offset based on current items length", async () => {
      const existingItems = Array.from({ length: 500 }, (_, i) => mockItem({ id: `item-${i}` }));
      useClipboardStore.setState({ items: existingItems, hasMore: true });

      mockedInvoke.mockResolvedValueOnce([]);
      await useClipboardStore.getState().fetchMore();

      expect(mockedInvoke).toHaveBeenCalledWith("get_clipboard_items", {
        contentType: undefined,
        limit: 500,
        offset: 500,
      });
    });

    it("should pass content type filter", async () => {
      useClipboardStore.setState({
        items: [mockItem()],
        hasMore: true,
        filterType: "image",
      });

      mockedInvoke.mockResolvedValueOnce([]);
      await useClipboardStore.getState().fetchMore();

      expect(mockedInvoke).toHaveBeenCalledWith("get_clipboard_items", {
        contentType: "image",
        limit: 500,
        offset: 1,
      });
    });

    it("should discard stale fetchMore response when generation changes", async () => {
      // Setup: first page loaded
      const existingItems = [mockItem({ id: "item-1" })];
      useClipboardStore.setState({ items: existingItems, hasMore: true });

      // Start fetchMore (returns deferred promise)
      const fetchMoreDeferred = deferred<ClipboardItem[]>();
      mockedInvoke.mockImplementationOnce(() => fetchMoreDeferred.promise);
      const fetchMorePromise = useClipboardStore.getState().fetchMore();

      // Meanwhile, a full refresh happens (bumps generation)
      const freshItems = [mockItem({ id: "fresh-1" })];
      mockedInvoke.mockResolvedValueOnce(freshItems);
      await useClipboardStore.getState().fetchItems();

      expect(useClipboardStore.getState().items).toEqual(freshItems);

      // Now fetchMore resolves with stale data — should be discarded
      fetchMoreDeferred.resolve([mockItem({ id: "stale-more-1" })]);
      await fetchMorePromise;

      // Items should still be the fresh ones, not contaminated by stale fetchMore
      expect(useClipboardStore.getState().items).toEqual(freshItems);
    });

    it("should reset isFetchingMore on error", async () => {
      useClipboardStore.setState({ items: [mockItem()], hasMore: true });

      mockedInvoke.mockRejectedValueOnce(new Error("network error"));
      await useClipboardStore.getState().fetchMore();

      expect(useClipboardStore.getState().isFetchingMore).toBe(false);
    });
  });
});
