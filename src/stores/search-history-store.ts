import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useSettingsStore } from "./settings-store";

const HISTORY_LIMIT = 10;

// Persistence is optional; a storage failure must never interrupt search or paste.
const historyStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      if (localStorage.getItem(name) !== value) localStorage.setItem(name, value);
    } catch {
      console.warn("Recent searches could not be persisted on this device.");
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      console.warn("Recent search storage could not be removed.");
    }
  },
}));

interface SearchSession {
  query: string;
  executed: boolean;
  finished: boolean;
}

interface SearchHistoryState {
  entries: string[];
  session: SearchSession | null;
  begin: (query: string) => void;
  executed: (query: string) => void;
  finish: () => void;
  remove: (query: string) => void;
  clear: () => void;
}

function normalizeEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].slice(0, HISTORY_LIMIT);
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set, get) => {
      const saveFinished = () => {
        const { session, entries } = get();
        if (!session?.executed || !session.finished) return;
        const enabled = useSettingsStore.getState().settings.search_history_enabled === "true";
        set({
          session: null,
          entries: enabled ? normalizeEntries([session.query, ...entries]) : entries,
        });
      };
      return {
        entries: [],
        session: null,
        begin: (query) => {
          const trimmed = query.trim();
          set({ session: trimmed ? { query: trimmed, executed: false, finished: false } : null });
        },
        executed: (query) => {
          const { session } = get();
          if (!session || session.query !== query.trim()) return;
          set({ session: { ...session, executed: true } });
          saveFinished();
        },
        finish: () => {
          const { session } = get();
          if (!session) return;
          set({ session: { ...session, finished: true } });
          saveFinished();
        },
        remove: (query) =>
          set((state) => ({
            entries: state.entries.filter((entry) => entry !== query),
            session: state.session?.query === query ? null : state.session,
          })),
        clear: () => set({ entries: [], session: null }),
      };
    },
    {
      name: "recopy-recent-searches",
      storage: historyStorage,
      partialize: (state) => ({ entries: state.entries }),
      merge: (persisted, current) => ({
        ...current,
        entries: normalizeEntries((persisted as { entries?: unknown } | undefined)?.entries),
      }),
    },
  ),
);
