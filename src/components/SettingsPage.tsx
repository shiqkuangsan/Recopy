import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore, type Settings as AppSettings } from "../stores/settings-store";
import { useUpdateStore } from "../stores/update-store";
import {
  Settings,
  Clock,
  Keyboard,
  Shield,
  Info,
  Trash2,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  Globe,
  ExternalLink,
  RefreshCw,
  Download,
  RotateCcw,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Switch } from "./ui/switch";

type SettingsTab = "general" | "history" | "privacy" | "about";

export function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const { settings, loaded, loadSettings, updateSetting, clearHistory } =
    useSettingsStore();

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  if (!loaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground">{t("settings.loading")}</p>
      </div>
    );
  }

  const tabs: { id: SettingsTab; i18nKey: string; icon: React.ReactNode }[] = [
    { id: "general", i18nKey: "settings.tabs.general", icon: <Settings size={15} /> },
    { id: "history", i18nKey: "settings.tabs.history", icon: <Clock size={15} /> },
    { id: "privacy", i18nKey: "settings.tabs.privacy", icon: <Shield size={15} /> },
    { id: "about", i18nKey: "settings.tabs.about", icon: <Info size={15} /> },
  ];

  return (
    <div className="h-screen flex bg-background text-foreground font-sans select-none">
      {/* Sidebar */}
      <div className="w-44 p-3 flex flex-col gap-0.5 shrink-0 border-r border-border/30">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            onClick={() => setActiveTab(tab.id)}
            className={`w-full justify-start gap-2 ${
              activeTab === tab.id
                ? "bg-overlay text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-overlay-hover"
            }`}
          >
            {tab.icon}
            {t(tab.i18nKey)}
          </Button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {activeTab === "general" && (
          <GeneralSettings settings={settings} updateSetting={updateSetting} />
        )}
        {activeTab === "history" && (
          <HistorySettings settings={settings} updateSetting={updateSetting} clearHistory={clearHistory} />
        )}
        {activeTab === "privacy" && <PrivacySettings />}
        {activeTab === "about" && <AboutSettings />}
      </div>
    </div>
  );
}

function GeneralSettings({
  settings,
  updateSetting,
}: {
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      <SectionTitle>{t("settings.general.title")}</SectionTitle>

      <SettingRow label={t("settings.general.theme")} description={t("settings.general.themeDesc")}>
        <SegmentedControl
          value={settings.theme}
          options={[
            { value: "dark", icon: <Moon size={13} />, label: t("settings.general.dark") },
            { value: "light", icon: <Sun size={13} />, label: t("settings.general.light") },
            { value: "system", icon: <Monitor size={13} />, label: t("settings.general.system") },
          ]}
          onChange={(v) => updateSetting("theme", v)}
        />
      </SettingRow>

      <SettingRow label={t("settings.general.language")} description={t("settings.general.languageDesc")}>
        <SegmentedControl
          value={settings.language}
          options={[
            { value: "en", icon: <Globe size={13} />, label: "English" },
            { value: "zh", icon: <Globe size={13} />, label: "中文" },
            { value: "system", icon: <Globe size={13} />, label: t("settings.general.system") },
          ]}
          onChange={(v) => updateSetting("language", v)}
        />
      </SettingRow>

      <SettingRow label={t("settings.general.shortcut")} description={t("settings.general.shortcutDesc")}>
        <ShortcutRecorder
          value={settings.shortcut}
          onChange={(v) => updateSetting("shortcut", v)}
        />
      </SettingRow>

      <SettingRow label={t("settings.general.autoStart")} description={t("settings.general.autoStartDesc")}>
        <Switch
          checked={settings.auto_start === "true"}
          onCheckedChange={(v) => updateSetting("auto_start", v ? "true" : "false")}
        />
      </SettingRow>

      <SettingRow label={t("settings.general.closeOnBlur")} description={t("settings.general.closeOnBlurDesc")}>
        <Switch
          checked={settings.close_on_blur === "true"}
          onCheckedChange={(v) => updateSetting("close_on_blur", v ? "true" : "false")}
        />
      </SettingRow>
    </div>
  );
}

