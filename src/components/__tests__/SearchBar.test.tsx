import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useSearchHistoryStore } from "../../stores/search-history-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";
import { listen } from "@tauri-apps/api/event";
import { SearchBar } from "../SearchBar";
import { useClipboardStore } from "../../stores/clipboard-store";

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useSearchHistoryStore.getState().clear();
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, search_history_enabled: "true" },
  }));
  useClipboardStore.setState({
    items: [],
    loading: false,
    searchQuery: "",
    filterType: "all",
    viewMode: "history",
    selectedIndex: 0,
    hasMore: true,
    isFetchingMore: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("SearchBar", () => {
  it("should render input element", () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search clipboard history...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
  });

  it("should render placeholder text correctly", () => {
    render(<SearchBar />);
    expect(screen.getByPlaceholderText("Search clipboard history...")).toBeInTheDocument();
  });

  it("uses opaque high-contrast chrome colors", () => {
    const { container } = render(<SearchBar />);

    expect(screen.getByPlaceholderText("Search clipboard history...")).toHaveClass(
      "text-zinc-950",
      "dark:text-zinc-50",
      "placeholder:text-zinc-600",
      "dark:placeholder:text-zinc-300",
    );
    const searchIcon = container.querySelector(".lucide-search");
    expect(searchIcon).not.toBeNull();
    expect(searchIcon!).toHaveClass("text-zinc-700", "dark:text-zinc-300");
  });

  it("should update search query on input change", () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search clipboard history...");

    fireEvent.change(input, { target: { value: "hello" } });

    expect(useClipboardStore.getState().searchQuery).toBe("hello");
  });

  it("should trigger search after debounce on input change", async () => {
    mockedInvoke.mockResolvedValue([]);
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search clipboard history...");

    fireEvent.change(input, { target: { value: "test query" } });

    expect(mockedInvoke).not.toHaveBeenCalledWith("search_clipboard_items", expect.anything());

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockedInvoke).toHaveBeenCalledWith(
      "search_clipboard_items",
      expect.objectContaining({ query: "test query" }),
    );
  });

  it("should fetch items when input is cleared via typing", async () => {
    mockedInvoke.mockResolvedValue([]);
    useClipboardStore.setState({ searchQuery: "something" });

    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search clipboard history...");

    fireEvent.change(input, { target: { value: "" } });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockedInvoke).toHaveBeenCalledWith(
      "get_clipboard_items",
      expect.objectContaining({ limit: 500, offset: 0 }),
    );
  });

  it("should not trigger search during IME composition", async () => {
    mockedInvoke.mockResolvedValue([]);
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search clipboard history...");

    fireEvent.compositionStart(input);

    fireEvent.change(input, { target: { value: "zhon" } });
    fireEvent.change(input, { target: { value: "zhong" } });
    fireEvent.change(input, { target: { value: "zhongw" } });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockedInvoke).not.toHaveBeenCalledWith("search_clipboard_items", expect.anything());
  });

  it("should trigger search on compositionEnd", async () => {
    mockedInvoke.mockResolvedValue([]);
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search clipboard history...");

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "zhongwen" } });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(mockedInvoke).not.toHaveBeenCalledWith("search_clipboard_items", expect.anything());

    fireEvent.compositionEnd(input, { data: "中文" });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockedInvoke).toHaveBeenCalledWith("search_clipboard_items", expect.anything());
  });

  it("should resume normal search after IME composition ends", async () => {
    mockedInvoke.mockResolvedValue([]);
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search clipboard history...");

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "pinyin" } });
    fireEvent.compositionEnd(input, { data: "拼音" });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    vi.clearAllMocks();

    fireEvent.change(input, { target: { value: "normal text" } });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockedInvoke).toHaveBeenCalledWith(
      "search_clipboard_items",
      expect.objectContaining({ query: "normal text" }),
    );
  });

  it("should show clear button when input has text", () => {
    useClipboardStore.setState({ searchQuery: "hello" });
    render(<SearchBar />);

    const clearButton = screen.getByRole("button");
    expect(clearButton).toBeInTheDocument();
  });

  it("should not show clear button when input is empty", () => {
    useClipboardStore.setState({ searchQuery: "" });
    render(<SearchBar />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should not show clear button when input is whitespace only", () => {
    useClipboardStore.setState({ searchQuery: "   " });
    render(<SearchBar />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should clear input and fetch items when clear button is clicked", async () => {
    mockedInvoke.mockResolvedValue([]);
    useClipboardStore.setState({ searchQuery: "some query" });

    render(<SearchBar />);
    const clearButton = screen.getByRole("button");

    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(useClipboardStore.getState().searchQuery).toBe("");
    expect(mockedInvoke).toHaveBeenCalledWith(
      "get_clipboard_items",
      expect.objectContaining({ limit: 500, offset: 0 }),
    );
  });

  it("should fetch favorites on clear when in pins mode", async () => {
    mockedInvoke.mockResolvedValue([]);
    useClipboardStore.setState({ searchQuery: "query", viewMode: "pins" });

    render(<SearchBar />);
    const clearButton = screen.getByRole("button");

    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(mockedInvoke).toHaveBeenCalledWith(
      "get_favorited_items",
      expect.objectContaining({ limit: 500, offset: 0 }),
    );
  });

  it("should debounce rapid input changes", async () => {
    mockedInvoke.mockResolvedValue([]);
    render(<SearchBar />);
    const input = screen.getByPlaceholderText("Search clipboard history...");

    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.change(input, { target: { value: "abc" } });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    const searchCalls = mockedInvoke.mock.calls.filter(([cmd]) => cmd === "search_clipboard_items");
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]).toEqual([
      "search_clipboard_items",
      expect.objectContaining({ query: "abc" }),
    ]);
  });
});

