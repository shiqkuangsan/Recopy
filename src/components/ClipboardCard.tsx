import { useTranslation } from "react-i18next";
import { useNoteEditorStore } from "../stores/note-editor-store";
import type { ClipboardItem } from "../lib/types";
import { copyToClipboard } from "../lib/paste";
import { SquarePen, X } from "lucide-react";
import { useCopyHud } from "../stores/copy-hud-store";
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
  const { t } = useTranslation();
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
      <div
        data-note-item-id={item.id}
        className="group relative h-full"
        onDoubleClick={handleDoubleClick}
      >
        {card}
        {modifierHeld && quickIndex ? (
          <span className="absolute bottom-2 left-2 z-20 flex h-5 w-5 items-center justify-center rounded bg-primary/85 text-xs font-medium text-primary-foreground backdrop-blur-sm">
            {quickIndex}
          </span>
        ) : null}
        <div
          className="absolute top-3 right-3 z-20 flex items-center gap-0.5"
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label={item.note_title ? t("note.edit") : t("note.add")}
            title={item.note_title ? t("note.edit") : t("note.add")}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            onClick={(e) => {
              e.stopPropagation();
              useNoteEditorStore.getState().open(item);
            }}
          >
            <SquarePen size={14} />
          </button>
          <FavoriteStar itemId={item.id} isFavorited={item.is_favorited} />
          <button
            type="button"
            aria-label={t("context.delete")}
            title={t("context.delete")}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
            onClick={(e) => {
              e.stopPropagation();
              deleteItem(item.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </ItemContextMenu>
  );
}