function HistorySettings({
  settings: _settings,
  updateSetting: _updateSetting,
  clearHistory,
}: {
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: string) => Promise<void>;
  clearHistory: () => Promise<number>;
}) {
  // Aliased as _settings/_updateSetting: used by commented-out retention/maxSize UI (FR-018, FR-008)
  void _settings;
  void _updateSetting;
  const { t } = useTranslation();
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    const count = await clearHistory();
    setCleared(count);
    setConfirmClear(false);
    setTimeout(() => setCleared(null), 3000);
  };

  return (
    <div className="space-y-1">
      <SectionTitle>{t("settings.history.title")}</SectionTitle>

      {/* Hidden until FR-018 is implemented: retention policy cleanup is never triggered */}
      {/* <SettingRow label={t("settings.history.retention")} description={t("settings.history.retentionDesc")}>
        <div className="relative">
          <select
            value={settings.retention_policy}
            onChange={(e) => updateSetting("retention_policy", e.target.value)}
            className="appearance-none bg-input/60 text-foreground border border-border/50 rounded-lg pl-3 pr-7 py-1.5 text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring hover:border-muted-foreground/40 transition-colors"
          >
            <option value="unlimited">{t("settings.history.unlimited")}</option>
            <option value="days">{t("settings.history.keepDays")}</option>
            <option value="count">{t("settings.history.keepCount")}</option>
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </SettingRow>

      {settings.retention_policy === "days" && (
        <SettingRow label={t("settings.history.retentionDays")} description={t("settings.history.retentionDaysDesc")}>
          <input
            type="number"
            min="1"
            max="365"
            value={settings.retention_days}
            onChange={(e) => updateSetting("retention_days", e.target.value)}
            className="bg-input/60 text-foreground border border-border/50 rounded-lg px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </SettingRow>
      )}

      {settings.retention_policy === "count" && (
        <SettingRow label={t("settings.history.maxItems")} description={t("settings.history.maxItemsDesc")}>
          <input
            type="number"
            min="10"
            max="100000"
            value={settings.retention_count}
            onChange={(e) => updateSetting("retention_count", e.target.value)}
            className="bg-input/60 text-foreground border border-border/50 rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </SettingRow>
      )} */}

      {/* Hidden until FR-008 is implemented */}
      {/* <SettingRow label={t("settings.history.maxSize")} description={t("settings.history.maxSizeDesc")}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="100"
            value={settings.max_item_size_mb}
            onChange={(e) => updateSetting("max_item_size_mb", e.target.value)}
            className="bg-input/60 text-foreground border border-border/50 rounded-lg px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">MB</span>
        </div>
      </SettingRow> */}

      <SettingRow label={t("settings.history.clear")} description={t("settings.history.clearDesc")}>
        <Button
          variant={confirmClear ? "destructive" : "ghost"}
          size="sm"
          onClick={handleClear}
          className={
            confirmClear
              ? ""
              : cleared !== null
                ? "bg-overlay text-foreground"
                : "text-destructive hover:bg-destructive/10"
          }
        >
          <Trash2 size={13} />
          {confirmClear
            ? t("settings.history.confirmClear")
            : cleared !== null
              ? t("settings.history.cleared", { count: cleared })
              : t("settings.history.clearAll")}
        </Button>
      </SettingRow>
    </div>
  );
}

