import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

const mockedInvoke = vi.mocked(invoke);

let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  createObjectURLMock = vi.fn((blob: Blob) => `blob:mock-url-${blob.size}`);
  revokeObjectURLMock = vi.fn();
  globalThis.URL.createObjectURL = createObjectURLMock;
  globalThis.URL.revokeObjectURL = revokeObjectURLMock;
});

afterEach(() => {
  cleanup();
});

async function importFresh() {
  // Re-import to get a fresh module-level thumbnailCache each time
  vi.resetModules();
  const mod = await import("../useThumbnail");
  return { useThumbnail: mod.useThumbnail, __test__: mod.__test__ };
}

describe("useThumbnail", () => {
  it("should return null initially when no thumbnail cached", async () => {
    const { useThumbnail } = await importFresh();
    const { result } = renderHook(() => useThumbnail("item-1"));

    expect(result.current).toBeNull();
  });

  it("should return null when id is null", async () => {
    const { useThumbnail } = await importFresh();
    const { result } = renderHook(() => useThumbnail(null));

    expect(result.current).toBeNull();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("should call invoke with correct item id", async () => {
    const { useThumbnail } = await importFresh();
    mockedInvoke.mockResolvedValueOnce([1, 2, 3]);

    renderHook(() => useThumbnail("test-id-42"));

    await vi.waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("get_thumbnail", { id: "test-id-42" });
    });
  });

  it("should return object URL after successful fetch", async () => {
    const { useThumbnail } = await importFresh();
    mockedInvoke.mockResolvedValueOnce([1, 2, 3]);

    const { result } = renderHook(() => useThumbnail("item-1"));

    await vi.waitFor(() => {
      expect(result.current).toMatch(/^blob:mock-url/);
    });
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it("should return cached thumbnail URL on subsequent renders", async () => {
    const { useThumbnail } = await importFresh();
    mockedInvoke.mockResolvedValueOnce([1, 2, 3]);

    const { result, unmount } = renderHook(() => useThumbnail("item-1"));
    await vi.waitFor(() => {
      expect(result.current).toMatch(/^blob:mock-url/);
    });
    const cachedUrl = result.current;

    unmount();

    const { result: result2 } = renderHook(() => useThumbnail("item-1"));
    expect(result2.current).toBe(cachedUrl);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("should retry on null response up to 3 times with 500ms intervals", async () => {
    vi.useFakeTimers();
    const { useThumbnail } = await importFresh();

    mockedInvoke
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([10, 20, 30]);

    const { result } = renderHook(() => useThumbnail("retry-id"));

    // First call returns null -> schedules retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Second call returns null -> schedules retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Third call returns data -> success
    await vi.waitFor(() => {
      expect(result.current).toMatch(/^blob:mock-url/);
    });
    expect(mockedInvoke).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("should stop retrying after max attempts", async () => {
    vi.useFakeTimers();
    const { useThumbnail } = await importFresh();

    mockedInvoke.mockResolvedValue(null);

    const { result } = renderHook(() => useThumbnail("exhaust-id"));

    // Initial call (attempt 0) + 3 retries
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }

    // One more interval shouldn't trigger another call
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // 1 initial + 3 retries = 4 total
    expect(mockedInvoke).toHaveBeenCalledTimes(4);
    expect(result.current).toBeNull();

    vi.useRealTimers();
  });

  it("should cancel pending retries on unmount", async () => {
    vi.useFakeTimers();
    const { useThumbnail } = await importFresh();

    mockedInvoke.mockResolvedValue(null);

    const { unmount } = renderHook(() => useThumbnail("cancel-id"));

    // First call triggers, returns null, schedules retry
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockedInvoke).toHaveBeenCalledTimes(2);

    unmount();

    // After unmount, timer fires but cancelled flag prevents further invoke
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockedInvoke).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("should handle invoke rejection gracefully and log error", async () => {
    const { useThumbnail } = await importFresh();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockedInvoke.mockRejectedValueOnce(new Error("backend error"));

    const { result } = renderHook(() => useThumbnail("error-id"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Should remain null — no crash, error logged
    expect(result.current).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("Failed to load thumbnail:", expect.any(Error));
    errorSpy.mockRestore();
  });

  it("should retry on empty array response", async () => {
    vi.useFakeTimers();
    const { useThumbnail } = await importFresh();

    mockedInvoke.mockResolvedValueOnce([]).mockResolvedValueOnce([5, 6, 7]);

    const { result } = renderHook(() => useThumbnail("empty-arr-id"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() => {
      expect(result.current).toMatch(/^blob:mock-url/);
    });
    expect(mockedInvoke).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe("LRU cache", () => {
  it("should evict oldest entry and revokeObjectURL when exceeding capacity", async () => {
    const { __test__ } = await importFresh();
    const { thumbnailCache, lruSet, LRU_CAPACITY } = __test__;

    // Fill cache to capacity
    for (let i = 0; i < LRU_CAPACITY; i++) {
      lruSet(`id-${i}`, `blob:url-${i}`);
    }
    expect(thumbnailCache.size).toBe(LRU_CAPACITY);
    expect(revokeObjectURLMock).not.toHaveBeenCalled();

    // Insert one more — should evict id-0
    lruSet("id-overflow", "blob:url-overflow");
    expect(thumbnailCache.size).toBe(LRU_CAPACITY);
    expect(thumbnailCache.has("id-0")).toBe(false);
    expect(thumbnailCache.has("id-overflow")).toBe(true);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:url-0");
  });

  it("should promote accessed entries to avoid eviction", async () => {
    const { __test__ } = await importFresh();
    const { thumbnailCache, lruGet, lruSet, LRU_CAPACITY } = __test__;

    // Fill cache to capacity
    for (let i = 0; i < LRU_CAPACITY; i++) {
      lruSet(`id-${i}`, `blob:url-${i}`);
    }

    // Access id-0 to promote it
    const val = lruGet("id-0");
    expect(val).toBe("blob:url-0");

    // Insert one more — should evict id-1 (now the oldest), not id-0
    lruSet("id-new", "blob:url-new");
    expect(thumbnailCache.has("id-0")).toBe(true);
    expect(thumbnailCache.has("id-1")).toBe(false);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:url-1");
  });

  it("should return undefined for cache miss in lruGet", async () => {
    const { __test__ } = await importFresh();
    const { lruGet } = __test__;

    expect(lruGet("nonexistent")).toBeUndefined();
  });

  it("should update existing key without increasing size", async () => {
    const { __test__ } = await importFresh();
    const { thumbnailCache, lruSet } = __test__;

    lruSet("id-a", "blob:url-a-1");
    lruSet("id-b", "blob:url-b");
    lruSet("id-a", "blob:url-a-2"); // update existing

    expect(thumbnailCache.size).toBe(2);
    expect(thumbnailCache.get("id-a")).toBe("blob:url-a-2");
    // No revoke — we're updating, not evicting due to capacity
    expect(revokeObjectURLMock).not.toHaveBeenCalled();
  });
});
