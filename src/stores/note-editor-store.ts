import { create } from "zustand";

export interface NoteTarget {
  id: string;
  note_title?: string;
}

interface NoteEditorState {
  editing: NoteTarget | null;
  prompt: NoteTarget | null;
  open: (item: NoteTarget) => void;
  close: () => void;
  offer: (item: NoteTarget) => void;
  dismissPrompt: () => void;
}

export const useNoteEditorStore = create<NoteEditorState>((set) => ({
  editing: null,
  prompt: null,
  open: (item) => set({ editing: { ...item }, prompt: null }),
  close: () => set({ editing: null }),
  offer: (item) => set({ prompt: item.note_title ? null : { ...item } }),
  dismissPrompt: () => set({ prompt: null }),
}));
