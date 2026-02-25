import { useTranslation } from "react-i18next";
import type { ClipboardItem } from "../lib/types";
import { relativeTime } from "../lib/time";
import { createPressActionHandlers } from "../lib/press-action";
import { Star, FileText } from "lucide-react";

interface RichTextCardProps {
  item: ClipboardItem;
  selected: boolean;
  onClick: () => void;
}

export function RichTextCard({ item, selected, onClick }: RichTextCardProps) {
  const { t } = useTranslation();
  const preview =
    item.plain_text.length > 300
      ? item.plain_text.slice(0, 300) + "..."
      : item.plain_text;
  const pressHandlers = createPressActionHandlers<HTMLDivElement>(onClick, {
    enableKeyboardHandler: true,
  });

  return (
    <div
      role="button"
      tabIndex={0}
      {...pressHandlers}
      className={`relative flex flex-col gap-1.5 rounded-lg border p-2.5 cursor-pointer transition-colors h-full overflow-hidden
        ${selected ? "border-primary bg-selected" : "border-border/50 bg-card/60 hover:border-muted-foreground/30 hover:bg-card/80"}`}
    >
      {item.is_favorited && (
        <Star
          className="absolute top-2 right-2 text-yellow-500"
          size={14}
          fill="currentColor"
        />
      )}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <FileText size={13} />
        <span className="text-sm">{t("card.richText")}</span>
      </div>
      <div className="text-sm text-foreground leading-relaxed line-clamp-5 flex-1 min-h-0">
        {preview}
      </div>
      <div className="flex items-center justify-end text-sm text-muted-foreground mt-auto pt-1.5">
        <span>{relativeTime(item.updated_at)}</span>
      </div>
    </div>
  );
}
