import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { pasteItem, copyToClipboard, pasteAsPlainText } from "../paste";
import type { ClipboardItem } from "../types";

const mockedInvoke = vi.mocked(invoke);

const mockItem = (overrides: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: "test-id-1",
  content_type: "plain_text",
  plain_text: "Hello World",
  source_app: "com.test",
  source_app_name: "TestApp",
  content_size: 11,
  content_hash: "abc123",
  is_favorited: false,
  created_at: "2026-02-23 10:00:00",
  updated_at: "2026-02-23 10:00:00",
  ...overrides,
});

describe("pasteItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should invoke paste_clipboard_item with autoPaste true by default", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem();

    await pasteItem(item);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "test-id-1",
      autoPaste: true,
    });
  });

  it("should invoke paste_clipboard_item with autoPaste true when explicitly passed", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem();

    await pasteItem(item, true);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "test-id-1",
      autoPaste: true,
    });
  });

  it("should invoke paste_clipboard_item with autoPaste false", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem();

    await pasteItem(item, false);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "test-id-1",
      autoPaste: false,
    });
  });

  it("should pass the correct item id for different items", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem({ id: "unique-uuid-42" });

    await pasteItem(item);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "unique-uuid-42",
      autoPaste: true,
    });
  });

  it("should handle invoke rejection gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedInvoke.mockRejectedValueOnce(new Error("paste failed"));

    await expect(pasteItem(mockItem())).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith("Failed to paste item:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should work with image content type items", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem({ id: "img-1", content_type: "image", image_path: "/tmp/img.png" });

    await pasteItem(item);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "img-1",
      autoPaste: true,
    });
  });

  it("should work with file content type items", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem({
      id: "file-1",
      content_type: "file",
      file_path: "/tmp/doc.pdf",
      file_name: "doc.pdf",
    });

    await pasteItem(item);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "file-1",
      autoPaste: true,
    });
  });

  it("should work with rich_text content type items", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem({ id: "rich-1", content_type: "rich_text" });

    await pasteItem(item);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "rich-1",
      autoPaste: true,
    });
  });
});

describe("copyToClipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should invoke paste_clipboard_item with autoPaste false", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem();

    await copyToClipboard(item);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "test-id-1",
      autoPaste: false,
    });
  });

  it("should handle invoke rejection gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedInvoke.mockRejectedValueOnce(new Error("copy failed"));

    await expect(copyToClipboard(mockItem())).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith("Failed to paste item:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe("pasteAsPlainText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should invoke paste_as_plain_text with correct id", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem();

    await pasteAsPlainText(item);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_as_plain_text", {
      id: "test-id-1",
    });
  });

  it("should pass the correct id for different items", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);
    const item = mockItem({ id: "another-uuid" });

    await pasteAsPlainText(item);

    expect(mockedInvoke).toHaveBeenCalledWith("paste_as_plain_text", {
      id: "another-uuid",
    });
  });

  it("should handle invoke rejection gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedInvoke.mockRejectedValueOnce(new Error("plain text paste failed"));

    await expect(pasteAsPlainText(mockItem())).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith("Failed to paste as plain text:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should only be called once per invocation", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);

    await pasteAsPlainText(mockItem());

    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });
});
