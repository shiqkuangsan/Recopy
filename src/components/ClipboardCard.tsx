import type { ClipboardItem } from "../lib/types";
import { copyToClipboard } from "../lib/paste";
import { X } from "lucide-react";
import { useCopyHud } from "./CopyHud";
import { useClipboardStore } from "../stores/clipboard-store";
import { FavoriteStar } from "./FavoriteStar";
import { TextCard } from "./TextCard";
import { RichTextCard } from "./RichTextCard";
import { ImageCard } from "./ImageCard";
import { FileCard } from "./FileCard";
import { LinkCard } from "./LinkCard";
import { ItemContextMenu } from "./ItemContextMenu";

interface ClipboardCardProps {
  item: ClipboardItem;
  selected: boolean;
  onClick: () => void;
  quickIndex?: number;
}

export function ClipboardCard({ item, selected, onClick, quickIndex }: ClipboardCardProps) {
  const showHud = useCopyHud((s) => s.show);
  const deleteItem = useClipboardStore((s) => s.deleteItem);
  const modifierHeld = useClipboardStore((s) => s.modifierHeld);

  const handleDoubleClick = () => {
    copyToClipboard(item).then(() => showHud());
  };

  const card = (() => {
    switch (item.content_type) {
      case "plain_text":
        return <TextCard item={item} selected={selected} onClick={onClick} />;
      case "rich_text":
        return <RichTextCard item={item} selected={selected} onClick={onClick} />;
      case "image":
        return <ImageCard item={item} selected={selected} onClick={onClick} />;
      case "file":
        return <FileCard item={item} selected={selected} onClick={onClick} />;
      case "link":
        return <LinkCard item={item} selected={selected} onClick={onClick} />;
      default:
        return <TextCard item={item} selected={selected} onClick={onClick} />;
    }
  })();

  return (
    <ItemContextMenu item={item}>
      <div className="group relative h-full" onDoubleClick={handleDoubleClick}>
        {card}
        {modifierHeld && quickIndex ? (
          <span className="absolute bottom-2 left-2 z-20 flex h-5 w-5 items-center justify-center rounded bg-primary/85 text-xs font-medium text-primary-foreground backdrop-blur-sm">
            {quickIndex}
          </span>
        ) : null}
        <FavoriteStar itemId={item.id} isFavorited={item.is_favorited} />
        <button
          className="absolute top-1.5 right-2 z-20 hidden group-hover:flex items-center justify-center text-white/70 hover:text-destructive transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            deleteItem(item.id);
          }}
        >
          <X size={14} />
        </button>
      </div>
    </ItemContextMenu>
  );
}
