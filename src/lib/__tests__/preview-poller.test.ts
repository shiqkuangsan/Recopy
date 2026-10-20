import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewPoller } from "../preview-poller";

interface Response {
  active: boolean;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("createPreviewPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(fetch: () => Promise<Response>) {
    const onResponse = vi.fn();
    const poller = createPreviewPoller<Response>({
      fetch,
      onResponse,
      shouldContinue: (response) => response.active,
    });
    return { poller, onResponse };
  }

  it("polls on an interval while active", async () => {
    const fetch = vi.fn(() => Promise.resolve({ active: true }));
    const { poller, onResponse } = setup(fetch);
    poller.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(onResponse).toHaveBeenCalledTimes(fetch.mock.calls.length);
    poller.stop();
  });

  it("parks when inactive and makes no further requests until woken", async () => {
    let active = false;
    const fetch = vi.fn(() => Promise.resolve({ active }));
    const { poller } = setup(fetch);
    poller.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);

    active = true;
    poller.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(5);
    poller.stop();
  });

  it("keeps polling when a wake lands during a request that reported inactive", async () => {
    const first = deferred<Response>();
    const fetch = vi
      .fn<() => Promise<Response>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ active: true });
    const { poller } = setup(fetch);
    poller.start();
    poller.wake(); // backend showed the preview while the stale request was in flight
    expect(fetch).toHaveBeenCalledTimes(1);
    first.resolve({ active: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("wakes a pending timer immediately without overlapping requests", async () => {
    const fetch = vi.fn(() => Promise.resolve({ active: true }));
    const { poller } = setup(fetch);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    poller.wake();
    poller.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("retries after a failed request and stops cleanly", async () => {
    const fetch = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error("ipc"))
      .mockResolvedValue({ active: true });
    const { poller, onResponse } = setup(fetch);
    poller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onResponse).toHaveBeenCalledTimes(1);
    poller.stop();
    fetch.mockClear();
    poller.wake();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).not.toHaveBeenCalled();
  });
});
