import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileCard } from "../FileCard";
import type { ClipboardItem } from "../../lib/types";

const mockItem = (overrides: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: "file-1",
  content_type: "file",
  plain_text: "/Users/test/document.pdf",
  file_path: "/Users/test/document.pdf",
  file_name: "document.pdf",
  source_app: "com.apple.finder",
  source_app_name: "Finder",
  content_size: 2048576,
  content_hash: "file-hash",
  is_favorited: false,
  created_at: "2026-02-23 10:00:00",
  updated_at: "2026-02-23 10:00:00",
  ...overrides,
});

describe("FileCard", () => {
  it("renders file name and size", () => {
    render(<FileCard item={mockItem()} selected={false} onClick={vi.fn()} />);
    expect(screen.getByText("document.pdf")).toBeInTheDocument();
    expect(screen.getByText("File")).toBeInTheDocument();
  });

  it("renders file extension info", () => {
    render(<FileCard item={mockItem()} selected={false} onClick={vi.fn()} />);
    expect(screen.getByText(/· \.pdf/)).toBeInTheDocument();
  });

  it("shows file size formatted", () => {
    render(<FileCard item={mockItem()} selected={false} onClick={vi.fn()} />);
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
  });
});
