import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ViewTabs } from "../ViewTabs";
import { useClipboardStore } from "../../stores/clipboard-store";

describe("ViewTabs", () => {
  beforeEach(() => {
    useClipboardStore.setState({
      viewMode: "history",
      selectedIndex: 0,
    });
  });

  it("uses opaque high-contrast text for inactive tabs", () => {
    render(<ViewTabs />);

    expect(screen.getByRole("button", { name: /pins/i })).toHaveClass(
      "text-zinc-700",
      "dark:text-zinc-200",
    );
  });
});
