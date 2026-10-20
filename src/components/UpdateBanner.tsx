import { useTranslation } from "react-i18next";
import { useUpdateStore } from "../stores/update-store";
import { Download, RotateCcw, RefreshCw, X } from "lucide-react";

export function UpdateBanner() {
  const { t } = useTranslation();
  const {
    status,
    version,
    progress,
    relaunchFailed,
    downloadAndInstall,
    retryDownload,
    dismissError,
    relaunch,
  } = useUpdateStore();

  if (status === "idle" || status === "checking") {
    return null;
  }

  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive/70">
        <span>{t("update.failed")}</span>
        <button
          onClick={retryDownload}
          className="hover:text-destructive transition-colors cursor-pointer"
          title={t("update.retry")}
        >
          <RefreshCw size={10} />
        </button>
        <button
          onClick={dismissError}
          className="hover:text-destructive transition-colors cursor-pointer"
          title={t("update.dismiss")}
        >
          <X size={10} />
        </button>
      </span>
    );
  }

  if (status === "available") {
    return (
      <button
        onClick={downloadAndInstall}
        className="flex items-center gap-1.5 text-xs text-primary/90 hover:text-primary transition-colors cursor-pointer"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <Download size={11} />
        <span>{t("update.available", { version })}</span>
      </button>
    );
  }

  if (status === "downloading") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="w-20 h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="tabular-nums">{progress}%</span>
      </div>
    );
  }

  if (status === "ready") {
    if (relaunchFailed) {
      return <span className="text-xs text-warning/80">{t("update.restartManually")}</span>;
    }
    return (
      <button
        onClick={relaunch}
        className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80 transition-opacity cursor-pointer"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <RotateCcw size={11} />
        <span>{t("update.restart")}</span>
      </button>
    );
  }

  return null;
}
