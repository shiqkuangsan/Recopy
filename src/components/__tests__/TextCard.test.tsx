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
  it("shows the note separately without replacing the copied content", () => {
    render(
      <TextCard
        item={mockItem({ note_title: "Company VPN account", plain_text: "82719406" })}
        selected={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Company VPN account")).toHaveAttribute("title", "Company VPN account");
    expect(screen.getByText("82719406")).toBeInTheDocument();
  });

  it("renders plain text content", () => {
    render(<TextCard item={mockItem()} selected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
  });

  it("truncates long text", () => {
    const longText = "A".repeat(400);
    render(
      <TextCard item={mockItem({ plain_text: longText })} selected={false} onClick={vi.fn()} />,
    );
    const pre = screen.getByText(/^A+\.\.\.$/);
    expect(pre.textContent!.length).toBeLessThan(400);
  });

  it("does not render favorite star (managed by ClipboardCard)", () => {
    const { container } = render(
      <TextCard item={mockItem({ is_favorited: true })} selected={false} onClick={vi.fn()} />,
    );
    const svg = container.querySelector("svg.lucide-star");
    expect(svg).not.toBeInTheDocument();
  });

  it("applies selected styles", () => {
    render(<TextCard item={mockItem()} selected={true} onClick={vi.fn()} />);
    const card = screen.getByRole("button");
    expect(card.className).toContain("border-primary");
  });
});
