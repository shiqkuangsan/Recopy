import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopyHudView } from "../CopyHud";

describe("CopyHudView", () => {
  it("renders Windows HUD as a solid full-window surface", () => {
    render(<CopyHudView isMac={false} />);

    const root = screen.getByTestId("copy-hud-root");
    const surface = screen.getByTestId("copy-hud-surface");
    expect(root).toHaveClass("bg-card", "text-foreground");
    expect(surface).toHaveClass("h-full", "w-full");
    expect(surface).not.toHaveClass(
      "rounded-[28px]",
      "bg-card",
      "mx-2",
      "my-2",
      "ring-1",
      "backdrop-blur-xl",
    );
  });

  it("replays the entrance on each show and fades content before hiding", () => {
    const { rerender } = render(<CopyHudView isMac={false} playKey={1} />);
    const first = screen.getByTestId("copy-hud-surface");
    expect(first).toHaveClass("hud-enter");

    rerender(<CopyHudView isMac={false} playKey={2} />);
    const second = screen.getByTestId("copy-hud-surface");
    expect(second).not.toBe(first); // remounted, so the CSS animation restarts

    rerender(<CopyHudView isMac={false} playKey={2} leaving />);
    expect(screen.getByTestId("copy-hud-surface")).toHaveClass("hud-leave");
    // The Windows surface itself stays solid; only its content animates.
    expect(screen.getByTestId("copy-hud-root")).toHaveClass("bg-card");
  });

  it("keeps macOS surface transparent for the native hudWindow effect", () => {
    render(<CopyHudView isMac />);

    const root = screen.getByTestId("copy-hud-root");
    const surface = screen.getByTestId("copy-hud-surface");
    expect(root).not.toHaveClass("bg-card");
    expect(surface).not.toHaveClass("bg-card", "ring-1");
  });
});
