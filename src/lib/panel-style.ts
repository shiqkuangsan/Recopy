export function getMainWindowShellClassName(isMac: boolean) {
  return `h-screen w-screen flex flex-col ${isMac ? "" : "bg-background"}`;
}

export function getMainPanelClassName({ isMac, isTop }: { isMac: boolean; isTop: boolean }) {
  return `panel-idle w-full h-full text-foreground flex font-sans overflow-hidden ${
    isTop ? "flex-col-reverse" : "flex-col"
  } ${isMac ? "" : "bg-background ring-1 ring-border/50"}`;
}
