import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopyHudView } from "../CopyHud";

describe("CopyHudView", () => {
  it("renders a full-window Windows surface without a transparent margin gap", () => {
    render(<CopyHudView isMac={false} />);

    const surface = screen.getByTestId("copy-hud-surface");
    expect(surface).toHaveClass("h-full", "w-full", "rounded-[28px]", "bg-zinc-950");
    expect(surface).not.toHaveClass("mx-2", "my-2", "ring-1", "backdrop-blur-xl");
  });

  it("keeps macOS surface transparent for the native hudWindow effect", () => {
    render(<CopyHudView isMac />);

    const surface = screen.getByTestId("copy-hud-surface");
    expect(surface).not.toHaveClass("bg-zinc-950", "ring-1");
  });
});
