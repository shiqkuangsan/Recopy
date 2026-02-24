import { useEffect, useCallback } from "react";
import { useClipboardStore } from "../stores/clipboard-store";
import { useCopyHud } from "../components/CopyHud";
import { pasteItem, copyToClipboard } from "../lib/paste";

export function useKeyboardNav() {
  const items = useClipboardStore((s) => s.items);
  const selectedIndex = useClipboardStore((s) => s.selectedIndex);
  const setSelectedIndex = useClipboardStore((s) => s.setSelectedIndex);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle if user is typing in search (handled by search input)
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT") {
        // Allow arrow keys in search to navigate list
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== "Escape") {
          return;
        }
      }

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

      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight": {
          e.preventDefault();
          const next = Math.min(selectedIndex + 1, items.length - 1);
          setSelectedIndex(next);
          break;
        }
        case "ArrowUp":
        case "ArrowLeft": {
          e.preventDefault();
          const prev = Math.max(selectedIndex - 1, 0);
          setSelectedIndex(prev);
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
          // Blur search input to return keyboard control to card navigation
          const active = document.activeElement as HTMLElement;
          if (active?.tagName === "INPUT") {
            e.preventDefault();
            active.blur();
          }
          break;
        }
        case "c": {
          // Cmd+C (macOS) or Ctrl+C (Windows/Linux) to copy selected item to clipboard
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
    [items, selectedIndex, setSelectedIndex]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
