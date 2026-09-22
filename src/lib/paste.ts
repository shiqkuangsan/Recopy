import { invoke } from "@tauri-apps/api/core";
import type { ClipboardItem } from "./types";
import { useClipboardStore } from "../stores/clipboard-store";
import { useSettingsStore } from "../stores/settings-store";
import { useSearchHistoryStore } from "../stores/search-history-store";

function searchSnapshot() {
  const { searchQuery, panelShowVersion } = useClipboardStore.getState();
  return { searchQuery, panelShowVersion };
}

async function completeSearchUse(snapshot: ReturnType<typeof searchSnapshot>, hidesPanel: boolean) {
  const current = useClipboardStore.getState();
  // Do not reset a new interaction started while the native command was pending.
  if (
    current.searchQuery !== snapshot.searchQuery ||
    current.panelShowVersion !== snapshot.panelShowVersion
  )
    return;
  useSearchHistoryStore.getState().finish();
  if (
    hidesPanel &&
    snapshot.searchQuery.trim() &&
    useSettingsStore.getState().settings.clear_search_after_use === "true"
  ) {
    await current.clearSearch();
  }
}

/**
 * Write clipboard item content back to the system clipboard,
 * then optionally simulate Cmd+V to paste into the frontmost app.
 */
export async function pasteItem(item: ClipboardItem, autoPaste = true): Promise<void> {
  const snapshot = searchSnapshot();
  try {
    await invoke("paste_clipboard_item", {
      id: item.id,
      autoPaste,
    });
    await completeSearchUse(snapshot, autoPaste);
  } catch (e) {
    console.error("Failed to paste item:", e);
  }
}

/**
 * Copy item content to clipboard without pasting.
 */
export async function copyToClipboard(item: ClipboardItem): Promise<void> {
  return pasteItem(item, false);
}

/**
 * Copy exact plain text without pasting or changing window focus.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  const snapshot = searchSnapshot();
  await invoke("copy_text_to_clipboard", { text });
  await completeSearchUse(snapshot, false);
}

/**
 * Paste item as plain text (strip rich formatting).
 */
export async function pasteAsPlainText(item: ClipboardItem): Promise<void> {
  const snapshot = searchSnapshot();
  try {
    await invoke("paste_as_plain_text", {
      id: item.id,
    });
    await completeSearchUse(snapshot, true);
  } catch (e) {
    console.error("Failed to paste as plain text:", e);
  }
}
