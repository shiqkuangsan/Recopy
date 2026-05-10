export function getDocumentBackgroundColor({
  isMac,
  page,
}: {
  isMac: boolean;
  page: string | null;
}) {
  if (isMac) return "transparent";
  if (page === null || page === "") return "var(--color-background)";
  return page === "hud" ? "#18181B" : "transparent";
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
  } ${isMac ? "" : "bg-background ring-1 ring-border/50"}`;
}
