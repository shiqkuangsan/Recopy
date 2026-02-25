import { useTranslation } from "react-i18next";
import { useClipboardStore } from "../stores/clipboard-store";
import type { FilterType } from "../lib/types";
import { createPressActionHandlers } from "../lib/press-action";

const FILTERS: { i18nKey: string; value: FilterType }[] = [
  { i18nKey: "filter.all", value: "all" },
  { i18nKey: "filter.text", value: "plain_text" },
  { i18nKey: "filter.rich", value: "rich_text" },
  { i18nKey: "filter.image", value: "image" },
  { i18nKey: "filter.file", value: "file" },
];

export function TypeFilter() {
  const { t } = useTranslation();
  const filterType = useClipboardStore((s) => s.filterType);
  const setFilterType = useClipboardStore((s) => s.setFilterType);

  return (
    <div className="flex gap-0.5">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          {...createPressActionHandlers<HTMLButtonElement>(() => setFilterType(f.value))}
          className={`px-2 py-1 text-sm rounded-md transition-colors cursor-pointer focus:outline-none
            ${
              filterType === f.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
        >
          {t(f.i18nKey)}
        </button>
      ))}
    </div>
  );
}
