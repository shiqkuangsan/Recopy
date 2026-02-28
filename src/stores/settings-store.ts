import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart } from "@tauri-apps/plugin-autostart";
import i18n from "../i18n";

export type Theme = "dark" | "light" | "system";

export interface Settings {
  shortcut: string;
  auto_start: string;
  theme: Theme;
  language: string;
  retention_policy: string;
  retention_days: string;
  retention_count: string;
  max_item_size_mb: string;
  close_on_blur: string;
  update_check_interval: string;
}

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
};

export interface ShowEventPayload {
  theme?: string;
  language?: string;
  update_check_interval?: string;
}

interface SettingsState {
  settings: Settings;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  updateSetting: (key: keyof Settings, value: string) => Promise<void>;
  syncSettingsFromEvent: (payload: ShowEventPayload) => void;
  clearHistory: () => Promise<number>;
  runRetentionCleanup: () => Promise<number>;
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    html.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    html.setAttribute("data-theme", theme);
  }
}

function applyLanguage(language: string) {
  if (language === "system") {
    // Detect browser/system language
    const browserLang = navigator.language.startsWith("zh") ? "zh" : "en";
    i18n.changeLanguage(browserLang);
  } else {
    i18n.changeLanguage(language);
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,

  loadSettings: async () => {
    try {
      const raw = await invoke<Record<string, string>>("get_settings");
      const settings: Settings = {
        shortcut: raw.shortcut ?? DEFAULT_SETTINGS.shortcut,
        auto_start: raw.auto_start ?? DEFAULT_SETTINGS.auto_start,
        theme: (raw.theme as Theme) ?? DEFAULT_SETTINGS.theme,
        language: raw.language ?? DEFAULT_SETTINGS.language,
        retention_policy:
          raw.retention_policy ?? DEFAULT_SETTINGS.retention_policy,
        retention_days: raw.retention_days ?? DEFAULT_SETTINGS.retention_days,
        retention_count:
          raw.retention_count ?? DEFAULT_SETTINGS.retention_count,
        max_item_size_mb:
          raw.max_item_size_mb ?? DEFAULT_SETTINGS.max_item_size_mb,
        close_on_blur: raw.close_on_blur ?? DEFAULT_SETTINGS.close_on_blur,
        update_check_interval:
          raw.update_check_interval ?? DEFAULT_SETTINGS.update_check_interval,
      };
      set({ settings, loaded: true });
      applyTheme(settings.theme);
      applyLanguage(settings.language);
    } catch (e) {
      console.error("Failed to load settings:", e);
      set({ loaded: true });
      applyTheme(DEFAULT_SETTINGS.theme);
      applyLanguage(DEFAULT_SETTINGS.language);
    }
  },

  updateSetting: async (key: keyof Settings, value: string) => {
    try {
      await invoke("set_setting", { key, value });
      set((state) => ({
        settings: { ...state.settings, [key]: value },
      }));

      // Apply theme immediately if changed
      if (key === "theme") {
        applyTheme(value as Theme);
      }
      if (key === "language") {
        applyLanguage(value);
      }
      if (key === "auto_start") {
        try {
          if (value === "true") {
            await enableAutostart();
          } else {
            await disableAutostart();
          }
        } catch (err) {
          console.error("Failed to toggle autostart:", err);
        }
      }
    } catch (e) {
      console.error("Failed to update setting:", e);
    }
  },

  syncSettingsFromEvent: (payload: ShowEventPayload) => {
    const { theme, language, update_check_interval } = payload;
    if (theme) {
      applyTheme(theme as Theme);
      set((state) => ({
        settings: { ...state.settings, theme: theme as Theme },
      }));
    }
    if (language) {
      applyLanguage(language);
      set((state) => ({
        settings: { ...state.settings, language },
      }));
    }
    if (update_check_interval) {
      set((state) => ({
        settings: { ...state.settings, update_check_interval },
      }));
    }
  },

  clearHistory: async () => {
    try {
      const count = await invoke<number>("clear_history");
      return count;
    } catch (e) {
      console.error("Failed to clear history:", e);
      return 0;
    }
  },

  runRetentionCleanup: async () => {
    try {
      const count = await invoke<number>("run_retention_cleanup");
      return count;
    } catch (e) {
      console.error("Failed to run retention cleanup:", e);
      return 0;
    }
  },
}));

// Listen for system theme changes when theme is "system"
if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const { settings } = useSettingsStore.getState();
      if (settings.theme === "system") {
        applyTheme("system");
      }
    });

  // Listen for system language changes when language is "system"
  window.addEventListener("languagechange", () => {
    const { settings } = useSettingsStore.getState();
    if (settings.language === "system") {
      applyLanguage("system");
    }
  });

}
