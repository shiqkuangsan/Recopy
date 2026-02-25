import { useTranslation } from "react-i18next";
import type { ClipboardItem } from "../lib/types";
import { relativeTime, formatSize } from "../lib/time";
import { createPressActionHandlers } from "../lib/press-action";
import { Star, ImageIcon } from "lucide-react";
import { useThumbnail } from "../hooks/useThumbnail";

interface ImageCardProps {
  item: ClipboardItem;
  selected: boolean;
  onClick: () => void;
}

export function ImageCard({ item, selected, onClick }: ImageCardProps) {
  const { t } = useTranslation();
  const pressHandlers = createPressActionHandlers<HTMLDivElement>(onClick, {
    enableKeyboardHandler: true,
  });
  const thumbnailUrl = useThumbnail(item.id);

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
          className="absolute top-2 right-2 text-yellow-500 z-10"
          size={14}
          fill="currentColor"
        />
      )}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <ImageIcon size={13} />
        <span className="text-sm">{t("card.image")}</span>
        <span className="text-sm ml-auto">{formatSize(item.content_size)}</span>
      </div>
      <div className="flex items-center justify-center rounded-md bg-muted/30 overflow-hidden flex-1 min-h-0">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={t("card.clipboardImage")}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <ImageIcon size={32} className="text-muted-foreground/40" />
        )}
      </div>
      <div className="flex items-center justify-end text-sm text-muted-foreground mt-auto pt-1.5">
        <span>{relativeTime(item.updated_at)}</span>
      </div>
    </div>
  );
}
