import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// LRU cache capacity — holds ~200 blob URLs (≈10MB worst case at 50KB/thumbnail)
const LRU_CAPACITY = 200;

// Module-level LRU cache: prevents re-fetching when virtual scroll remounts cards.
// Uses Map insertion order + delete/re-set for LRU promotion.
const thumbnailCache = new Map<string, string>();

/** Promote a key to most-recently-used position. */
function lruGet(key: string): string | undefined {
  const value = thumbnailCache.get(key);
  if (value !== undefined) {
    // Move to end (most recently used)
    thumbnailCache.delete(key);
    thumbnailCache.set(key, value);
  }
  return value;
}

/** Insert into cache, evicting the least-recently-used entry if over capacity. */
function lruSet(key: string, value: string): void {
  // If key already exists, delete first so re-set moves it to the end
  if (thumbnailCache.has(key)) {
    thumbnailCache.delete(key);
  }
  thumbnailCache.set(key, value);

  // Evict oldest entries (at the front of the Map) if over capacity
  while (thumbnailCache.size > LRU_CAPACITY) {
    const oldest = thumbnailCache.keys().next().value!;
    const oldUrl = thumbnailCache.get(oldest)!;
    thumbnailCache.delete(oldest);
    URL.revokeObjectURL(oldUrl);
  }
}

/**
 * Lazily load a thumbnail for a clipboard item.
 * Pass null to skip fetching.
 * Returns an object URL or null while loading.
 *
 * When the first fetch returns null (thumbnail not yet generated, e.g. async
 * file-thumbnail), retries up to 3 times with 500ms intervals.
 */
export function useThumbnail(id: string | null): string | null {
  // Pure read — no LRU promotion during render (React 19 may speculatively render)
  const [url, setUrl] = useState<string | null>(() => (id && thumbnailCache.get(id)) ?? null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (!id) return;

    // Cache hit: promote to most-recently-used (safe in effect, post-commit)
    if (thumbnailCache.has(id)) {
      lruGet(id);
      return;
    }

    let cancelled = false;
    retryRef.current = 0;

    const fetchThumbnail = () => {
      invoke<number[] | null>("get_thumbnail", { id })
        .then((data) => {
          if (cancelled) return;
          if (data && data.length > 0) {
            const bytes = new Uint8Array(data);
            const blob = new Blob([bytes], { type: "image/png" });
            const objectUrl = URL.createObjectURL(blob);
            lruSet(id, objectUrl);
            setUrl(objectUrl);
          } else if (retryRef.current < 3) {
            // Thumbnail not ready yet (async generation), retry after delay
            retryRef.current += 1;
            setTimeout(() => {
              if (!cancelled) fetchThumbnail();
            }, 500);
          }
        })
        .catch((e) => {
          console.error("Failed to load thumbnail:", e);
        });
    };

    fetchThumbnail();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return url;
}

// Exported for testing only
export const __test__ = { thumbnailCache, lruGet, lruSet, LRU_CAPACITY };
