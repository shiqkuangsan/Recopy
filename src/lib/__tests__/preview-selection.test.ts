import { describe, expect, it } from "vitest";
import {
  createPreviewSelection,
  emptyPreviewSelection,
  getValidPreviewSelectionText,
  PREVIEW_SELECTION_CLEAR_EVENT,
  PREVIEW_SELECTION_CHANGED_EVENT,
} from "../preview-selection";

describe("preview selection contract", () => {
  it("uses a non-empty selection for the active preview item", () => {
    expect(
      getValidPreviewSelectionText(true, "item-1", {
        itemId: "item-1",
        text: "selected text",
        sequence: 1,
        generation: 1,
      }),
    ).toBe("selected text");
  });

  it("preserves whitespace and line breaks exactly", () => {
    const text = "  first line\nsecond line  ";

    expect(
      getValidPreviewSelectionText(true, "item-1", {
        itemId: "item-1",
        text,
        sequence: 1,
        generation: 1,
      }),
    ).toBe(text);
  });

  it.each([
    { label: "the preview is closed", open: false, itemId: "item-1", text: "selected" },
    { label: "the selection is stale", open: true, itemId: "item-2", text: "selected" },
    { label: "the selection is empty", open: true, itemId: "item-1", text: "" },
  ])("returns null when $label", ({ open, itemId, text }) => {
    expect(
      getValidPreviewSelectionText(open, "item-1", {
        itemId,
        text,
        sequence: 1,
        generation: 1,
      }),
    ).toBeNull();
  });

  it("creates an empty payload for a specific item", () => {
    const empty = emptyPreviewSelection("item-1", 7);

    expect(empty).toMatchObject({ itemId: "item-1", text: "", generation: 7 });
    expect(empty.sequence).toEqual(expect.any(Number));
    expect(PREVIEW_SELECTION_CHANGED_EVENT).toBe("preview-selection-changed");
    expect(PREVIEW_SELECTION_CLEAR_EVENT).toBe("preview-selection-clear");
  });

  it("assigns monotonically increasing sequence numbers", () => {
    const first = createPreviewSelection("item-1", "first", 7);
    const second = createPreviewSelection("item-2", "second", 7);

    expect(second.sequence).toBeGreaterThan(first.sequence);
  });
});
