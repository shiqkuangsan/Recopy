export const PREVIEW_POLL_INTERVAL_MS = 100;

declare global {
  interface Window {
    /** Called by the backend (`webview.eval`) right after the preview is shown. */
    __recopyPreviewWake?: () => void;
    /** Called by the backend when the close animation starts (no poll latency). */
    __recopyPreviewClose?: () => void;
  }
}

interface PreviewPollerOptions<T> {
  fetch: () => Promise<T>;
  onResponse: (response: T) => void;
  /** False parks the loop until `wake()`; a hidden preview must not keep polling. */
  shouldContinue: (response: T) => boolean;
  intervalMs?: number;
}

export interface PreviewPoller {
  start: () => void;
  /** Poll now and resume the loop (e.g. the backend just showed the preview). */
  wake: () => void;
  stop: () => void;
}

/**
 * Sequential poll loop: never overlaps requests, parks when the backend reports
 * the preview hidden, and resumes on `wake()`. A wake that lands while a request
 * is in flight wins over that request's "inactive" answer, which may predate the show.
 */
export function createPreviewPoller<T>({
  fetch,
  onResponse,
  shouldContinue,
  intervalMs = PREVIEW_POLL_INTERVAL_MS,
}: PreviewPollerOptions<T>): PreviewPoller {
  let running = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wakeGeneration = 0;

  const poll = async () => {
    timer = undefined;
    inFlight = true;
    const generation = wakeGeneration;
    let keepPolling = true;
    try {
      const response = await fetch();
      if (running) {
        onResponse(response);
        keepPolling = shouldContinue(response) || generation !== wakeGeneration;
      }
    } catch {
      // Retry transient IPC failures without overlapping slow requests.
    } finally {
      inFlight = false;
    }
    if (running && keepPolling) {
      timer = setTimeout(poll, intervalMs);
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      void poll();
    },
    wake() {
      wakeGeneration += 1;
      if (!running || inFlight) return;
      clearTimeout(timer);
      void poll();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
