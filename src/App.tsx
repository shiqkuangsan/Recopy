import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Check, Settings } from "lucide-react";
import { BrandLogo } from "./components/BrandLogo";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./components/ui/button";
import { SearchBar } from "./components/SearchBar";
import { TypeFilter } from "./components/TypeFilter";
import { ViewTabs } from "./components/ViewTabs";
import { ClipboardList } from "./components/ClipboardList";
import { SettingsPage } from "./components/SettingsPage";
import { UpdateBanner } from "./components/UpdateBanner";
import { useClipboardStore } from "./stores/clipboard-store";
import { useSettingsStore, type ShowEventPayload } from "./stores/settings-store";
import { useUpdateStore } from "./stores/update-store";
import { useKeyboardNav } from "./hooks/useKeyboardNav";

// Expose update store to devtools console for UI testing
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__updateStore = useUpdateStore;
}
import { PreviewPage } from "./components/PreviewPage";

// Detect page type from URL params
const pageParam = new URLSearchParams(window.location.search).get("page");
const isSettingsPage = pageParam === "settings";
const isHudPage = pageParam === "hud";
const isPreviewPage = pageParam === "preview";

// Interval setting value → milliseconds
// Note: JS timers use 32-bit signed int, max safe delay is 2^31-1 (≈24.8 days).
// Values exceeding this overflow to ~1ms, causing rapid polling.
const MAX_SAFE_INTERVAL = 2_147_483_647;
const CHECK_INTERVALS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: Math.min(30 * 24 * 60 * 60 * 1000, MAX_SAFE_INTERVAL),
};

function MainApp() {
  const fetchItems = useClipboardStore((s) => s.fetchItems);
  const refreshOnChange = useClipboardStore((s) => s.refreshOnChange);
  const onPanelShow = useClipboardStore((s) => s.onPanelShow);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const syncSettingsFromEvent = useSettingsStore((s) => s.syncSettingsFromEvent);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const updateCheckInterval = useSettingsStore((s) => s.settings.update_check_interval);
  const checkForUpdate = useUpdateStore((s) => s.checkForUpdate);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useKeyboardNav();

  // Load settings (theme, etc.) on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Check for updates on startup + periodic interval (wait for settings to load first)
  useEffect(() => {
    if (!settingsLoaded) return;
    const ms = CHECK_INTERVALS[updateCheckInterval];
    if (!ms) return; // "never" → no check at all
    checkForUpdate();
    const timer = setInterval(checkForUpdate, ms);
    return () => clearInterval(timer);
  }, [settingsLoaded, checkForUpdate, updateCheckInterval]);

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
      // Instantly hide any open context menu portals to prevent flash on re-show,
      // then trigger Radix's proper dismiss flow. visibility:hidden keeps animations
      // running so Radix can detect animationend and unmount the Portal cleanly.
      document.querySelectorAll<HTMLElement>('[data-slot="context-menu-content"]').forEach(el => {
        el.style.visibility = "hidden";
      });
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
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
  // Payload carries settings (theme, language) read by Rust from DB — no extra IPC needed.
  useEffect(() => {
    const unlisten = listen<ShowEventPayload>("recopy-show", (event) => {
      void onPanelShow();
      syncSettingsFromEvent(event.payload);

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
  }, [onPanelShow, syncSettingsFromEvent]);

  return (
    <div className="h-screen w-screen flex flex-col">
      <div
        ref={panelRef}
        className="panel-idle w-full h-full text-foreground flex flex-col font-sans overflow-hidden"
      >
        {/* Header — single row, centered */}
        <div className="relative flex items-center justify-center gap-3 px-4 pt-3 pb-2 shrink-0">
          <div className="absolute left-4 flex items-center gap-2">
            <BrandLogo />
            <span className="translate-y-px">
              <UpdateBanner />
            </span>
          </div>
          <ViewTabs />
          <SearchBar />
          <TypeFilter />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => invoke("open_settings_window")}
            className="absolute right-4 text-muted-foreground hover:text-foreground hover:bg-overlay"
          >
            <Settings size={16} />
          </Button>
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
  if (isPreviewPage) return <PreviewPage />;
  if (isHudPage) return <HudApp />;
  if (isSettingsPage) return <SettingsApp />;
  return <MainApp />;
}

export default App;
