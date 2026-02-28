import { create } from "zustand";
import type { Update, DownloadEvent } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  body: string | null;
  progress: number;
  relaunchFailed: boolean;
  _updateRef: Update | null;

  checkForUpdate: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  retryDownload: () => Promise<void>;
  dismissError: () => void;
  relaunch: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  version: null,
  body: null,
  progress: 0,
  relaunchFailed: false,
  _updateRef: null,

  checkForUpdate: async () => {
    const { status } = get();
    // Skip if already in a non-idle actionable state
    if (status === "checking" || status === "downloading" || status === "ready") return;

    const prevStatus = status;
    set({ status: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        // Close previous handle to avoid Tauri backend Resource leak
        get()._updateRef?.close();
        set({
          status: "available",
          version: update.version,
          body: update.body ?? null,
          _updateRef: update,
        });
      } else {
        get()._updateRef?.close();
        set({ status: "idle", _updateRef: null });
      }
    } catch {
      // Plugin not available (App Store build) or network error
      // Don't clobber available/error states on transient failures
      if (prevStatus === "available" || prevStatus === "error") {
        set({ status: prevStatus });
      } else {
        set({ status: "idle", _updateRef: null });
      }
    }
  },

  downloadAndInstall: async () => {
    const update = get()._updateRef;
    if (!update || get().status !== "available") return;

    set({ status: "downloading", progress: 0 });
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
          set({ progress: Math.min(pct, 100) });
        } else if (event.event === "Finished") {
          set({ progress: 100 });
        }
      });

      set({ status: "ready", progress: 100 });
    } catch (e) {
      console.error("Update download failed:", e);
      // Keep _updateRef so retry can reuse it
      set({ status: "error" });
    }
  },

  retryDownload: async () => {
    const update = get()._updateRef;
    if (!update || get().status !== "error") return;
    // Reset to available, then trigger download
    set({ status: "available" });
    get().downloadAndInstall();
  },

  dismissError: () => {
    get()._updateRef?.close();
    set({ status: "idle", _updateRef: null });
  },

  relaunch: async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      console.error("Relaunch failed:", e);
      set({ relaunchFailed: true });
    }
  },
}));
