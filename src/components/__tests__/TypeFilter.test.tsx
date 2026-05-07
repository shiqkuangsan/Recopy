import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { TypeFilter } from "../TypeFilter";
import { useClipboardStore } from "../../stores/clipboard-store";

describe("TypeFilter", () => {
  beforeEach(() => {
    useClipboardStore.setState({
      filterType: "all",
      selectedIndex: 0,
    });
  });

  it("uses opaque high-contrast text for inactive filters", () => {
    render(<TypeFilter />);

    expect(screen.getByRole("button", { name: /text/i })).toHaveClass(
      "text-zinc-700",
      "dark:text-zinc-200",
    );
  });
});
