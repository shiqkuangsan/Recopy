import i18n from "../i18n";

/** Format a UTC datetime string into a relative time label. */
export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr + "Z"); // Treat as UTC
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const t = i18n.t.bind(i18n);
  if (diffSec < 60) return t("time.justNow");
  if (diffMin < 60) return t("time.minutesAgo", { count: diffMin });
  if (diffHour < 24) return t("time.hoursAgo", { count: diffHour });
  if (diffDay < 7) return t("time.daysAgo", { count: diffDay });
  return date.toLocaleDateString(i18n.language === "zh" ? "zh-CN" : "en-US");
}

/** Group label for time-based sections. Returns an i18n key. */
export function dateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (today.getTime() - itemDay.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "time.today";
  if (diffDays < 7) return "time.thisWeek";
  if (diffDays < 30) return "time.thisMonth";
  return "time.earlier";
}

/** Format bytes into human-readable string. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
