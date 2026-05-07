import { useTranslation } from "react-i18next";
import { useClipboardStore } from "../stores/clipboard-store";
import type { ViewMode } from "../lib/types";
import { createPressActionHandlers } from "../lib/press-action";
import { Clock, Star } from "lucide-react";

const TABS: { i18nKey: string; value: ViewMode; icon: typeof Clock }[] = [
  { i18nKey: "tabs.history", value: "history", icon: Clock },
  { i18nKey: "tabs.pins", value: "pins", icon: Star },
];

export function ViewTabs() {
  const { t } = useTranslation();
  const viewMode = useClipboardStore((s) => s.viewMode);
  const setViewMode = useClipboardStore((s) => s.setViewMode);
  const setSelectedIndex = useClipboardStore((s) => s.setSelectedIndex);

  return (
    <div className="flex gap-0.5">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const pressHandlers = createPressActionHandlers<HTMLButtonElement>(() => {
          if (viewMode === tab.value) {
            setSelectedIndex(0);
          } else {
            setViewMode(tab.value);
          }
        });
        return (
          <button
            key={tab.value}
            {...pressHandlers}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md transition-colors cursor-pointer focus:outline-none
              ${
                viewMode === tab.value
                  ? "text-foreground bg-overlay"
                  : "text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white"
              }`}
          >
            <Icon size={13} />
            {t(tab.i18nKey)}
          </button>
        );
      })}
    </div>
  );
}