function PrivacySettings() {
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      <SectionTitle>{t("settings.privacy.title")}</SectionTitle>

      <Card className="border-border/50 bg-card/60 py-0">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Shield size={15} className="text-primary" />
            {t("settings.privacy.accessibility")}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("settings.privacy.accessibilityDesc")}
          </p>
          <button
            onClick={() => invoke("open_url", { url: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" })}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <ChevronRight size={12} />
            {t("settings.privacy.accessibilityPath")}
            <ExternalLink size={11} />
          </button>
        </CardContent>
      </Card>

      {/* Hidden until FR-003 is implemented */}
      {/* <SettingRow label={t("settings.privacy.exclusionList")} description={t("settings.privacy.exclusionListDesc")}>
        <span className="text-xs text-muted-foreground/60 px-2 py-1 rounded-md bg-overlay-hover">{t("settings.privacy.comingSoon")}</span>
      </SettingRow> */}
    </div>
  );
}

function UpdateCheckButton() {
  const { t } = useTranslation();
  const { status, version, progress, relaunchFailed, checkForUpdate, downloadAndInstall, retryDownload, relaunch, dismissError } = useUpdateStore();
  const [showUpToDate, setShowUpToDate] = useState(false);

  const handleCheck = async () => {
    const prevStatus = useUpdateStore.getState().status;
    await checkForUpdate();
    const newStatus = useUpdateStore.getState().status;
    if (prevStatus !== "idle" || newStatus !== "idle") return;
    // No update found — show "up to date" briefly
    setShowUpToDate(true);
    setTimeout(() => setShowUpToDate(false), 3000);
  };

  if (status === "ready") {
    if (relaunchFailed) {
      return (
        <span className="text-sm text-warning/80">{t("update.restartManually")}</span>
      );
    }
    return (
      <Button size="sm" className="gap-1.5" onClick={relaunch}>
        <RotateCcw size={14} />
        {t("update.restart")}
      </Button>
    );
  }

  if (status === "downloading") {
    return (
      <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <div className="w-24 h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="tabular-nums">{progress}%</span>
      </div>
    );
  }

  if (status === "available") {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadAndInstall}>
        <Download size={14} />
        {t("update.available", { version })}
      </Button>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm text-destructive">{t("update.failed")}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" onClick={retryDownload}>
          <RefreshCw size={12} />
          {t("update.retry")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={dismissError}>
          {t("update.dismiss")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {showUpToDate && (
        <span className="text-xs text-muted-foreground">{t("update.upToDate")}</span>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5"
        disabled={status === "checking"}
        onClick={handleCheck}
      >
        <RefreshCw size={14} className={status === "checking" ? "animate-spin" : ""} />
        {t("update.checkNow")}
      </Button>
    </div>
  );
}

function AboutSettings() {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const { settings, updateSetting } = useSettingsStore();

  useEffect(() => {
    import("@tauri-apps/api/app").then((mod) =>
      mod.getVersion().then(setVersion)
    ).catch(() => setVersion("dev"));
  }, []);

  return (
    <div className="space-y-5">
      <SectionTitle>{t("settings.about.title")}</SectionTitle>

      <Card className="border-border/50 bg-card/60 py-0">
        <CardContent className="p-5 text-center space-y-3">
          <h3 className="text-xl font-bold">{t("app.name")}</h3>
          <p className="text-sm text-muted-foreground">{t("app.version", { version: version || "..." })}</p>
          <p className="text-xs text-muted-foreground/80">{t("app.description")}</p>
          <UpdateCheckButton />
        </CardContent>
      </Card>

      <SettingRow label={t("update.checkInterval")} description={t("update.checkIntervalDesc")}>
        <SegmentedControl
          value={settings.update_check_interval}
          options={[
            { value: "daily", icon: <Clock size={13} />, label: t("update.daily") },
            { value: "weekly", icon: <Clock size={13} />, label: t("update.weekly") },
            { value: "monthly", icon: <Clock size={13} />, label: t("update.monthly") },
            { value: "never", icon: <Clock size={13} />, label: t("update.never") },
          ]}
          onChange={(v) => updateSetting("update_check_interval", v)}
        />
      </SettingRow>

      <Card className="border-border/50 bg-card/60 py-0 overflow-hidden">
        {[
          { label: t("settings.about.homepage"), value: "recopy.pages.dev", link: "https://recopy.pages.dev" },
          { label: t("settings.about.repository"), value: "GitHub", link: "https://github.com/shiqkuangsan/Recopy" },
          { label: t("settings.about.feedback"), value: t("settings.about.reportIssue"), link: "https://github.com/shiqkuangsan/Recopy/issues" },
          { label: t("settings.about.author"), value: "shiqkuangsan", link: "https://github.com/shiqkuangsan" },
          { label: t("settings.about.license"), value: "PolyForm Noncommercial 1.0.0" },
          { label: "Homebrew", value: t("settings.about.brewAvailable"), link: "https://github.com/shiqkuangsan/homebrew-recopy" },
        ].map((item, i, arr) => (
          <div
            key={item.label}
            className={`flex justify-between px-4 py-2.5 text-sm ${
              i < arr.length - 1 ? "border-b border-border/30" : ""
            }`}
          >
            <span className="text-muted-foreground">{item.label}</span>
            {"link" in item && item.link ? (
              <button
                onClick={() => invoke("open_url", { url: item.link })}
                className="text-primary hover:text-primary/80 flex items-center gap-1 transition-colors cursor-pointer"
              >
                {item.value}
                <ExternalLink size={12} />
              </button>
            ) : (
              <span className="text-foreground">{item.value}</span>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

// --- Shared UI components ---

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold mb-3">{children}</h2>;
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/20">
      <div className="space-y-0.5 pr-4">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground/80">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; icon: React.ReactNode; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg bg-overlay-hover">
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant="ghost"
          size="sm"
          onClick={() => onChange(opt.value)}
          className={`gap-1.5 text-xs ${
            value === opt.value
              ? "bg-overlay text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.icon}
          {opt.label}
        </Button>
      ))}
    </div>
  );
}


function ShortcutRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    setDisplay(value);
  }, [value]);

  useEffect(() => {
    if (!recording) return;

    // Unregister global shortcut so it doesn't intercept key events
    invoke("unregister_shortcut");

    const handler = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape to cancel recording
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }

      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");

      const key = e.key;
      if (key !== "Meta" && key !== "Control" && key !== "Shift" && key !== "Alt") {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
        const shortcut = parts.join("+");
        setDisplay(shortcut);
        // Persist to DB first, then stop recording — ensures register_shortcut reads the new value
        await onChange(shortcut);
        setRecording(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      // Re-register global shortcut from DB settings
      invoke("register_shortcut");
    };
  }, [recording, onChange]);

  const formatShortcut = (s: string) =>
    s
      .replace("CommandOrControl", navigator.platform.includes("Mac") ? "\u2318" : "Ctrl")
      .replace("Shift", "\u21E7")
      .replace("Alt", "\u2325")
      .replace(/\+/g, " ");

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setRecording(!recording)}
      className={`min-w-28 text-xs ${
        recording
          ? "bg-primary/15 text-primary ring-1 ring-primary animate-pulse border-primary/30"
          : "bg-input/60 border-border/50 hover:border-muted-foreground/40"
      }`}
    >
      <Keyboard size={12} />
      {recording ? t("settings.general.pressKeys") : formatShortcut(display)}
    </Button>
  );
}
