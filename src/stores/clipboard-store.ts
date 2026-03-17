import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ClipboardItem, FilterType, ViewMode } from "../lib/types";

const DEFAULT_PAGE_SIZE = 500;

interface ClipboardState {
  items: ClipboardItem[];
  loading: boolean;
  searchQuery: string;
  filterType: FilterType;
  viewMode: ViewMode;
  selectedIndex: number;
  modifierHeld: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;

  // Actions
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: FilterType) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedIndex: (index: number) => void;
  setModifierHeld: (held: boolean) => void;
  fetchItems: () => Promise<void>;
  searchItems: (query: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  refreshOnChange: () => Promise<void>;
  fetchFavorites: () => Promise<void>;
  fetchMore: () => Promise<void>;
  onPanelShow: () => Promise<void>;
}

export const useClipboardStore = create<ClipboardState>((set, get) => {
  // Ensure only the latest in-flight query can update UI state.
  let latestRequestToken = 0;
  const nextRequestToken = () => {
    latestRequestToken += 1;
    return latestRequestToken;
  };
  const isLatestRequest = (token: number) => token === latestRequestToken;

  return {
    items: [],
    loading: false,
    searchQuery: "",
    filterType: "all",
    viewMode: "history",
    selectedIndex: 0,
    modifierHeld: false,
    hasMore: true,
    isFetchingMore: false,

    setSearchQuery: (query: string) => set({ searchQuery: query, selectedIndex: 0 }),

    setFilterType: (filter: FilterType) => {
      set({ filterType: filter, selectedIndex: 0, items: [] });
      const { searchQuery, viewMode } = get();
      if (viewMode === "history") {
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery) {
          get().searchItems(trimmedQuery);
        } else {
          get().fetchItems();
        }
      } else if (viewMode === "pins") {
        get().fetchFavorites();
      }
    },

    setViewMode: (mode: ViewMode) => {
      set({ viewMode: mode, selectedIndex: 0 });
      const trimmedQuery = get().searchQuery.trim();
      if (trimmedQuery) {
        get().searchItems(trimmedQuery);
      } else if (mode === "history") {
        get().fetchItems();
      } else if (mode === "pins") {
        get().fetchFavorites();
      }
    },

    setSelectedIndex: (index: number) => set({ selectedIndex: index }),
    setModifierHeld: (held: boolean) => set({ modifierHeld: held }),

    fetchItems: async () => {
      const requestToken = nextRequestToken();
      set({ loading: true });
      try {
        const { filterType } = get();
        const contentType: string | undefined = filterType === "all" ? undefined : filterType;
        const items = await invoke<ClipboardItem[]>("get_clipboard_items", {
          contentType,
          limit: DEFAULT_PAGE_SIZE,
          offset: 0,
        });
        if (!isLatestRequest(requestToken)) return;
        set({
          items,
          loading: false,
          hasMore: items.length >= DEFAULT_PAGE_SIZE,
          isFetchingMore: false,
        });
      } catch (e) {
        console.error("Failed to fetch items:", e);
        if (!isLatestRequest(requestToken)) return;
        set({ loading: false, isFetchingMore: false });
      }
    },

    searchItems: async (query: string) => {
      const requestToken = nextRequestToken();
      set({ loading: true });
      try {
        const { filterType, viewMode } = get();
        const contentType: string | undefined = filterType === "all" ? undefined : filterType;
        const items = await invoke<ClipboardItem[]>("search_clipboard_items", {
          query,
          contentType,
          limit: DEFAULT_PAGE_SIZE,
          favoritesOnly: viewMode === "pins",
        });
        if (!isLatestRequest(requestToken)) return;
        set({
          items,
          loading: false,
          hasMore: false,
          isFetchingMore: false,
        });
      } catch (e) {
        console.error("Failed to search items:", e);
        if (!isLatestRequest(requestToken)) return;
        set({ loading: false, isFetchingMore: false });
      }
    },

    deleteItem: async (id: string) => {
      try {
        await invoke("delete_clipboard_item", { id });
        // Bump token so any in-flight fetch won't resurrect the deleted item.
        nextRequestToken();
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      } catch (e) {
        console.error("Failed to delete item:", e);
      }
    },

    refreshOnChange: async () => {
      const { searchQuery, viewMode } = get();
      if (viewMode === "pins") {
        await get().fetchFavorites();
      } else {
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery) {
          await get().searchItems(trimmedQuery);
        } else {
          await get().fetchItems();
        }
      }
    },

    fetchFavorites: async () => {
      const requestToken = nextRequestToken();
      set({ loading: true });
      try {
        const { filterType } = get();
        const contentType: string | undefined = filterType === "all" ? undefined : filterType;
        const items = await invoke<ClipboardItem[]>("get_favorited_items", {
          contentType,
          limit: DEFAULT_PAGE_SIZE,
          offset: 0,
        });
        if (!isLatestRequest(requestToken)) return;
        set({
          items,
          loading: false,
          hasMore: false, // Pins mode never does incremental loading
          isFetchingMore: false,
        });
      } catch (e) {
        console.error("Failed to fetch favorites:", e);
        if (!isLatestRequest(requestToken)) return;
        set({ loading: false, isFetchingMore: false });
      }
    },

    fetchMore: async () => {
      const { viewMode, searchQuery, hasMore, isFetchingMore, items } = get();
      // Only fetch more for history mode without search
      if (viewMode !== "history" || searchQuery.trim() !== "" || !hasMore || isFetchingMore) return;

      const requestToken = latestRequestToken; // capture current generation (don't increment!)
      set({ isFetchingMore: true });
      try {
        const { filterType } = get();
        const contentType: string | undefined = filterType === "all" ? undefined : filterType;
        const newItems = await invoke<ClipboardItem[]>("get_clipboard_items", {
          contentType,
          limit: DEFAULT_PAGE_SIZE,
          offset: items.length,
        });
        if (!isLatestRequest(requestToken)) return; // stale response, discard

        // Deduplicate by id
        const existingIds = new Set(get().items.map((i) => i.id));
        const uniqueNewItems = newItems.filter((i) => !existingIds.has(i.id));

        set((state) => ({
          items: [...state.items, ...uniqueNewItems],
          hasMore: newItems.length >= DEFAULT_PAGE_SIZE,
          isFetchingMore: false,
        }));
      } catch (e) {
        console.error("Failed to fetch more items:", e);
        if (!isLatestRequest(requestToken)) return;
        set({ isFetchingMore: false });
      }
    },

    onPanelShow: async () => {
      // Preserve all UI state: viewMode, filterType, searchQuery, selectedIndex, scroll position.
      const { searchQuery, viewMode } = get();
      if (viewMode === "pins") {
        await get().fetchFavorites();
      } else {
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery) {
          await get().searchItems(trimmedQuery);
        } else {
          await get().fetchItems();
        }
      }
    },
  };
});
