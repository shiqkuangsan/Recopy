import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUpdateStore } from "../update-store";
import type { UpdateStatus } from "../update-store";
import type { Update, DownloadEvent } from "@tauri-apps/plugin-updater";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

function mockUpdate(overrides: Partial<Update> = {}): Update {
  return {
    version: "2.0.0",
    body: "New features and bug fixes",
    date: "2026-03-01",
    currentVersion: "1.3.1",
    downloadAndInstall: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
    ...overrides,
  } as unknown as Update;
}

describe("useUpdateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateStore.setState({
      status: "idle",
      version: null,
      body: null,
      progress: 0,
      relaunchFailed: false,
      _updateRef: null,
    });
  });

  it("should have correct initial state", () => {
    const state = useUpdateStore.getState();
    expect(state.status).toBe("idle");
    expect(state.version).toBeNull();
    expect(state.body).toBeNull();
    expect(state.progress).toBe(0);
    expect(state.relaunchFailed).toBe(false);
    expect(state._updateRef).toBeNull();
  });

  describe("checkForUpdate", () => {
    it("should transition idle -> checking -> available when update exists", async () => {
      const update = mockUpdate();
      const { check } = await import("@tauri-apps/plugin-updater");
      vi.mocked(check).mockResolvedValueOnce(update);

      const statusHistory: UpdateStatus[] = [];
      const unsub = useUpdateStore.subscribe((state) => {
        statusHistory.push(state.status);
      });

      await useUpdateStore.getState().checkForUpdate();
      unsub();

      expect(statusHistory).toContain("checking");
      const state = useUpdateStore.getState();
      expect(state.status).toBe("available");
      expect(state.version).toBe("2.0.0");
      expect(state.body).toBe("New features and bug fixes");
      expect(state._updateRef).toBe(update);
    });

    it("should transition idle -> checking -> idle when no update", async () => {
      const { check } = await import("@tauri-apps/plugin-updater");
      vi.mocked(check).mockResolvedValueOnce(null);

      await useUpdateStore.getState().checkForUpdate();

      expect(useUpdateStore.getState().status).toBe("idle");
      expect(useUpdateStore.getState()._updateRef).toBeNull();
    });

    it("should skip when status is checking", async () => {
      useUpdateStore.setState({ status: "checking" });
      const { check } = await import("@tauri-apps/plugin-updater");

      await useUpdateStore.getState().checkForUpdate();

      expect(check).not.toHaveBeenCalled();
    });

    it("should skip when status is downloading", async () => {
      useUpdateStore.setState({ status: "downloading" });
      const { check } = await import("@tauri-apps/plugin-updater");

      await useUpdateStore.getState().checkForUpdate();

      expect(check).not.toHaveBeenCalled();
    });

    it("should skip when status is ready", async () => {
      useUpdateStore.setState({ status: "ready" });
      const { check } = await import("@tauri-apps/plugin-updater");

      await useUpdateStore.getState().checkForUpdate();

      expect(check).not.toHaveBeenCalled();
    });

    it("should close previous update ref when new update found", async () => {
      const oldUpdate = mockUpdate({ version: "1.9.0" });
      useUpdateStore.setState({ _updateRef: oldUpdate, status: "idle" });
      const newUpdate = mockUpdate({ version: "2.0.0" });
      const { check } = await import("@tauri-apps/plugin-updater");
      vi.mocked(check).mockResolvedValueOnce(newUpdate);

      await useUpdateStore.getState().checkForUpdate();

      expect(oldUpdate.close).toHaveBeenCalled();
    });

    it("should close update ref when no update found", async () => {
      const oldUpdate = mockUpdate();
      useUpdateStore.setState({ _updateRef: oldUpdate, status: "idle" });
      const { check } = await import("@tauri-apps/plugin-updater");
      vi.mocked(check).mockResolvedValueOnce(null);

      await useUpdateStore.getState().checkForUpdate();

      expect(oldUpdate.close).toHaveBeenCalled();
      expect(useUpdateStore.getState()._updateRef).toBeNull();
    });

    it("should restore previous status on error from available state", async () => {
      useUpdateStore.setState({ status: "available" });
      const { check } = await import("@tauri-apps/plugin-updater");
      vi.mocked(check).mockRejectedValueOnce(new Error("network"));

      await useUpdateStore.getState().checkForUpdate();

      expect(useUpdateStore.getState().status).toBe("available");
    });

    it("should restore previous status on error from error state", async () => {
      useUpdateStore.setState({ status: "error" });
      const { check } = await import("@tauri-apps/plugin-updater");
      vi.mocked(check).mockRejectedValueOnce(new Error("network"));

      await useUpdateStore.getState().checkForUpdate();

      expect(useUpdateStore.getState().status).toBe("error");
    });

    it("should fall back to idle on error from idle state", async () => {
      const { check } = await import("@tauri-apps/plugin-updater");
      vi.mocked(check).mockRejectedValueOnce(new Error("network"));

      await useUpdateStore.getState().checkForUpdate();

      expect(useUpdateStore.getState().status).toBe("idle");
      expect(useUpdateStore.getState()._updateRef).toBeNull();
    });

    it("should handle update with null body", async () => {
      const update = mockUpdate({ body: undefined });
      const { check } = await import("@tauri-apps/plugin-updater");
      vi.mocked(check).mockResolvedValueOnce(update);

      await useUpdateStore.getState().checkForUpdate();

      expect(useUpdateStore.getState().body).toBeNull();
    });
  });

  describe("downloadAndInstall", () => {
    it("should do nothing without an update ref", async () => {
      useUpdateStore.setState({ status: "available", _updateRef: null });

      await useUpdateStore.getState().downloadAndInstall();

      expect(useUpdateStore.getState().status).toBe("available");
    });

    it("should do nothing when status is not available", async () => {
      const update = mockUpdate();
      useUpdateStore.setState({ status: "idle", _updateRef: update });

      await useUpdateStore.getState().downloadAndInstall();

      expect(update.downloadAndInstall).not.toHaveBeenCalled();
    });

    it("should track progress through download events", async () => {
      let eventCallback: ((event: DownloadEvent) => void) | undefined;
      const update = mockUpdate({
        downloadAndInstall: vi.fn((cb) => {
          eventCallback = cb as (event: DownloadEvent) => void;
          eventCallback({ event: "Started", data: { contentLength: 1000 } });
          eventCallback({ event: "Progress", data: { chunkLength: 500 } });
          eventCallback({ event: "Progress", data: { chunkLength: 300 } });
          eventCallback({ event: "Finished" });
          return Promise.resolve();
        }),
      });
      useUpdateStore.setState({ status: "available", _updateRef: update });

      await useUpdateStore.getState().downloadAndInstall();

      expect(useUpdateStore.getState().status).toBe("ready");
      expect(useUpdateStore.getState().progress).toBe(100);
    });

    it("should transition to error status on download failure", async () => {
      const update = mockUpdate({
        downloadAndInstall: vi.fn(() => Promise.reject(new Error("download failed"))),
      });
      useUpdateStore.setState({ status: "available", _updateRef: update });

      await useUpdateStore.getState().downloadAndInstall();

      expect(useUpdateStore.getState().status).toBe("error");
      expect(useUpdateStore.getState()._updateRef).toBe(update);
    });

    it("should set progress to 0 when contentLength is 0", async () => {
      const progressValues: number[] = [];
      const update = mockUpdate({
        downloadAndInstall: vi.fn((cb) => {
          const callback = cb as (event: DownloadEvent) => void;
          callback({ event: "Started", data: { contentLength: 0 } });
          callback({ event: "Progress", data: { chunkLength: 500 } });
          progressValues.push(useUpdateStore.getState().progress);
          callback({ event: "Finished" });
          return Promise.resolve();
        }),
      });
      useUpdateStore.setState({ status: "available", _updateRef: update });

      await useUpdateStore.getState().downloadAndInstall();

      expect(progressValues[0]).toBe(0);
    });

    it("should cap progress at 100", async () => {
      const update = mockUpdate({
        downloadAndInstall: vi.fn((cb) => {
          const callback = cb as (event: DownloadEvent) => void;
          callback({ event: "Started", data: { contentLength: 100 } });
          callback({ event: "Progress", data: { chunkLength: 150 } });
          return Promise.resolve();
        }),
      });
      useUpdateStore.setState({ status: "available", _updateRef: update });

      await useUpdateStore.getState().downloadAndInstall();

      expect(useUpdateStore.getState().progress).toBeLessThanOrEqual(100);
    });
  });

  describe("retryDownload", () => {
    it("should do nothing without an update ref", async () => {
      useUpdateStore.setState({ status: "error", _updateRef: null });

      await useUpdateStore.getState().retryDownload();

      expect(useUpdateStore.getState().status).toBe("error");
    });

    it("should do nothing when status is not error", async () => {
      const update = mockUpdate();
      useUpdateStore.setState({ status: "available", _updateRef: update });

      await useUpdateStore.getState().retryDownload();

      expect(useUpdateStore.getState().status).toBe("available");
    });

    it("should reset to available and trigger download", async () => {
      const update = mockUpdate({
        downloadAndInstall: vi.fn(() => Promise.resolve()),
      });
      useUpdateStore.setState({ status: "error", _updateRef: update });

      await useUpdateStore.getState().retryDownload();

      expect(update.downloadAndInstall).toHaveBeenCalled();
    });
  });

  describe("dismissError", () => {
    it("should close update ref and reset to idle", () => {
      const update = mockUpdate();
      useUpdateStore.setState({ status: "error", _updateRef: update });

      useUpdateStore.getState().dismissError();

      expect(update.close).toHaveBeenCalled();
      expect(useUpdateStore.getState().status).toBe("idle");
      expect(useUpdateStore.getState()._updateRef).toBeNull();
    });

    it("should handle null update ref gracefully", () => {
      useUpdateStore.setState({ status: "error", _updateRef: null });

      useUpdateStore.getState().dismissError();

      expect(useUpdateStore.getState().status).toBe("idle");
    });
  });

  describe("relaunch", () => {
    it("should call relaunch from plugin-process", async () => {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      vi.mocked(relaunch).mockResolvedValueOnce(undefined);

      await useUpdateStore.getState().relaunch();

      expect(relaunch).toHaveBeenCalled();
      expect(useUpdateStore.getState().relaunchFailed).toBe(false);
    });

    it("should set relaunchFailed on failure", async () => {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      vi.mocked(relaunch).mockRejectedValueOnce(new Error("failed"));

      await useUpdateStore.getState().relaunch();

      expect(useUpdateStore.getState().relaunchFailed).toBe(true);
    });
  });
});
