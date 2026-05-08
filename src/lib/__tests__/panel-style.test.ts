import { describe, expect, it } from "vitest";
import { getMainPanelClassName, getMainWindowShellClassName } from "../panel-style";

describe("panel style", () => {
  it("paints an opaque Windows shell to cover transparent window edge artifacts", () => {
    expect(getMainWindowShellClassName(false)).toContain("bg-background");
    expect(getMainPanelClassName({ isMac: false, isTop: false })).toContain("bg-background");
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
