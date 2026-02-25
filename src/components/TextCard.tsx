import { useTranslation } from "react-i18next";
import type { ClipboardItem } from "../lib/types";
import { relativeTime } from "../lib/time";
import { createPressActionHandlers } from "../lib/press-action";
import { Star, Type } from "lucide-react";

interface TextCardProps {
  item: ClipboardItem;
  selected: boolean;
  onClick: () => void;
}

const MAX_LINES = 6;
const MAX_CHARS = 300;

export function TextCard({ item, selected, onClick }: TextCardProps) {
  const { t } = useTranslation();
  const preview = truncateText(item.plain_text, MAX_CHARS, MAX_LINES);
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
        <Type size={13} />
        <span className="text-sm">{t("card.text")}</span>
      </div>
      <pre className="whitespace-pre-wrap break-words text-sm font-mono text-foreground leading-relaxed line-clamp-5 flex-1 min-h-0">
        {preview}
      </pre>
      <div className="flex items-center justify-end text-sm text-muted-foreground mt-auto pt-1.5">
        <span>{relativeTime(item.updated_at)}</span>
      </div>
    </div>
  );
}

function truncateText(text: string, maxChars: number, _maxLines: number): string {
  const lines = text.split("\n").slice(0, _maxLines);
  let result = lines.join("\n");
  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + "...";
  } else if (text.split("\n").length > _maxLines) {
    result += "...";
  }
  return result;
}
