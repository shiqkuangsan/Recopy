import type { ClipboardItem } from "../lib/types";
import { copyToClipboard } from "../lib/paste";
import { useCopyHud } from "./CopyHud";
import { TextCard } from "./TextCard";
import { RichTextCard } from "./RichTextCard";
import { ImageCard } from "./ImageCard";
import { FileCard } from "./FileCard";
import { ItemContextMenu } from "./ItemContextMenu";

interface ClipboardCardProps {
  item: ClipboardItem;
  selected: boolean;
  onClick: () => void;
}

export function ClipboardCard({ item, selected, onClick }: ClipboardCardProps) {
  const showHud = useCopyHud((s) => s.show);

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
      default:
        return <TextCard item={item} selected={selected} onClick={onClick} />;
    }
  })();

  return (
    <ItemContextMenu item={item}>
      <div className="relative h-full" onDoubleClick={handleDoubleClick}>
        {card}
      </div>
    </ItemContextMenu>
  );
}
