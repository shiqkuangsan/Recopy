import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { useClipboardStore } from "../stores/clipboard-store";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function SearchBar() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = useClipboardStore((s) => s.searchQuery);
  const setSearchQuery = useClipboardStore((s) => s.setSearchQuery);
  const searchItems = useClipboardStore((s) => s.searchItems);
  const fetchItems = useClipboardStore((s) => s.fetchItems);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const composingRef = useRef(false);

  const triggerSearch = (value: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        searchItems(value.trim());
      } else {
        fetchItems();
      }
    }, 150);
  };

  const handleChange = (value: string) => {
    setSearchQuery(value);
    if (!composingRef.current) {
      triggerSearch(value);
    }
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
      <Input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => handleChange(e.target.value)}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          triggerSearch(e.currentTarget.value);
        }}
        placeholder={t("search.placeholder")}
        className="bg-input/60 border-border/50 rounded-lg py-1.5 pl-8 pr-7 h-auto text-sm"
      />
      {searchQuery && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleClear}
          className="absolute right-2 text-muted-foreground hover:text-foreground"
        >
          <X size={12} />
        </Button>
      )}
    </div>
  );
}
