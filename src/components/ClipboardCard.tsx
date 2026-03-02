import type { ClipboardItem } from "../lib/types";
import { copyToClipboard } from "../lib/paste";
import { X } from "lucide-react";
import { useCopyHud } from "./CopyHud";
import { useClipboardStore } from "../stores/clipboard-store";
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
}

export function ClipboardCard({ item, selected, onClick }: ClipboardCardProps) {
  const showHud = useCopyHud((s) => s.show);
  const deleteItem = useClipboardStore((s) => s.deleteItem);

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
        <button
          className="absolute top-1 right-1 z-20 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-black/50 hover:bg-destructive text-white transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            deleteItem(item.id);
          }}
        >
          <X size={12} />
        </button>
      </div>
    </ItemContextMenu>
  );
}
