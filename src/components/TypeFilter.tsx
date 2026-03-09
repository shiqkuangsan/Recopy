import { useTranslation } from "react-i18next";
import { useClipboardStore } from "../stores/clipboard-store";
import type { FilterType } from "../lib/types";
import { createPressActionHandlers } from "../lib/press-action";
import { LayoutGrid, Type, Link, Image, File, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

const FILTERS: { i18nKey: string; value: FilterType; icon: LucideIcon }[] = [
  { i18nKey: "filter.all", value: "all", icon: LayoutGrid },
  { i18nKey: "filter.text", value: "plain_text", icon: Type },
  { i18nKey: "filter.link", value: "link", icon: Link },
  { i18nKey: "filter.image", value: "image", icon: Image },
  { i18nKey: "filter.file", value: "file", icon: File },
  { i18nKey: "filter.rich", value: "rich_text", icon: FileText },
];

interface TypeFilterProps {
  iconOnly?: boolean;
}

export function TypeFilter({ iconOnly = false }: TypeFilterProps) {
  const { t } = useTranslation();
  const filterType = useClipboardStore((s) => s.filterType);
  const setFilterType = useClipboardStore((s) => s.setFilterType);
  const setSelectedIndex = useClipboardStore((s) => s.setSelectedIndex);

  const buttons = FILTERS.map((f) => {
    const Icon = f.icon;
    const btn = (
      <button
        key={f.value}
        {...createPressActionHandlers<HTMLButtonElement>(() => {
          if (filterType === f.value) {
            setSelectedIndex(0);
          } else {
            setFilterType(f.value);
          }
        })}
        className={`${iconOnly ? "p-1.5" : "px-2 py-1"} text-sm rounded-md transition-colors cursor-pointer focus:outline-none
          ${
            filterType === f.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
      >
        {iconOnly ? <Icon size={15} /> : t(f.i18nKey)}
      </button>
    );

    if (!iconOnly) return btn;

    return (
      <Tooltip key={f.value}>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent>{t(f.i18nKey)}</TooltipContent>
      </Tooltip>
    );
  });

  if (iconOnly) {
    return (
      <TooltipProvider>
        <div className="flex gap-0.5">{buttons}</div>
      </TooltipProvider>
    );
  }

  return <div className="flex gap-0.5">{buttons}</div>;
}
