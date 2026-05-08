export function getDocumentBackgroundColor({
  isMac,
  page,
}: {
  isMac: boolean;
  page: string | null;
}) {
  if (isMac) return "transparent";
  return page === "hud" ? "#09090B" : "transparent";
}

export function getMainWindowShellClassName(isMac: boolean) {
  return `h-screen w-screen flex flex-col ${isMac ? "" : "bg-transparent"}`;
}

export function getMainPanelClassName({
  isMac,
  isTop,
  isVertical = false,
}: {
  isMac: boolean;
  isTop: boolean;
  isVertical?: boolean;
}) {
  const windowsHorizontalEdge = !isMac && !isVertical ? "w-[calc(100%-0.5rem)] mr-2" : "w-full";

  return `panel-idle ${windowsHorizontalEdge} h-full text-foreground flex font-sans overflow-hidden ${
    isTop ? "flex-col-reverse" : "flex-col"
  } ${isMac ? "" : "bg-background ring-1 ring-border/50"}`;
}
