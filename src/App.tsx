import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Check, Settings } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { SearchBar } from "./components/SearchBar";
import { TypeFilter } from "./components/TypeFilter";
import { ViewTabs } from "./components/ViewTabs";
import { ClipboardList } from "./components/ClipboardList";
import { SettingsPage } from "./components/SettingsPage";
import { useClipboardStore } from "./stores/clipboard-store";
import { useSettingsStore } from "./stores/settings-store";
import { useKeyboardNav } from "./hooks/useKeyboardNav";

// Detect page type from URL params
const pageParam = new URLSearchParams(window.location.search).get("page");
const isSettingsPage = pageParam === "settings";
const isHudPage = pageParam === "hud";

function MainApp() {
  const fetchItems = useClipboardStore((s) => s.fetchItems);
  const refreshOnChange = useClipboardStore((s) => s.refreshOnChange);
  const onPanelShow = useClipboardStore((s) => s.onPanelShow);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useKeyboardNav();

  // Load settings (theme, etc.) on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Initial load
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Listen for clipboard change events from Rust backend
  useEffect(() => {
    const unlisten = listen("clipboard-changed", () => {
      refreshOnChange();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshOnChange]);

  // Reset panel visual state when hidden (blur) so next show starts clean.
  // Use window-scoped listener so other windows (settings) don't trigger this.
  useEffect(() => {
    const currentWindow = getCurrentWebviewWindow();
    const unlisten = currentWindow.listen("tauri://blur", () => {
      const el = panelRef.current;
      if (el) {
        el.classList.remove("panel-enter");
        el.classList.add("panel-idle");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for show event to replay slide-up animation and refresh data.
  useEffect(() => {
    const unlisten = listen("recopy-show", () => {
      void onPanelShow();
      loadSettings(); // Re-read settings (theme, language) in case changed from settings window

      const el = panelRef.current;
      if (el) {
        // Content is already in panel-idle state (set on blur), just start animation
        el.classList.remove("panel-idle");
        el.classList.add("panel-enter");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onPanelShow]);

  return (
    <div className="h-screen w-screen flex flex-col">
      <div
        ref={panelRef}
        className="panel-idle w-full h-full text-foreground flex flex-col font-sans overflow-hidden"
      >
        {/* Header — single row, centered */}
        <div className="relative flex items-center justify-center gap-3 px-4 pt-3 pb-2 shrink-0" data-tauri-drag-region>
          <ViewTabs />
          <SearchBar />
          <TypeFilter />
          <button
            onClick={() => invoke("open_settings_window")}
            className="absolute right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-overlay transition-colors"
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 px-5 pb-1">
          <ClipboardList />
        </div>
      </div>
    </div>
  );
}

function SettingsApp() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return <SettingsPage />;
}

function HudApp() {
  const { t } = useTranslation();
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="flex flex-col items-center justify-center">
        <Check className="text-white drop-shadow-lg" size={52} strokeWidth={2.5} />
        <span className="text-white text-xl font-semibold mt-2 drop-shadow-lg">
          {t("context.copied")}
        </span>
      </div>
    </div>
  );
}

function App() {
  if (isHudPage) return <HudApp />;
  if (isSettingsPage) return <SettingsApp />;
  return <MainApp />;
}

export default App;
