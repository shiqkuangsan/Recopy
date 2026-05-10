import { describe, expect, it } from "vitest";
import {
  getDocumentBackgroundColor,
  getMainPanelClassName,
  getMainWindowShellClassName,
} from "../panel-style";

describe("panel style", () => {
  it("keeps the Windows shell transparent and paints only the panel surface", () => {
    expect(getMainWindowShellClassName(false)).not.toContain("bg-background");
    expect(getMainPanelClassName({ isMac: false, isTop: false })).toContain("bg-background");
  });

  it("paints the non-macOS main panel document background to cover transparent edge leaks", () => {
    expect(getDocumentBackgroundColor({ isMac: false, page: null })).toBe(
      "var(--color-background)",
    );
    expect(getDocumentBackgroundColor({ isMac: false, page: "" })).toBe("var(--color-background)");
    expect(getDocumentBackgroundColor({ isMac: false, page: "preview" })).toBe("transparent");
  });

  it("uses a solid document background only for the non-macOS HUD page", () => {
    expect(getDocumentBackgroundColor({ isMac: false, page: "hud" })).toBe("#18181B");
    expect(getDocumentBackgroundColor({ isMac: true, page: "hud" })).toBe("transparent");
  });

  it("keeps Windows horizontal panels full-width without compensating CSS margins", () => {
    expect(getMainPanelClassName({ isMac: false, isTop: false })).toContain("w-full");
    expect(getMainPanelClassName({ isMac: false, isTop: false })).not.toContain("mr-2");
    expect(getMainPanelClassName({ isMac: false, isTop: false })).not.toContain(
      "w-[calc(100%-0.5rem)]",
    );
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
