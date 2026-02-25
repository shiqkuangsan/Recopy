import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { ImageCard } from "../ImageCard";
import type { ClipboardItem } from "../../lib/types";

const mockedInvoke = vi.mocked(invoke);

const mockItem = (overrides: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: "img-1",
  content_type: "image",
  plain_text: "",
  source_app: "com.test",
  source_app_name: "Preview",
  content_size: 102400,
  content_hash: "img-hash",
  is_favorited: false,
  created_at: "2026-02-23 10:00:00",
  updated_at: "2026-02-23 10:00:00",
  ...overrides,
});

// Mock URL.createObjectURL for jsdom
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
}

describe("ImageCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedInvoke.mockResolvedValue(null);
  });

  it("renders image type label and size", () => {
    render(<ImageCard item={mockItem()} selected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("100.0 KB")).toBeInTheDocument();
  });

  it("renders placeholder when no thumbnail", () => {
    const { container } = render(
      <ImageCard item={mockItem()} selected={false} onClick={vi.fn()} />
    );
    // No img element (thumbnail not loaded yet, invoke returns null)
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders thumbnail image when loaded", async () => {
    // 1x1 transparent PNG bytes
    const pngBytes = [
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
    ];
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_thumbnail") return Promise.resolve(pngBytes);
      return Promise.resolve(null);
    });

    const { container } = render(
      <ImageCard item={mockItem()} selected={false} onClick={vi.fn()} />
    );

    // Wait for async thumbnail load
    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
    });
  });
});
