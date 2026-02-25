import { useTranslation } from "react-i18next";
import { Clipboard, ClipboardPaste, FileText, Star, Trash2 } from "lucide-react";
import type { ClipboardItem } from "../lib/types";
import { pasteItem, copyToClipboard, pasteAsPlainText } from "../lib/paste";
import { useClipboardStore } from "../stores/clipboard-store";
import { useCopyHud } from "./CopyHud";
import { invoke } from "@tauri-apps/api/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu";

interface ItemContextMenuProps {
  item: ClipboardItem;
  children: React.ReactNode;
}

export function ItemContextMenu({ item, children }: ItemContextMenuProps) {
  const { t } = useTranslation();
  const deleteItem = useClipboardStore((s) => s.deleteItem);
  const refreshOnChange = useClipboardStore((s) => s.refreshOnChange);

  const showHud = useCopyHud((s) => s.show);

  const handlePaste = () => pasteItem(item);
  const handlePastePlain = () => pasteAsPlainText(item);
  const handleCopy = () => copyToClipboard(item).then(() => showHud());

  const handleToggleFavorite = async () => {
    try {
      await invoke("toggle_favorite", { id: item.id });
      refreshOnChange();
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
    }
  };

  const handleDelete = () => deleteItem(item.id);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-[180px]">
        <ContextMenuItem onSelect={handlePaste}>
          <ClipboardPaste size={14} />
          {t("context.paste")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handlePastePlain}>
          <FileText size={14} />
          {t("context.pasteAsPlainText")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopy}>
          <Clipboard size={14} />
          {t("context.copyToClipboard")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleToggleFavorite}>
          <Star size={14} />
          {item.is_favorited ? t("context.unfavorite") : t("context.favorite")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={handleDelete}>
          <Trash2 size={14} />
          {t("context.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
