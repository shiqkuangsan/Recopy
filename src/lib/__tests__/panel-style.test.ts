import { describe, expect, it } from "vitest";
import { getMainPanelClassName, getMainWindowShellClassName } from "../panel-style";

describe("panel style", () => {
  it("keeps the Windows shell transparent and paints only the panel surface", () => {
    expect(getMainWindowShellClassName(false)).not.toContain("bg-background");
    expect(getMainPanelClassName({ isMac: false, isTop: false })).toContain("bg-background");
  });

  it("reserves a right-side visual edge on Windows to match the native left edge", () => {
    expect(getMainPanelClassName({ isMac: false, isTop: false })).toContain("mr-2");
    expect(getMainPanelClassName({ isMac: false, isTop: false })).toContain(
      "w-[calc(100%-0.5rem)]",
    );
    expect(getMainPanelClassName({ isMac: true, isTop: false })).not.toContain("mr-2");
  });

  it("keeps vertical side panels full-width", () => {
    expect(getMainPanelClassName({ isMac: false, isTop: false, isVertical: true })).toContain(
      "w-full",
    );
    expect(getMainPanelClassName({ isMac: false, isTop: false, isVertical: true })).not.toContain(
      "mr-2",
    );
  });

  it("keeps macOS panel background delegated to the native NSPanel effect", () => {
    expect(getMainWindowShellClassName(true)).not.toContain("bg-background");
    expect(getMainPanelClassName({ isMac: true, isTop: false })).not.toContain("bg-background");
  });

  it("preserves top mode reverse layout", () => {
    expect(getMainPanelClassName({ isMac: false, isTop: true })).toContain("flex-col-reverse");
    expect(getMainPanelClassName({ isMac: false, isTop: false })).toContain("flex-col");
  });
});
