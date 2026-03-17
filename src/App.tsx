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

  // Dismiss context menus on blur (always needed regardless of close_on_blur setting).
  // Use window-scoped listener so other windows (settings) don't trigger this.
  useEffect(() => {
    const currentWindow = getCurrentWebviewWindow();
    const unlisten = currentWindow.listen("tauri://blur", () => {
      // Instantly hide any open context menu portals to prevent flash on re-show,
      // then trigger Radix's proper dismiss flow. visibility:hidden keeps animations
      // running so Radix can detect animationend and unmount the Portal cleanly.
      document.querySelectorAll<HTMLElement>('[data-slot="context-menu-content"]').forEach((el) => {
        el.style.visibility = "hidden";
      });
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Reset panel visual state when the backend decides to hide the window.
  // This is driven by the "recopy-hide" event from Rust (emitted by hide_main_window),
  // NOT by blur — so close_on_blur=false correctly keeps content visible.
  useEffect(() => {
    const unlisten = listen("recopy-hide", () => {
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

  // Listen for show event to replay entrance animation and refresh data.
  // Payload carries settings (theme, language, panel_position) read by Rust from DB.
  // Animation starts AFTER data fetch + React render + scroll settle to prevent visible jump.
  useEffect(() => {
    const unlisten = listen<ShowEventPayload>("recopy-show", async (event) => {
      syncSettingsFromEvent(event.payload);
      await onPanelShow();

      // Wait for React re-render + useLayoutEffect (scroll) to complete before animating.
      // requestAnimationFrame fires after layout/paint, ensuring scroll has settled.
      requestAnimationFrame(() => {
        const el = panelRef.current;
        if (el) {
          // Set animation direction based on panel position
          const offsets: Record<string, string> = {
            bottom: "translateY(40px)",
            top: "translateY(-40px)",
            left: "translateX(-40px)",
            right: "translateX(40px)",
          };
          const pos = event.payload.panel_position ?? "bottom";
          el.style.setProperty("--panel-offset", offsets[pos] ?? offsets.bottom);

          el.classList.remove("panel-idle");
          el.classList.add("panel-enter");
        }
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onPanelShow, syncSettingsFromEvent]);

  const panelPosition = useSettingsStore((s) => s.settings.panel_position);
  const menuBarHeight = useSettingsStore((s) => s.menuBarHeight);
  const isVertical = panelPosition === "left" || panelPosition === "right";
  const isTop = panelPosition === "top";

  return (
    <div className="h-screen w-screen flex flex-col">
      <div
        ref={panelRef}
        className={`panel-idle w-full h-full text-foreground flex font-sans overflow-hidden ${
          isTop ? "flex-col-reverse" : "flex-col"
        }`}
      >
        {/* Drag handle — visual indicator for resize edge (hidden in left/right mode) */}
        {!isVertical && (
          <div className="shrink-0 flex justify-center pointer-events-none select-none">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mt-0.5 mb-0" />
          </div>
        )}

        {/* Header */}
        {isVertical ? (
          <div className="shrink-0 px-3 pt-2 pb-1 space-y-1.5">
            <div className="flex items-center">
              <BrandLogo />
              <span className="translate-y-px ml-1">
                <UpdateBanner />
              </span>
              <div className="flex-1" />
              <ViewTabs />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => invoke("open_settings_window")}
                className="ml-1 text-muted-foreground hover:text-foreground hover:bg-overlay"
              >
                <Settings size={16} />
              </Button>
            </div>
            <SearchBar />
            <TypeFilter iconOnly />
          </div>
        ) : (
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
        )}

        {/* Content */}
        <div
          className="flex-1 min-h-0 pb-1"
          style={isTop && menuBarHeight > 0 ? { paddingTop: menuBarHeight } : undefined}
        >
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
        <Check className="text-foreground/70 drop-shadow-lg" size={52} strokeWidth={2.5} />
        <span className="text-foreground/70 text-xl font-semibold mt-2 drop-shadow-lg">
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
