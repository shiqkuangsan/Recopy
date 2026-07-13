import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { PreviewPage } from "../PreviewPage";
import {
  PREVIEW_SELECTION_CHANGED_EVENT,
  PREVIEW_SELECTION_CLEAR_EVENT,
  PREVIEW_SELECTION_READY_EVENT,
} from "../../lib/preview-selection";
import type { ItemDetail } from "../../lib/types";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

const mockedInvoke = vi.mocked(invoke);
const mockedEmit = vi.mocked(emit);
const mockedListen = vi.mocked(listen);
const tauriEventHandlers = new Map<string, (event: { payload: unknown }) => void>();

const plainTextDetail: ItemDetail = {
  id: "item-1",
  content_type: "plain_text",
  plain_text: "Hello selectable world",
  content_size: 22,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function mockPreview(detail: ItemDetail) {
  mockedInvoke.mockImplementation((command) => {
    if (command === "get_current_preview") {
      return Promise.resolve({ detail, closing: false });
    }
    if (command === "get_settings") {
      return Promise.resolve({});
    }
    return Promise.resolve(null);
  });
}

function mockSelection(anchorNode: Node, focusNode: Node, text: string) {
  vi.spyOn(window, "getSelection").mockReturnValue({
    anchorNode,
    focusNode,
    toString: () => text,
  } as Selection);
}

async function waitForPreviewEffects() {
  await waitFor(() => expect(tauriEventHandlers.has(PREVIEW_SELECTION_CLEAR_EVENT)).toBe(true));
}

async function activatePreviewGeneration(generation = 7) {
  await waitForPreviewEffects();
  act(() => tauriEventHandlers.get(PREVIEW_SELECTION_CLEAR_EVENT)?.({ payload: { generation } }));
}

describe("PreviewPage text selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    tauriEventHandlers.clear();
    mockedListen.mockImplementation(((
      eventName: string,
      handler: (event: { payload: unknown }) => void,
    ) => {
      tauriEventHandlers.set(eventName, handler);
      return Promise.resolve(() => {
        if (tauriEventHandlers.get(eventName) === handler) {
          tauriEventHandlers.delete(eventName);
        }
      });
    }) as typeof listen);
  });

  it("announces readiness and acknowledges the main-owned generation", async () => {
    mockPreview(plainTextDetail);
    render(<PreviewPage />);

    await screen.findByText(plainTextDetail.plain_text);
    await waitForPreviewEffects();
    expect(mockedEmit).toHaveBeenCalledWith(PREVIEW_SELECTION_READY_EVENT);
    mockedEmit.mockClear();
    await activatePreviewGeneration();

    await waitFor(() => {
      expect(mockedEmit).toHaveBeenCalledWith(
        PREVIEW_SELECTION_CHANGED_EVENT,
        expect.objectContaining({
          itemId: plainTextDetail.id,
          text: "",
          sequence: expect.any(Number),
          generation: 7,
        }),
      );
    });
  });

  it("opts plain and rich text preview content into text selection", async () => {
    mockPreview(plainTextDetail);
    const { unmount } = render(<PreviewPage />);

    const plainText = await screen.findByText(plainTextDetail.plain_text);
    expect(plainText.closest(".select-text")).not.toBeNull();
    unmount();

    mockPreview({
      ...plainTextDetail,
      id: "item-2",
      content_type: "rich_text",
      rich_content: "<p>Rich selectable text</p>",
    });
    render(<PreviewPage />);

    const richText = await screen.findByText("Rich selectable text");
    expect(richText.closest(".select-text")).not.toBeNull();
  });

  it("emits the exact selection when both endpoints belong to the readable content", async () => {
    mockPreview(plainTextDetail);
    render(<PreviewPage />);

    const text = await screen.findByText(plainTextDetail.plain_text);
    await activatePreviewGeneration();
    const textNode = text.firstChild!;
    mockSelection(textNode, textNode, "  selectable\nworld  ");

    act(() => document.dispatchEvent(new Event("selectionchange")));

    await waitFor(() => {
      expect(mockedEmit).toHaveBeenCalledWith(
        PREVIEW_SELECTION_CHANGED_EVENT,
        expect.objectContaining({
          itemId: plainTextDetail.id,
          text: "  selectable\nworld  ",
          sequence: expect.any(Number),
          generation: 7,
        }),
      );
    });
  });

  it("emits an empty selection when selection endpoints are outside readable content", async () => {
    mockPreview(plainTextDetail);
    render(<PreviewPage />);

    await screen.findByText(plainTextDetail.plain_text);
    await activatePreviewGeneration();
    const outside = document.createTextNode("outside");
    document.body.appendChild(outside);
    mockSelection(outside, outside, "outside");

    act(() => document.dispatchEvent(new Event("selectionchange")));
    outside.remove();

    await waitFor(() => {
      expect(mockedEmit).toHaveBeenCalledWith(
        PREVIEW_SELECTION_CHANGED_EVENT,
        expect.objectContaining({
          itemId: plainTextDetail.id,
          text: "",
          sequence: expect.any(Number),
          generation: 7,
        }),
      );
    });
  });

  it("copies the exact selection when the preview WebView receives a copy event", async () => {
    mockPreview(plainTextDetail);
    render(<PreviewPage />);

    const text = await screen.findByText(plainTextDetail.plain_text);
    await waitForPreviewEffects();
    const textNode = text.firstChild!;
    mockSelection(textNode, textNode, "  selected\ntext  ");
    const copyEvent = new Event("copy", { cancelable: true });

    act(() => document.dispatchEvent(copyEvent));

    await waitFor(() => {
      expect(copyEvent.defaultPrevented).toBe(true);
      expect(mockedInvoke).toHaveBeenCalledWith("copy_text_to_clipboard", {
        text: "  selected\ntext  ",
      });
      expect(mockedInvoke).toHaveBeenCalledWith("show_copy_hud");
    });
  });

  it("copies the whole item when the preview WebView receives copy without a selection", async () => {
    mockPreview(plainTextDetail);
    render(<PreviewPage />);

    await screen.findByText(plainTextDetail.plain_text);
    const outside = document.createTextNode("outside");
    document.body.appendChild(outside);
    mockSelection(outside, outside, "");
    const copyEvent = new Event("copy", { cancelable: true });

    act(() => document.dispatchEvent(copyEvent));
    outside.remove();

    await waitFor(() => {
      expect(copyEvent.defaultPrevented).toBe(true);
      expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
        id: plainTextDetail.id,
        autoPaste: false,
      });
      expect(mockedInvoke).toHaveBeenCalledWith("show_copy_hud");
    });
  });

  it.each([
    {
      label: "exact selection",
      failingCommand: "copy_text_to_clipboard",
      selectedText: "selected",
    },
    { label: "whole item fallback", failingCommand: "paste_clipboard_item", selectedText: "" },
  ])("does not show the HUD when $label copy fails", async ({ failingCommand, selectedText }) => {
    mockPreview(plainTextDetail);
    const baseInvoke = mockedInvoke.getMockImplementation()!;
    mockedInvoke.mockImplementation((command, args) => {
      if (command === failingCommand) return Promise.reject(new Error("copy failed"));
      return baseInvoke(command, args);
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<PreviewPage />);

    const text = await screen.findByText(plainTextDetail.plain_text);
    const textNode = text.firstChild!;
    mockSelection(textNode, textNode, selectedText);
    const copyEvent = new Event("copy", { cancelable: true });

    act(() => document.dispatchEvent(copyEvent));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith("Failed to copy preview content:", expect.any(Error));
    });
    expect(mockedInvoke).not.toHaveBeenCalledWith("show_copy_hud");
    consoleSpy.mockRestore();
  });

  it("clears the selection when the preview unmounts", async () => {
    mockPreview(plainTextDetail);
    const { unmount } = render(<PreviewPage />);

    await screen.findByText(plainTextDetail.plain_text);
    await activatePreviewGeneration();
    mockedEmit.mockClear();
    unmount();

    expect(mockedEmit).toHaveBeenCalledWith(
      PREVIEW_SELECTION_CHANGED_EVENT,
      expect.objectContaining({
        itemId: plainTextDetail.id,
        text: "",
        sequence: expect.any(Number),
        generation: 7,
      }),
    );
  });

  it("clears the DOM selection when the main WebView requests it", async () => {
    mockPreview(plainTextDetail);
    render(<PreviewPage />);

    const text = await screen.findByText(plainTextDetail.plain_text);
    const removeAllRanges = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      anchorNode: text.firstChild,
      focusNode: text.firstChild,
      toString: () => "selected",
      removeAllRanges,
    } as unknown as Selection);
    await waitForPreviewEffects();

    act(() =>
      tauriEventHandlers.get(PREVIEW_SELECTION_CLEAR_EVENT)?.({ payload: { generation: 7 } }),
    );

    expect(removeAllRanges).toHaveBeenCalled();
  });

  it("ignores a late text-file response after the preview switches files", async () => {
    const fileA: ItemDetail = {
      id: "file-a",
      content_type: "file",
      plain_text: "",
      file_path: "/tmp/a.txt",
      file_name: "a.txt",
      content_size: 10,
    };
    const fileB: ItemDetail = {
      ...fileA,
      id: "file-b",
      file_path: "/tmp/b.txt",
      file_name: "b.txt",
    };
    let currentDetail = fileA;
    const readA = deferred<{ content: string; truncated: boolean; total_lines: number }>();
    const readB = deferred<{ content: string; truncated: boolean; total_lines: number }>();
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "get_current_preview") {
        return Promise.resolve({ detail: currentDetail, closing: false });
      }
      if (command === "read_file_preview") {
        const path = (args as { path: string }).path;
        return path === fileA.file_path ? readA.promise : readB.promise;
      }
      if (command === "get_settings") {
        return Promise.resolve({});
      }
      return Promise.resolve(null);
    });
    render(<PreviewPage />);
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("read_file_preview", { path: fileA.file_path });
    });

    currentDetail = fileB;
    await act(() => new Promise((resolve) => setTimeout(resolve, 120)));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("read_file_preview", { path: fileB.file_path });
    });
    await act(async () => {
      readB.resolve({ content: "content from B", truncated: false, total_lines: 1 });
      await readB.promise;
    });
    expect(await screen.findByText("content from B")).toBeInTheDocument();

    await act(async () => {
      readA.resolve({ content: "late content from A", truncated: false, total_lines: 1 });
      await readA.promise;
    });

    await waitFor(() => {
      expect(screen.queryByText("late content from A")).not.toBeInTheDocument();
      expect(screen.getByText("content from B")).toBeInTheDocument();
    });
  });
});
