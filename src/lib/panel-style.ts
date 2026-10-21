export function getDocumentBackgroundColor({
  isMac,
  page,
}: {
  isMac: boolean;
  page: string | null;
}) {
  if (isMac) return "transparent";
  if (page === null || page === "") return "var(--color-background)";
  return page === "hud" ? "var(--color-card)" : "transparent";
}

export function getMainWindowShellClassName(isMac: boolean) {
  return `h-screen w-screen flex flex-col ${isMac ? "" : "bg-transparent"}`;
}

export function getMainPanelClassName({
  isMac,
  isTop,
}: {
  isMac: boolean;
  isTop: boolean;
  isVertical?: boolean;
}) {
  return `panel-idle w-full h-full text-foreground flex font-sans overflow-hidden ${
    isTop ? "flex-col-reverse" : "flex-col"
  } ${isMac ? "window-surface" : "bg-background ring-1 ring-border/50"}`;
}

/** Shared surface for every clipboard card type (tokens in index.css). */
export function getCardSurfaceClassName(selected: boolean) {
  return `relative flex flex-col gap-1.5 rounded-lg border p-3 cursor-pointer transition-colors duration-100 h-full overflow-hidden ${
    selected
      ? "border-primary bg-selected"
      : "border-surface-border bg-surface hover:border-surface-border-hover hover:bg-surface-hover"
  }`;
}
