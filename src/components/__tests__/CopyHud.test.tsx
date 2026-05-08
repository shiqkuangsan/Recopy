import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopyHudView } from "../CopyHud";

describe("CopyHudView", () => {
  it("renders Windows HUD as a solid full-window surface", () => {
    render(<CopyHudView isMac={false} />);

    const root = screen.getByTestId("copy-hud-root");
    const surface = screen.getByTestId("copy-hud-surface");
    expect(root).toHaveClass("bg-zinc-900", "text-white");
    expect(surface).toHaveClass("h-full", "w-full");
    expect(surface).not.toHaveClass(
      "rounded-[28px]",
      "bg-zinc-900",
      "mx-2",
      "my-2",
      "ring-1",
      "backdrop-blur-xl",
    );
  });

  it("keeps macOS surface transparent for the native hudWindow effect", () => {
    render(<CopyHudView isMac />);

    const root = screen.getByTestId("copy-hud-root");
    const surface = screen.getByTestId("copy-hud-surface");
    expect(root).not.toHaveClass("bg-zinc-900");
    expect(surface).not.toHaveClass("bg-zinc-900", "ring-1");
  });
});
