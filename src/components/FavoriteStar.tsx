import { Star } from "lucide-react";
import { useClipboardStore } from "../stores/clipboard-store";

interface FavoriteStarProps {
  itemId: string;
  isFavorited: boolean;
}

export function FavoriteStar({ itemId, isFavorited }: FavoriteStarProps) {
  const toggleFavorite = useClipboardStore((s) => s.toggleFavorite);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite(itemId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex size-6 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ${isFavorited ? "text-yellow-500" : "text-muted-foreground hover:text-foreground"}`}
      aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
      title={isFavorited ? "Remove from favorites" : "Add to favorites"}
    >
      <Star size={14} fill={isFavorited ? "currentColor" : "none"} />
    </button>
  );
}
