import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ClipboardItem, FilterType, ViewMode } from "../lib/types";

interface ClipboardState {
  items: ClipboardItem[];
  loading: boolean;
  searchQuery: string;
  filterType: FilterType;
  viewMode: ViewMode;
  selectedIndex: number;

  // Actions
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: FilterType) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedIndex: (index: number) => void;
  fetchItems: () => Promise<void>;
  searchItems: (query: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  refreshOnChange: () => Promise<void>;
  fetchFavorites: () => Promise<void>;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  items: [],
  loading: false,
  searchQuery: "",
  filterType: "all",
  viewMode: "history",
  selectedIndex: 0,

  setSearchQuery: (query: string) => set({ searchQuery: query, selectedIndex: 0 }),

  setFilterType: (filter: FilterType) => {
    set({ filterType: filter, selectedIndex: 0 });
    const { searchQuery, viewMode } = get();
    if (viewMode === "history") {
      if (searchQuery) {
        get().searchItems(searchQuery);
      } else {
        get().fetchItems();
      }
    } else if (viewMode === "pins") {
      get().fetchFavorites();
    }
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode, selectedIndex: 0 });
    if (mode === "history") {
      get().fetchItems();
    } else if (mode === "pins") {
      get().fetchFavorites();
    }
  },

  setSelectedIndex: (index: number) => set({ selectedIndex: index }),

  fetchItems: async () => {
    set({ loading: true });
    try {
      const { filterType } = get();
      const contentType: string | undefined =
        filterType === "all" ? undefined : filterType;
      const items = await invoke<ClipboardItem[]>("get_clipboard_items", {
        contentType,
        limit: 200,
        offset: 0,
      });
      set({ items, loading: false });
    } catch (e) {
      console.error("Failed to fetch items:", e);
      set({ loading: false });
    }
  },

  searchItems: async (query: string) => {
    set({ loading: true });
    try {
      const { filterType } = get();
      const contentType: string | undefined =
        filterType === "all" ? undefined : filterType;
      const items = await invoke<ClipboardItem[]>("search_clipboard_items", {
        query,
        contentType,
        limit: 200,
      });
      set({ items, loading: false });
    } catch (e) {
      console.error("Failed to search items:", e);
      set({ loading: false });
    }
  },

  deleteItem: async (id: string) => {
    try {
      await invoke("delete_clipboard_item", { id });
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
    } else if (searchQuery) {
      await get().searchItems(searchQuery);
    } else {
      await get().fetchItems();
    }
  },

  fetchFavorites: async () => {
    set({ loading: true });
    try {
      const { filterType } = get();
      const contentType: string | undefined =
        filterType === "all" ? undefined : filterType;
      const items = await invoke<ClipboardItem[]>("get_favorited_items", {
        contentType,
        limit: 200,
        offset: 0,
      });
      set({ items, loading: false });
    } catch (e) {
      console.error("Failed to fetch favorites:", e);
      set({ loading: false });
    }
  },
}));
