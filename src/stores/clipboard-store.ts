import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ClipboardItem, FilterType, ViewMode } from "../lib/types";

const DEFAULT_PAGE_SIZE = 500;
type PanelOpenSelection = "preserve" | "latest";

interface ClipboardState {
  items: ClipboardItem[];
  loading: boolean;
  searchQuery: string;
  filterType: FilterType;
  viewMode: ViewMode;
  selectedIndex: number;
  panelShowVersion: number;
  modifierHeld: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  dirty: boolean;

  // Actions
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: FilterType) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedIndex: (index: number) => void;
  setModifierHeld: (held: boolean) => void;
  fetchItems: () => Promise<void>;
  searchItems: (query: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  refreshOnChange: () => Promise<void>;
  markDirty: () => void;
  fetchFavorites: () => Promise<void>;
  fetchMore: () => Promise<void>;
  onPanelShow: (selectionMode?: PanelOpenSelection) => Promise<void>;
}

interface SelectionSnapshot {
  selectedIndex: number;
  selectedItemId: string | null;
}

export const useClipboardStore = create<ClipboardState>((set, get) => {
  // Ensure only the latest in-flight query can update UI state.
  let latestRequestToken = 0;
  let loadedScopeKey: string | null = null;
  let inFlightFirstPage: { key: string; promise: Promise<void> } | null = null;
  const nextRequestToken = () => {
    latestRequestToken += 1;
    return latestRequestToken;
  };
  const isLatestRequest = (token: number) => token === latestRequestToken;
  const takeSelectionSnapshot = (): SelectionSnapshot => {
    const { items, selectedIndex } = get();
    return {
      selectedIndex,
      selectedItemId: items[selectedIndex]?.id ?? null,
    };
  };
  const clampSelectedIndex = (index: number, items: ClipboardItem[]) => {
    if (items.length === 0) return 0;
    return Math.max(0, Math.min(index, items.length - 1));
  };
  const resolveSelectedIndex = (
    items: ClipboardItem[],
    selectionSnapshot: SelectionSnapshot | null,
  ) => {
    if (!selectionSnapshot) return 0;

    if (selectionSnapshot.selectedItemId) {
      const matchedIndex = items.findIndex((item) => item.id === selectionSnapshot.selectedItemId);
      if (matchedIndex !== -1) return matchedIndex;
    }

    return clampSelectedIndex(selectionSnapshot.selectedIndex, items);
  };
  const applyLoadedItems = (
    items: ClipboardItem[],
    options: {
      hasMore: boolean;
      selectionSnapshot?: SelectionSnapshot | null;
      selectFirst?: boolean;
      scopeKey?: string;
      clearDirty?: boolean;
      bumpPanelShowVersion?: boolean;
    },
  ) => {
    if (options.scopeKey) {
      loadedScopeKey = options.scopeKey;
    }
    set((state) => ({
      items,
      loading: false,
      hasMore: options.hasMore,
      isFetchingMore: false,
      dirty: options.clearDirty ? false : state.dirty,
      panelShowVersion: options.bumpPanelShowVersion
        ? state.panelShowVersion + 1
        : state.panelShowVersion,
      selectedIndex: options.selectFirst
        ? 0
        : options.selectionSnapshot != null
          ? resolveSelectedIndex(items, options.selectionSnapshot)
          : clampSelectedIndex(state.selectedIndex, items),
    }));
  };
  const historyScopeKey = (contentType: string | undefined) => `history:${contentType ?? "all"}`;
  const favoritesScopeKey = (contentType: string | undefined) =>
    `favorites:${contentType ?? "all"}`;
  const searchScopeKey = (query: string, contentType: string | undefined, favoritesOnly: boolean) =>
    `search:${favoritesOnly ? "pins" : "history"}:${contentType ?? "all"}:${query}`;
  const currentScopeKey = () => {
    const { filterType, searchQuery, viewMode } = get();
    const contentType: string | undefined = filterType === "all" ? undefined : filterType;
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      return searchScopeKey(trimmedQuery, contentType, viewMode === "pins");
    }
    return viewMode === "pins" ? favoritesScopeKey(contentType) : historyScopeKey(contentType);
  };
  const runFirstPageRequest = async (key: string, loader: () => Promise<void>) => {
    if (inFlightFirstPage?.key === key) {
      return inFlightFirstPage.promise;
    }

    const promise = loader().finally(() => {
      if (inFlightFirstPage?.promise === promise) {
        inFlightFirstPage = null;
      }
    });
    inFlightFirstPage = { key, promise };
    return promise;
  };
  const loadHistoryPage = async (
    preserveSelection = false,
    selectFirst = false,
    bumpPanelShowVersion = false,
    clearDirty = false,
  ) => {
    const { filterType } = get();
    const contentType: string | undefined = filterType === "all" ? undefined : filterType;
    const scopeKey = historyScopeKey(contentType);
    const inFlightKey = `${scopeKey}:${preserveSelection ? "p" : "r"}:${selectFirst ? "f" : "k"}:${bumpPanelShowVersion ? "show" : "load"}`;
    return runFirstPageRequest(inFlightKey, async () => {
      const requestToken = nextRequestToken();
      const selectionSnapshot = preserveSelection ? takeSelectionSnapshot() : null;
      set({ loading: true });
      try {
        const items = await invoke<ClipboardItem[]>("get_clipboard_items", {
          contentType,
          limit: DEFAULT_PAGE_SIZE,
          offset: 0,
        });
        if (!isLatestRequest(requestToken)) return;
        applyLoadedItems(items, {
          hasMore: items.length >= DEFAULT_PAGE_SIZE,
          selectionSnapshot,
          selectFirst,
          scopeKey,
          clearDirty,
          bumpPanelShowVersion,
        });
      } catch (e) {
        console.error("Failed to fetch items:", e);
        if (!isLatestRequest(requestToken)) return;
        set({ loading: false, isFetchingMore: false });
      }
    });
  };
  const loadSearchResults = async (
    query: string,
    preserveSelection = false,
    selectFirst = false,
    bumpPanelShowVersion = false,
    clearDirty = false,
  ) => {
    const { filterType, viewMode } = get();
    const contentType: string | undefined = filterType === "all" ? undefined : filterType;
    const favoritesOnly = viewMode === "pins";
    const scopeKey = searchScopeKey(query, contentType, favoritesOnly);
    const inFlightKey = `${scopeKey}:${preserveSelection ? "p" : "r"}:${selectFirst ? "f" : "k"}:${bumpPanelShowVersion ? "show" : "load"}`;
    return runFirstPageRequest(inFlightKey, async () => {
      const requestToken = nextRequestToken();
      const selectionSnapshot = preserveSelection ? takeSelectionSnapshot() : null;
      set({ loading: true });
      try {
        const items = await invoke<ClipboardItem[]>("search_clipboard_items", {
          query,
          contentType,
          limit: DEFAULT_PAGE_SIZE,
          favoritesOnly,
        });
        if (!isLatestRequest(requestToken)) return;
        applyLoadedItems(items, {
          hasMore: false,
          selectionSnapshot,
          selectFirst,
          scopeKey,
          clearDirty,
          bumpPanelShowVersion,
        });
      } catch (e) {
        console.error("Failed to search items:", e);
        if (!isLatestRequest(requestToken)) return;
        set({ loading: false, isFetchingMore: false });
      }
    });
  };
  const loadFavoritesPage = async (
    preserveSelection = false,
    selectFirst = false,
    bumpPanelShowVersion = false,
    clearDirty = false,
  ) => {
    const { filterType } = get();
    const contentType: string | undefined = filterType === "all" ? undefined : filterType;
    const scopeKey = favoritesScopeKey(contentType);
    const inFlightKey = `${scopeKey}:${preserveSelection ? "p" : "r"}:${selectFirst ? "f" : "k"}:${bumpPanelShowVersion ? "show" : "load"}`;
    return runFirstPageRequest(inFlightKey, async () => {
      const requestToken = nextRequestToken();
      const selectionSnapshot = preserveSelection ? takeSelectionSnapshot() : null;
      set({ loading: true });
      try {
        const items = await invoke<ClipboardItem[]>("get_favorited_items", {
          contentType,
          limit: DEFAULT_PAGE_SIZE,
          offset: 0,
        });
        if (!isLatestRequest(requestToken)) return;
        applyLoadedItems(items, {
          hasMore: false,
          selectionSnapshot,
          selectFirst,
          scopeKey,
          clearDirty,
          bumpPanelShowVersion,
        });
      } catch (e) {
        console.error("Failed to fetch favorites:", e);
        if (!isLatestRequest(requestToken)) return;
        set({ loading: false, isFetchingMore: false });
      }
    });
  };

  return {
    items: [],
    loading: false,
    searchQuery: "",
    filterType: "all",
    viewMode: "history",
    selectedIndex: 0,
    panelShowVersion: 0,
    modifierHeld: false,
    hasMore: true,
    isFetchingMore: false,
    dirty: true,

    setSearchQuery: (query: string) => set({ searchQuery: query, selectedIndex: 0 }),

    setFilterType: (filter: FilterType) => {
      loadedScopeKey = null;
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
      loadedScopeKey = null;
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

    fetchItems: async () => loadHistoryPage(false, false, false, true),

    searchItems: async (query: string) => loadSearchResults(query, false, false, false, true),

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

    toggleFavorite: async (id: string) => {
      try {
        await invoke("toggle_favorite", { id });
        await get().refreshOnChange();
      } catch (e) {
        console.error("Failed to toggle favorite:", e);
      }
    },

    refreshOnChange: async () => {
      const { searchQuery, viewMode } = get();
      if (viewMode === "pins") {
        await loadFavoritesPage(true, false, false, true);
      } else {
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery) {
          await loadSearchResults(trimmedQuery, true, false, false, true);
        } else {
          await loadHistoryPage(true, false, false, true);
        }
      }
    },

    markDirty: () => set({ dirty: true }),

    fetchFavorites: async () => loadFavoritesPage(false, false, false, true),

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

    onPanelShow: async (selectionMode = "preserve") => {
      // Preserve current list scope. Selection can either keep the previous item or reset to latest.
      const { searchQuery, viewMode } = get();
      const preserveSelection = selectionMode !== "latest";
      const selectFirst = selectionMode === "latest";
      const needsRefresh =
        get().dirty || get().items.length === 0 || loadedScopeKey !== currentScopeKey();

      if (!needsRefresh) {
        set((state) => ({
          panelShowVersion: state.panelShowVersion + 1,
          selectedIndex: selectFirst ? 0 : state.selectedIndex,
        }));
        return;
      }

      if (viewMode === "pins") {
        await loadFavoritesPage(preserveSelection, selectFirst, true, true);
      } else {
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery) {
          await loadSearchResults(trimmedQuery, preserveSelection, selectFirst, true, true);
        } else {
          await loadHistoryPage(preserveSelection, selectFirst, true, true);
        }
      }
    },
  };
});
