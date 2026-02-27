import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// Module-level cache: prevents re-fetching when virtual scroll remounts cards
const thumbnailCache = new Map<string, string>();

/**
 * Lazily load a thumbnail for a clipboard item.
 * Pass null to skip fetching.
 * Returns an object URL or null while loading.
 *
 * When the first fetch returns null (thumbnail not yet generated, e.g. async
 * file-thumbnail), retries up to 3 times with 500ms intervals.
 */
export function useThumbnail(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(
    () => (id && thumbnailCache.get(id)) ?? null,
  );
  const retryRef = useRef(0);

  useEffect(() => {
    if (!id) return;

    if (thumbnailCache.has(id)) {
      setUrl(thumbnailCache.get(id)!);
      return;
    }

    let cancelled = false;
    retryRef.current = 0;

    const fetchThumbnail = () => {
      invoke<number[] | null>("get_thumbnail", { id }).then((data) => {
        if (cancelled) return;
        if (data && data.length > 0) {
          const bytes = new Uint8Array(data);
          const blob = new Blob([bytes], { type: "image/png" });
          const objectUrl = URL.createObjectURL(blob);
          thumbnailCache.set(id, objectUrl);
          setUrl(objectUrl);
        } else if (retryRef.current < 3) {
          // Thumbnail not ready yet (async generation), retry after delay
          retryRef.current += 1;
          setTimeout(() => { if (!cancelled) fetchThumbnail(); }, 500);
        }
      });
    };

    fetchThumbnail();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return url;
}
