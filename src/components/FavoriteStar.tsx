import { Star } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useClipboardStore } from "../stores/clipboard-store";

interface FavoriteStarProps {
  itemId: string;
  isFavorited: boolean;
}

export function FavoriteStar({ itemId, isFavorited }: FavoriteStarProps) {
  if (!isFavorited) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await invoke("toggle_favorite", { id: itemId });
      useClipboardStore.getState().fetchItems();
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="text-yellow-500 shrink-0 hover:opacity-50 transition-opacity cursor-pointer"
      aria-label="Remove from favorites"
    >
      <Star size={14} fill="currentColor" />
    </button>
  );
}
