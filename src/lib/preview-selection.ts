export const PREVIEW_SELECTION_CHANGED_EVENT = "preview-selection-changed";
export const PREVIEW_SELECTION_CLEAR_EVENT = "preview-selection-clear";
export const PREVIEW_SELECTION_READY_EVENT = "preview-selection-ready";

let previewSelectionSequence = 0;

export interface PreviewSelectionPayload {
  itemId: string;
  text: string;
  sequence: number;
  generation: number;
}

export interface PreviewSelectionClearPayload {
  generation: number;
}

export function createPreviewSelection(
  itemId: string,
  text: string,
  generation: number,
): PreviewSelectionPayload {
  previewSelectionSequence += 1;
  return { itemId, text, sequence: previewSelectionSequence, generation };
}

export function emptyPreviewSelection(itemId: string, generation: number): PreviewSelectionPayload {
  return createPreviewSelection(itemId, "", generation);
}

export function getValidPreviewSelectionText(
  previewOpen: boolean,
  activeItemId: string | undefined,
  selection: PreviewSelectionPayload | null,
): string | null {
  if (
    !previewOpen ||
    !activeItemId ||
    !selection ||
    selection.itemId !== activeItemId ||
    selection.text.length === 0
  ) {
    return null;
  }

  return selection.text;
}
