import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Search, X } from "lucide-react";
import { useClipboardStore } from "../stores/clipboard-store";

export function SearchBar() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = useClipboardStore((s) => s.searchQuery);
  const setSearchQuery = useClipboardStore((s) => s.setSearchQuery);
  const searchItems = useClipboardStore((s) => s.searchItems);
  const fetchItems = useClipboardStore((s) => s.fetchItems);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-focus on mount and on panel show
  useEffect(() => {
    inputRef.current?.focus();
    const unlisten = listen("recopy-show", () => {
      inputRef.current?.focus();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleChange = (value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        searchItems(value.trim());
      } else {
        fetchItems();
      }
    }, 150);
  };

  const handleClear = () => {
    setSearchQuery("");
    fetchItems();
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex items-center w-64">
      <Search
        size={14}
        className="absolute left-2.5 text-muted-foreground pointer-events-none"
      />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t("search.placeholder")}
        className="w-full bg-input/60 border border-border/50 rounded-lg py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {searchQuery && (
        <button
          onClick={handleClear}
          className="absolute right-2 p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
