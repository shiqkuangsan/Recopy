import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { SearchBar } from "./components/SearchBar";
import { TypeFilter } from "./components/TypeFilter";
import { ViewTabs } from "./components/ViewTabs";
import { ClipboardList } from "./components/ClipboardList";
import { SettingsPage } from "./components/SettingsPage";
import { useClipboardStore } from "./stores/clipboard-store";
import { useSettingsStore } from "./stores/settings-store";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { CopyHud } from "./components/CopyHud";

// Detect if this window is the settings page
const isSettingsPage = new URLSearchParams(window.location.search).get("page") === "settings";

function MainApp() {
  const fetchItems = useClipboardStore((s) => s.fetchItems);
  const refreshOnChange = useClipboardStore((s) => s.refreshOnChange);
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

  // Listen for show event to replay slide-up animation
  useEffect(() => {
    const unlisten = listen("easycv-show", () => {
      const el = panelRef.current;
      if (el) {
        el.classList.remove("panel-enter");
        el.classList.add("panel-idle");
        // Force reflow to restart animation
        void el.offsetWidth;
        el.classList.remove("panel-idle");
        el.classList.add("panel-enter");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col">
      <div
        ref={panelRef}
        className="panel-idle w-full h-full text-foreground flex flex-col font-sans overflow-hidden"
      >
        {/* Header — single row, centered */}
        <div className="flex items-center justify-center gap-3 px-4 pt-3 pb-2 shrink-0" data-tauri-drag-region>
          <ViewTabs />
          <SearchBar />
          <TypeFilter />
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 px-2 pb-1">
          <ClipboardList />
        </div>
      </div>
      <CopyHud />
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

function App() {
  return isSettingsPage ? <SettingsApp /> : <MainApp />;
}

export default App;
