import { Star } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useClipboardStore } from "../stores/clipboard-store";

interface FavoriteStarProps {
  itemId: string;
  isFavorited: boolean;
}

export function FavoriteStar({ itemId, isFavorited }: FavoriteStarProps) {
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await invoke("toggle_favorite", { id: itemId });
      const { viewMode } = useClipboardStore.getState();
      if (viewMode === "pins") {
        useClipboardStore.getState().fetchFavorites();
      } else {
        useClipboardStore.getState().fetchItems();
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  if (isFavorited) {
    return (
      <>
        {/* Non-hover: star at right-2 */}
        <button
          onClick={handleClick}
          className="absolute top-1.5 right-2 z-20 flex group-hover:hidden items-center justify-center text-yellow-500 hover:opacity-50 transition-opacity cursor-pointer"
          aria-label="Remove from favorites"
        >
          <Star size={14} fill="currentColor" />
        </button>
        {/* Hover: star shifts left to make room for X */}
        <button
          onClick={handleClick}
          className="absolute top-1.5 right-8 z-20 hidden group-hover:flex items-center justify-center text-yellow-500 hover:opacity-50 transition-opacity cursor-pointer"
          aria-label="Remove from favorites"
        >
          <Star size={14} fill="currentColor" />
        </button>
      </>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="absolute top-1.5 right-8 z-20 hidden group-hover:flex items-center justify-center text-white/70 hover:text-yellow-500 transition-colors cursor-pointer"
      aria-label="Add to favorites"
    >
      <Star size={14} />
    </button>
  );
}
