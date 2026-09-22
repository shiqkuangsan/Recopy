import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "../NoteEditor";
import { useNoteEditorStore } from "../../stores/note-editor-store";
import { useClipboardStore } from "../../stores/clipboard-store";

const save = vi.fn();
beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined);
  useNoteEditorStore.setState({ editing: null, prompt: null });
  useClipboardStore.setState({ updateNoteTitle: save });
});
afterEach(() => vi.useRealTimers());
const open = () => {
  useNoteEditorStore.getState().open({ id: "account", note_title: "VPN" });
  render(<NoteEditor />);
  return screen.getByRole("textbox");
};

describe("NoteEditor", () => {
  it("offers an optional hint and focuses the editor only after opting in", () => {
    useNoteEditorStore.getState().offer({ id: "account" });
    render(<NoteEditor />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(screen.getByRole("textbox")).toHaveFocus();
  });
  it("saves a trimmed name and closes after persistence", async () => {
    const input = open();
    fireEvent.change(input, { target: { value: "  工作账号  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledExactlyOnceWith("account", "工作账号");
  });
  it("retains the draft when saving fails and supports clearing the name", async () => {
    save.mockRejectedValueOnce(new Error("unavailable"));
    const input = open();
    fireEvent.change(input, { target: { value: "New name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(input).toHaveValue("New name");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith("account", ""));
  });
  it("blocks IME submission, oversized names and duplicate pending saves", async () => {
    let resolve!: () => void;
    save.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const input = open();
    fireEvent.compositionStart(input);
    fireEvent.submit(input.closest("form")!);
    expect(save).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: "名".repeat(81) } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "😀".repeat(80) } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => resolve());
  });
  it("closes on Escape without saving", () => {
    const input = open();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("starts a fresh expiry timer after replacing a hovered hint", () => {
    vi.useFakeTimers();
    useNoteEditorStore.getState().offer({ id: "first" });
    render(<NoteEditor />);
    fireEvent.mouseEnter(screen.getByRole("status"));
    act(() => useNoteEditorStore.getState().offer({ id: "second" }));
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