function SearchWithKeyboard() {
  useKeyboardNav();
  return <SearchBar />;
}

describe("recent search interactions", () => {
  beforeEach(() => {
    mockedInvoke.mockResolvedValue([]);
    useSearchHistoryStore.setState({ entries: ["order", "invoice"] });
  });

  it("opens only on focus and selects history without invoking paste", async () => {
    render(<SearchWithKeyboard />);
    expect(screen.queryByText("Recent searches")).not.toBeInTheDocument();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    expect(screen.getByText("Recent searches")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(input).toHaveValue("order");
    expect(mockedInvoke).toHaveBeenCalledWith(
      "search_clipboard_items",
      expect.objectContaining({ query: "order" }),
    );
    expect(mockedInvoke.mock.calls.some(([cmd]) => cmd === "paste_clipboard_item")).toBe(false);
    expect(screen.queryByText("Recent searches")).not.toBeInTheDocument();
  });

  it("Escape closes the popup before blurring the input or hiding the panel", async () => {
    render(<SearchWithKeyboard />);
    const input = screen.getByRole("combobox");
    act(() => {
      input.focus();
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(screen.queryByText("Recent searches")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(mockedInvoke).not.toHaveBeenCalledWith("hide_window");
  });

  it("does not intercept Enter until a history entry is selected", async () => {
    useClipboardStore.setState({ items: [{ id: "clip-1", updated_at: "2026-09-23" } as never] });
    render(<SearchWithKeyboard />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(mockedInvoke).toHaveBeenCalledWith("paste_clipboard_item", {
      id: "clip-1",
      autoPaste: true,
    });
  });

  it("removes one entry and clears all without applying a query", () => {
    render(<SearchBar />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByLabelText("Remove search: order"));
    expect(useSearchHistoryStore.getState().entries).toEqual(["invoice"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    expect(useSearchHistoryStore.getState().entries).toEqual([]);
    expect(useClipboardStore.getState().searchQuery).toBe("");
  });

  it("records the completed Chinese query on blur, not IME composition", async () => {
    render(<SearchBar />);
    const input = screen.getByRole("combobox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ding" } });
    fireEvent.blur(input);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(useSearchHistoryStore.getState().entries).toEqual(["order", "invoice"]);
    fireEvent.change(input, { target: { value: "订单" } });
    fireEvent.compositionEnd(input);
    fireEvent.blur(input);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(useSearchHistoryStore.getState().entries).toEqual(["订单", "order", "invoice"]);
  });

  it("cannot run a stale debounce after the search is cleared", async () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "old" } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Clear search"));
      vi.advanceTimersByTime(200);
    });
    expect(mockedInvoke.mock.calls.some(([cmd]) => cmd === "search_clipboard_items")).toBe(false);
    expect(useClipboardStore.getState().searchQuery).toBe("");
  });

  it("does not show history while disabled", () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, search_history_enabled: "false" },
    }));
    render(<SearchBar />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.queryByText("Recent searches")).not.toBeInTheDocument();
  });

  it("saves the executed query and dismisses history when the panel hides", async () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "new search" } });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    const handler = vi.mocked(listen).mock.calls.find(([event]) => event === "recopy-hide")![1];
    act(() => {
      handler({ payload: undefined } as never);
    });
    expect(useSearchHistoryStore.getState().entries[0]).toBe("new search");
    expect(useClipboardStore.getState().searchQuery).toBe("new search");
  });
});
