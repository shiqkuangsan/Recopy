import * as ContextMenu from "@radix-ui/react-context-menu";
import { useTranslation } from "react-i18next";
import { Clipboard, ClipboardPaste, FileText, Star, Trash2 } from "lucide-react";
import type { ClipboardItem } from "../lib/types";
import { pasteItem, copyToClipboard, pasteAsPlainText } from "../lib/paste";
import { useClipboardStore } from "../stores/clipboard-store";
import { useCopyHud } from "./CopyHud";
import { invoke } from "@tauri-apps/api/core";

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
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-lg animate-in fade-in-0 zoom-in-95">
          <ContextMenu.Item
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer text-foreground hover:bg-muted outline-none"
            onSelect={handlePaste}
          >
            <ClipboardPaste size={14} />
            {t("context.paste")}
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer text-foreground hover:bg-muted outline-none"
            onSelect={handlePastePlain}
          >
            <FileText size={14} />
            {t("context.pasteAsPlainText")}
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer text-foreground hover:bg-muted outline-none"
            onSelect={handleCopy}
          >
            <Clipboard size={14} />
            {t("context.copyToClipboard")}
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px my-1 bg-border" />
          <ContextMenu.Item
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer text-foreground hover:bg-muted outline-none"
            onSelect={handleToggleFavorite}
          >
            <Star size={14} />
            {item.is_favorited ? t("context.unfavorite") : t("context.favorite")}
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px my-1 bg-border" />
          <ContextMenu.Item
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer text-destructive hover:bg-destructive/10 outline-none"
            onSelect={handleDelete}
          >
            <Trash2 size={14} />
            {t("context.delete")}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
