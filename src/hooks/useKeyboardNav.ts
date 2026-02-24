import { useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useClipboardStore } from "../stores/clipboard-store";
import { useCopyHud } from "../components/CopyHud";
import { pasteItem, copyToClipboard } from "../lib/paste";
import { dateGroupLabel } from "../lib/time";

export function useKeyboardNav() {
  const items = useClipboardStore((s) => s.items);
  const selectedIndex = useClipboardStore((s) => s.selectedIndex);
  const setSelectedIndex = useClipboardStore((s) => s.setSelectedIndex);

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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
        // All other keys (typing, Left/Right cursor, ArrowUp) go to input naturally
        return;
      }

      // --- Card navigation mode (input NOT focused) ---
      switch (e.key) {
        case "ArrowRight": {
          e.preventDefault();
          setSelectedIndex(Math.min(selectedIndex + 1, items.length - 1));
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          setSelectedIndex(Math.max(selectedIndex - 1, 0));
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
            setSelectedIndex(groupStartIndices[curGroup + 1]);
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
            setSelectedIndex(groupStartIndices[curGrp - 1]);
          } else if (curGrp === 0) {
            // Already at first group — focus search input
            document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (items[selectedIndex]) {
            pasteItem(items[selectedIndex]);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          invoke("hide_window");
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
    [items, selectedIndex, setSelectedIndex, groupStartIndices]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
