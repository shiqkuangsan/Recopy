import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../../i18n";

// Must mock matchMedia before importing the store (module-level code uses it)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: vi.fn(() => Promise.resolve()),
  disable: vi.fn(() => Promise.resolve()),
  isEnabled: vi.fn(() => Promise.resolve(true)),
}));

// Import store AFTER matchMedia is mocked
const { useSettingsStore } = await import("../settings-store");
type Settings = import("../settings-store").Settings;
type ShowEventPayload = import("../settings-store").ShowEventPayload;

const mockedInvoke = vi.mocked(invoke);

const DEFAULT_SETTINGS: Settings = {
  shortcut: "CommandOrControl+Shift+V",
  auto_start: "false",
  theme: "system",
  language: "system",
  retention_policy: "unlimited",
  retention_days: "0",
  retention_count: "0",
  max_item_size_mb: "10",
  close_on_blur: "true",
  update_check_interval: "weekly",
  panel_position: "bottom",
  flat_mode_tb: "false",
  show_tray_icon: "true",
};

describe("useSettingsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      loaded: false,
    });
    document.documentElement.removeAttribute("data-theme");
  });

  it("should have correct initial state", () => {
    const state = useSettingsStore.getState();
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    expect(state.loaded).toBe(false);
  });

  describe("loadSettings", () => {
    it("should load settings from backend and update state", async () => {
      const raw: Record<string, string> = {
        shortcut: "Ctrl+V",
        auto_start: "true",
        theme: "dark",
        language: "zh",
        retention_policy: "days",
        retention_days: "30",
        retention_count: "1000",
        max_item_size_mb: "50",
        close_on_blur: "false",
        update_check_interval: "daily",
        panel_position: "left",
        flat_mode_tb: "true",
      };
      mockedInvoke.mockResolvedValueOnce(raw);

      await useSettingsStore.getState().loadSettings();

      expect(mockedInvoke).toHaveBeenCalledWith("get_settings");
      const state = useSettingsStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.settings.shortcut).toBe("Ctrl+V");
      expect(state.settings.theme).toBe("dark");
      expect(state.settings.language).toBe("zh");
      expect(state.settings.panel_position).toBe("left");
      expect(state.settings.flat_mode_tb).toBe("true");
    });

    it("should fall back to defaults for missing keys", async () => {
      mockedInvoke.mockResolvedValueOnce({ theme: "light" });

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.settings.shortcut).toBe(DEFAULT_SETTINGS.shortcut);
      expect(state.settings.theme).toBe("light");
      expect(state.settings.language).toBe(DEFAULT_SETTINGS.language);
    });

    it("should set loaded to true on failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("db error"));

      await useSettingsStore.getState().loadSettings();

      const state = useSettingsStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
    });

    it("should apply theme after loading", async () => {
      mockedInvoke.mockResolvedValueOnce({ theme: "dark" });

      await useSettingsStore.getState().loadSettings();

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("should apply language after loading", async () => {
      const spy = vi.spyOn(i18n, "changeLanguage");
      mockedInvoke.mockResolvedValueOnce({ language: "zh" });

      await useSettingsStore.getState().loadSettings();

      expect(spy).toHaveBeenCalledWith("zh");
      spy.mockRestore();
    });

    it("should apply default theme and language on failure", async () => {
      const spy = vi.spyOn(i18n, "changeLanguage");
      mockedInvoke.mockRejectedValueOnce(new Error("fail"));

      await useSettingsStore.getState().loadSettings();

      expect(document.documentElement.getAttribute("data-theme")).toBeTruthy();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("updateSetting", () => {
    it("should call invoke with correct args and update local state", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useSettingsStore.getState().updateSetting("shortcut", "Ctrl+C");

      expect(mockedInvoke).toHaveBeenCalledWith("set_setting", {
        key: "shortcut",
        value: "Ctrl+C",
      });
      expect(useSettingsStore.getState().settings.shortcut).toBe("Ctrl+C");
    });

    it("should apply theme when updating theme setting", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useSettingsStore.getState().updateSetting("theme", "light");

      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("should apply language when updating language setting", async () => {
      const spy = vi.spyOn(i18n, "changeLanguage");
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useSettingsStore.getState().updateSetting("language", "en");

      expect(spy).toHaveBeenCalledWith("en");
      spy.mockRestore();
    });

    it("should enable autostart when auto_start set to true", async () => {
      const { enable } = await import("@tauri-apps/plugin-autostart");
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useSettingsStore.getState().updateSetting("auto_start", "true");

      expect(enable).toHaveBeenCalled();
      expect(mockedInvoke).toHaveBeenCalledWith("set_setting", {
        key: "auto_start",
        value: "true",
      });
      expect(useSettingsStore.getState().settings.auto_start).toBe("true");
    });

    it("should disable autostart when auto_start set to false", async () => {
      const { disable } = await import("@tauri-apps/plugin-autostart");
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useSettingsStore.getState().updateSetting("auto_start", "false");

      expect(disable).toHaveBeenCalled();
      expect(useSettingsStore.getState().settings.auto_start).toBe("false");
    });

    it("should not update DB or UI when autostart plugin fails", async () => {
      const { enable } = await import("@tauri-apps/plugin-autostart");
      vi.mocked(enable).mockRejectedValueOnce(new Error("registry error"));

      await useSettingsStore.getState().updateSetting("auto_start", "true");

      expect(mockedInvoke).not.toHaveBeenCalledWith("set_setting", {
        key: "auto_start",
        value: "true",
      });
      expect(useSettingsStore.getState().settings.auto_start).toBe("false");
    });

    it("should not throw when invoke rejects", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("fail"));

      await expect(
        useSettingsStore.getState().updateSetting("shortcut", "X"),
      ).resolves.toBeUndefined();
    });
  });

  describe("applyTheme", () => {
    it("should set data-theme to dark", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useSettingsStore.getState().updateSetting("theme", "dark");

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("should set data-theme to light", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useSettingsStore.getState().updateSetting("theme", "light");

      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("should resolve system theme based on matchMedia", async () => {
      const mockMatchMedia = vi.fn().mockReturnValue({ matches: true });
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });
      mockedInvoke.mockResolvedValueOnce({ theme: "system" });

      await useSettingsStore.getState().loadSettings();

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  describe("applyLanguage", () => {
    it("should detect browser language for system setting", async () => {
      const spy = vi.spyOn(i18n, "changeLanguage");
      mockedInvoke.mockResolvedValueOnce({ language: "system" });

      await useSettingsStore.getState().loadSettings();

      expect(spy).toHaveBeenCalled();
      const calledWith = spy.mock.calls[0][0];
      expect(["en", "zh"]).toContain(calledWith);
      spy.mockRestore();
    });

    it("should use exact language code for non-system setting", async () => {
      const spy = vi.spyOn(i18n, "changeLanguage");
      mockedInvoke.mockResolvedValueOnce({ language: "en" });

      await useSettingsStore.getState().loadSettings();

      expect(spy).toHaveBeenCalledWith("en");
      spy.mockRestore();
    });
  });

  describe("syncSettingsFromEvent", () => {
    it("should sync theme from event payload", () => {
      const payload: ShowEventPayload = { theme: "dark" };
      useSettingsStore.getState().syncSettingsFromEvent(payload);

      expect(useSettingsStore.getState().settings.theme).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("should sync language from event payload", () => {
      const spy = vi.spyOn(i18n, "changeLanguage");
      const payload: ShowEventPayload = { language: "zh" };
      useSettingsStore.getState().syncSettingsFromEvent(payload);

      expect(useSettingsStore.getState().settings.language).toBe("zh");
      expect(spy).toHaveBeenCalledWith("zh");
      spy.mockRestore();
    });

    it("should sync update_check_interval from event payload", () => {
      const payload: ShowEventPayload = { update_check_interval: "daily" };
      useSettingsStore.getState().syncSettingsFromEvent(payload);

      expect(useSettingsStore.getState().settings.update_check_interval).toBe("daily");
    });

    it("should sync panel_position from event payload", () => {
      const payload: ShowEventPayload = { panel_position: "right" };
      useSettingsStore.getState().syncSettingsFromEvent(payload);

      expect(useSettingsStore.getState().settings.panel_position).toBe("right");
    });

    it("should sync flat_mode_tb from event payload", () => {
      const payload: ShowEventPayload = { flat_mode_tb: "true" };
      useSettingsStore.getState().syncSettingsFromEvent(payload);

      expect(useSettingsStore.getState().settings.flat_mode_tb).toBe("true");
    });

    it("should not modify unrelated settings", () => {
      const payload: ShowEventPayload = { theme: "light" };
      useSettingsStore.getState().syncSettingsFromEvent(payload);

      expect(useSettingsStore.getState().settings.shortcut).toBe(DEFAULT_SETTINGS.shortcut);
      expect(useSettingsStore.getState().settings.language).toBe(DEFAULT_SETTINGS.language);
    });

    it("should handle empty payload without changes", () => {
      const before = { ...useSettingsStore.getState().settings };
      useSettingsStore.getState().syncSettingsFromEvent({});

      expect(useSettingsStore.getState().settings).toEqual(before);
    });
  });

  describe("clearHistory", () => {
    it("should invoke clear_history and return count", async () => {
      mockedInvoke.mockResolvedValueOnce(42);

      const count = await useSettingsStore.getState().clearHistory();

      expect(mockedInvoke).toHaveBeenCalledWith("clear_history");
      expect(count).toBe(42);
    });

    it("should return 0 on failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("fail"));

      const count = await useSettingsStore.getState().clearHistory();

      expect(count).toBe(0);
    });
  });

  describe("runRetentionCleanup", () => {
    it("should invoke run_retention_cleanup and return count", async () => {
      mockedInvoke.mockResolvedValueOnce(15);

      const count = await useSettingsStore.getState().runRetentionCleanup();

      expect(mockedInvoke).toHaveBeenCalledWith("run_retention_cleanup");
      expect(count).toBe(15);
    });

    it("should return 0 on failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("fail"));

      const count = await useSettingsStore.getState().runRetentionCleanup();

      expect(count).toBe(0);
    });
  });
});
