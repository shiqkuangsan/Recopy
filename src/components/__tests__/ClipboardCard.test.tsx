import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ClipboardCard } from "../ClipboardCard";
import { useClipboardStore } from "../../stores/clipboard-store";
import type { ClipboardItem } from "../../lib/types";

vi.mock("../ItemContextMenu", () => ({
  ItemContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../FavoriteStar", () => ({
  FavoriteStar: () => null,
}));

vi.mock("../TextCard", () => ({
  TextCard: ({ item, onClick }: { item: ClipboardItem; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {item.plain_text}
    </button>
  ),
}));

const mockItem = (overrides: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: "1",
  content_type: "plain_text",
  plain_text: "Hello World",
  source_app: "com.test",
  source_app_name: "TestApp",
  content_size: 11,
  content_hash: "abc",
  is_favorited: false,
  created_at: "2026-02-23 10:00:00",
  updated_at: "2026-02-23 10:00:00",
  ...overrides,
});

describe("ClipboardCard", () => {
  beforeEach(() => {
    useClipboardStore.setState({ modifierHeld: false } as never);
  });

  it("renders quick-paste badge when modifier is held", () => {
    useClipboardStore.setState({ modifierHeld: true } as never);

    render(
      <ClipboardCard
        {...({
          item: mockItem(),
          selected: false,
          onClick: vi.fn(),
          quickIndex: 1,
        } as never)}
      />,
    );

    const badge = screen.getByText("1");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bottom-2");
    expect(badge).toHaveClass("left-2");
    expect(badge).not.toHaveClass("right-2");
  });

  it("does not render quick-paste badge when modifier is not held", () => {
    render(
      <ClipboardCard
        {...({
          item: mockItem(),
          selected: false,
          onClick: vi.fn(),
          quickIndex: 1,
        } as never)}
      />,
    );

    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
