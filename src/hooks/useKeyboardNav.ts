import { useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useClipboardStore } from "../stores/clipboard-store";
import { useCopyHud } from "../components/CopyHud";
import { pasteItem, copyToClipboard } from "../lib/paste";
import { dateGroupLabel } from "../lib/time";

export function useKeyboardNav() {
  const items = useClipboardStore((s) => s.items);
  const selectedIndex = useClipboardStore((s) => s.selectedIndex);
  const setSelectedIndex = useClipboardStore((s) => s.setSelectedIndex);
  const previewOpenRef = useRef(false);

  // Compute the first flat-index of each date group for up/down navigation.
  const groupStartIndices = useMemo(() => {
    const starts: number[] = [];
    let lastLabel = "";
    items.forEach((item, i) => {
      const label = dateGroupLabel(item.updated_at);
      if (label !== lastLabel) {
        starts.push(i);
        lastLabel = label;
      }
    });
    return starts;
  }, [items]);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const openPreview = useCallback((id: string) => {
    previewOpenRef.current = true;
    invoke("show_preview_window", { id });
  }, []);

  const closePreview = useCallback(() => {
    previewOpenRef.current = false;
    invoke("hide_preview_window");
  }, []);

  const updatePreview = useCallback((id: string) => {
    invoke("show_preview_window", { id });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip all keyboard shortcuts during IME composition (e.g. Chinese input)
      if (e.isComposing || e.keyCode === 229) return;

      const target = e.target as HTMLElement;
      const isInInput = target.tagName === "INPUT";

      // Prevent Tab from cycling focus between UI elements
      if (e.key === "Tab") {
        e.preventDefault();
        return;
      }

      // Cmd+F / Ctrl+F to focus search input
      if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[type="text"]');
        input?.focus();
        return;
      }

      // Cmd+, to open settings
      if (e.key === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        invoke("open_settings_window");
        return;
      }

      // --- Input focused: only intercept keys that exit input ---
      if (isInInput) {
        if (e.key === "ArrowDown" || e.key === "Escape") {
          e.preventDefault();
          (target as HTMLElement).blur();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (items[selectedIndex]) {
            pasteItem(items[selectedIndex]);
          }
          return;
        }
        // All other keys (typing, Space, Left/Right cursor, ArrowUp) go to input naturally
        return;
      }

      // --- Card navigation mode (input NOT focused) ---

      // Space: toggle preview
      if (e.key === " ") {
        e.preventDefault();
        if (previewOpenRef.current) {
          closePreview();
        } else if (items[selectedIndex]) {
          openPreview(items[selectedIndex].id);
        }
        return;
      }

      // Escape: close preview first, then hide window
      if (e.key === "Escape") {
        e.preventDefault();
        if (previewOpenRef.current) {
          closePreview();
        } else {
          invoke("hide_window");
        }
        return;
      }

      // Enter: block while preview is open, otherwise paste
      if (e.key === "Enter") {
        e.preventDefault();
        if (!previewOpenRef.current && items[selectedIndex]) {
          pasteItem(items[selectedIndex]);
        }
        return;
      }

      switch (e.key) {
        case "ArrowRight": {
          e.preventDefault();
          const newIdx = Math.min(selectedIndex + 1, items.length - 1);
          setSelectedIndex(newIdx);
          if (previewOpenRef.current && items[newIdx]) {
            updatePreview(items[newIdx].id);
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const newIdx = Math.max(selectedIndex - 1, 0);
          setSelectedIndex(newIdx);
          if (previewOpenRef.current && items[newIdx]) {
            updatePreview(items[newIdx].id);
          }
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          // Jump to the first item of the next date group
          const curGroup = groupStartIndices.findIndex((start, i) => {
            const nextStart = groupStartIndices[i + 1] ?? items.length;
            return selectedIndex >= start && selectedIndex < nextStart;
          });
          if (curGroup >= 0 && curGroup < groupStartIndices.length - 1) {
            const newIdx = groupStartIndices[curGroup + 1];
            setSelectedIndex(newIdx);
            if (previewOpenRef.current && items[newIdx]) {
              updatePreview(items[newIdx].id);
            }
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          // Jump to the first item of the previous date group
          const curGrp = groupStartIndices.findIndex((start, i) => {
            const nextStart = groupStartIndices[i + 1] ?? items.length;
            return selectedIndex >= start && selectedIndex < nextStart;
          });
          if (curGrp > 0) {
            const newIdx = groupStartIndices[curGrp - 1];
            setSelectedIndex(newIdx);
            if (previewOpenRef.current && items[newIdx]) {
              updatePreview(items[newIdx].id);
            }
          } else if (curGrp === 0) {
            // Already at first group — focus search input
            document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
          }
          break;
        }
        case "c": {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (items[selectedIndex]) {
              copyToClipboard(items[selectedIndex]).then(() => {
                useCopyHud.getState().show();
              });
            }
          }
          break;
        }
      }
    },
    [items, selectedIndex, setSelectedIndex, groupStartIndices, openPreview, closePreview, updatePreview]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Reset preview state when panel hides (blur)
  useEffect(() => {
    const unlisten = listen("tauri://blur", () => {
      previewOpenRef.current = false;
    });
    return () => {
      unlisten.then((fn) => fn());
      previewOpenRef.current = false;
    };
  }, []);
}
