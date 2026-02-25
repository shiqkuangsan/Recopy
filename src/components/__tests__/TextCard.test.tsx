import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextCard } from "../TextCard";
import type { ClipboardItem } from "../../lib/types";

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

describe("TextCard", () => {
  it("renders plain text content", () => {
    render(<TextCard item={mockItem()} selected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
  });

  it("truncates long text", () => {
    const longText = "A".repeat(400);
    render(
      <TextCard item={mockItem({ plain_text: longText })} selected={false} onClick={vi.fn()} />
    );
    const pre = screen.getByText(/^A+\.\.\.$/);
    expect(pre.textContent!.length).toBeLessThan(400);
  });

  it("shows favorite star when is_favorited", () => {
    const { container } = render(
      <TextCard item={mockItem({ is_favorited: true })} selected={false} onClick={vi.fn()} />
    );
    // Star icon should be present (lucide renders svg)
    const svg = container.querySelector("svg.text-yellow-500");
    expect(svg).toBeInTheDocument();
  });

  it("applies selected styles", () => {
    render(<TextCard item={mockItem()} selected={true} onClick={vi.fn()} />);
    const card = screen.getByRole("button");
    expect(card.className).toContain("border-accent");
  });
});
