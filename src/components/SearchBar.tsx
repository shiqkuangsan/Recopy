import { useEffect, useId, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Search, X, History } from "lucide-react";
import { useClipboardStore } from "../stores/clipboard-store";
import { useSettingsStore } from "../stores/settings-store";
import { useSearchHistoryStore } from "../stores/search-history-store";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

export function SearchBar() {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = useClipboardStore((s) => s.searchQuery);
  const setSearchQuery = useClipboardStore((s) => s.setSearchQuery);
  const searchItems = useClipboardStore((s) => s.searchItems);
  const clearSearch = useClipboardStore((s) => s.clearSearch);
  const fetchItems = useClipboardStore((s) => s.fetchItems);
  const fetchFavorites = useClipboardStore((s) => s.fetchFavorites);
  const viewMode = useClipboardStore((s) => s.viewMode);
  const historyEnabled = useSettingsStore((s) => s.settings.search_history_enabled === "true");
  const panelPosition = useSettingsStore((s) => s.settings.panel_position);
  const entries = useSearchHistoryStore((s) => s.entries);
  const [open, setOpen] = useState(false);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const composingRef = useRef(false);
  const visible = open && historyEnabled && !searchQuery.trim() && entries.length > 0;
  const activeIndex = activeQuery === null ? -1 : entries.indexOf(activeQuery);

  const finishSearch = () => {
    if (!composingRef.current) useSearchHistoryStore.getState().finish();
  };

  useEffect(() => {
    const unlisten = listen("recopy-hide", () => {
      if (!composingRef.current) useSearchHistoryStore.getState().finish();
      setOpen(false);
      setActiveQuery(null);
    });
    return () => {
      clearTimeout(debounceRef.current);
      void unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (visible && activeIndex >= 0) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [visible, activeIndex, listId]);

  const triggerSearch = (value: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // A successful paste may have cleared the query while this timer was pending.
      if (useClipboardStore.getState().searchQuery !== value) return;
      if (value.trim()) {
        void searchItems(value.trim());
      } else {
        void (viewMode === "pins" ? fetchFavorites() : fetchItems());
      }
    }, 150);
  };

  const handleChange = (value: string) => {
    if (!value.trim()) finishSearch();
    setSearchQuery(value);
    setActiveQuery(null);
    setOpen(!value.trim());
    if (!composingRef.current) triggerSearch(value);
  };

  const handleClear = () => {
    clearTimeout(debounceRef.current);
    void clearSearch();
    setActiveQuery(null);
    setOpen(true);
    inputRef.current?.focus();
  };

  const applyHistory = (query: string) => {
    clearTimeout(debounceRef.current);
    setSearchQuery(query);
    void searchItems(query);
    useSearchHistoryStore.getState().finish();
    setOpen(false);
    setActiveQuery(null);
    inputRef.current?.focus();
  };

  return (
    <Popover
      open={visible}
      onOpenChange={(value) => {
        setOpen(value);
        setActiveQuery(null);
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative flex items-center w-64">
          <Search
            size={14}
            className="absolute left-2.5 text-zinc-700 dark:text-zinc-300 pointer-events-none"
          />
          <Input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={t("search.placeholder")}
            aria-autocomplete="none"
            aria-haspopup="grid"
            aria-expanded={visible}
            aria-controls={visible ? listId : undefined}
            aria-activedescendant={
              visible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
            }
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              setOpen(true);
              setActiveQuery(null);
            }}
            onClick={() => setOpen(true)}
            onBlur={finishSearch}
            onKeyDown={(e) => {
              if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (!visible) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                const nextIndex =
                  activeIndex < 0
                    ? e.key === "ArrowDown"
                      ? 0
                      : entries.length - 1
                    : (activeIndex + (e.key === "ArrowDown" ? 1 : -1) + entries.length) %
                      entries.length;
                setActiveQuery(entries[nextIndex]);
              } else if (e.key === "Enter" && activeIndex >= 0) {
                e.preventDefault();
                e.stopPropagation();
                applyHistory(entries[activeIndex]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setActiveQuery(null);
              }
            }}
            onCompositionStart={() => {
              composingRef.current = true;
              clearTimeout(debounceRef.current);
              setOpen(false);
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              triggerSearch(e.currentTarget.value);
            }}
            placeholder={t("search.placeholder")}
            className="bg-input/60 border-border/50 rounded-lg py-1.5 pl-8 pr-7 h-auto text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-600 dark:placeholder:text-zinc-300"
          />
          {searchQuery.trim() && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("search.clear")}
              onClick={handleClear}
              className="absolute right-2"
            >
              <X size={12} />
            </Button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        aria-label={t("search.recent")}
        align="start"
        side={panelPosition === "top" ? "top" : "bottom"}
        collisionPadding={8}
        className="w-64 max-w-[calc(100vw-16px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (e.target === inputRef.current) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (composingRef.current || e.isComposing || e.keyCode === 229) return;
          // Radix handles Escape in capture phase, before the panel's document listener.
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.focus();
          setOpen(false);
          setActiveQuery(null);
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <span className="text-xs text-muted-foreground">{t("search.recent")}</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              useSearchHistoryStore.getState().clear();
              setOpen(false);
              inputRef.current?.focus();
            }}
          >
            {t("search.clearHistory")}
          </Button>
        </div>
        <div id={listId} role="grid" aria-label={t("search.recent")}>
          {entries.map((query, index) => (
            <div key={query} role="row" className="flex items-center gap-1">
              <div
                role="gridcell"
                id={`${listId}-${index}`}
                aria-selected={query === activeQuery}
                className="min-w-0 flex-1"
              >
                <Button
                  variant={query === activeQuery ? "secondary" : "ghost"}
                  size="sm"
                  tabIndex={-1}
                  className="w-full justify-start"
                  title={query}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyHistory(query)}
                >
                  <History size={14} />
                  <span className="truncate">{query}</span>
                </Button>
              </div>
              <div role="gridcell">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("search.removeHistory", { query })}
                  onClick={() => {
                    useSearchHistoryStore.getState().remove(query);
                    setActiveQuery(null);
                  }}
                >
                  <X size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
