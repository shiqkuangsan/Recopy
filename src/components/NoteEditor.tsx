import { useEffect, useId, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useNoteEditorStore, type NoteTarget } from "../stores/note-editor-store";
import { useClipboardStore } from "../stores/clipboard-store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

export function NoteEditor() {
  const editing = useNoteEditorStore((s) => s.editing);
  const prompt = useNoteEditorStore((s) => s.prompt);
  useEffect(() => {
    const unlisten = listen("recopy-hide", () => {
      // Keep an unfinished edit on temporary OS-level dismissal, but drop the hint.
      useNoteEditorStore.getState().dismissPrompt();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <>
      {prompt && !editing && <FavoriteNoteHint key={prompt.id} prompt={prompt} />}
      {editing && <NoteEditorDialog key={editing.id} item={editing} />}
    </>
  );
}

function FavoriteNoteHint({ prompt }: { prompt: NoteTarget }) {
  const { t } = useTranslation();
  const [promptHeld, setPromptHeld] = useState(false);
  useEffect(() => {
    if (promptHeld) return;
    const timer = setTimeout(() => useNoteEditorStore.getState().dismissPrompt(), 8000);
    return () => clearTimeout(timer);
  }, [promptHeld]);
  return (
    <div
      role="status"
      className="fixed bottom-3 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
      onMouseEnter={() => setPromptHeld(true)}
      onMouseLeave={() => setPromptHeld(false)}
      onFocus={() => setPromptHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPromptHeld(false);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="whitespace-nowrap">{t("note.favorited")}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => useNoteEditorStore.getState().open(prompt)}
      >
        {t("note.add")}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("note.dismiss")}
        onClick={() => useNoteEditorStore.getState().dismissPrompt()}
      >
        <X size={12} />
      </Button>
    </div>
  );
}

function NoteEditorDialog({ item }: { item: NoteTarget }) {
  const { t } = useTranslation();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(item.note_title ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const trimmed = draft.trim();
  const invalid = Array.from(trimmed).length > 80 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(trimmed);
  const close = () => {
    if (!savingRef.current) useNoteEditorStore.getState().close();
  };

  const save = async () => {
    if (invalid || composingRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await useClipboardStore.getState().updateNoteTitle(item.id, trimmed);
      if (useNoteEditorStore.getState().editing?.id === item.id)
        useNoteEditorStore.getState().close();
    } catch {
      setError(t("note.saveFailed"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const card = Array.from(
            document.querySelectorAll<HTMLElement>("[data-note-item-id]"),
          ).find((element) => element.dataset.noteItemId === item.id);
          card?.querySelector<HTMLElement>('[role="button"]')?.focus();
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (savingRef.current || composingRef.current || e.isComposing || e.keyCode === 229)
            e.preventDefault();
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (
            e.key === "Enter" &&
            (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229)
          )
            e.preventDefault();
        }}
      >
        <DialogTitle className="text-base font-semibold">
          {item.note_title ? t("note.edit") : t("note.add")}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {t("note.description")}
        </DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              {t("note.label")}
            </label>
            <Input
              id={id}
              ref={inputRef}
              value={draft}
              disabled={saving}
              aria-invalid={invalid || !!error}
              aria-describedby={`${id}-help`}
              autoComplete="off"
              placeholder={t("note.placeholder")}
              onChange={(e) => {
                setDraft(e.target.value);
                setError("");
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
            />
            <p id={`${id}-help`} className="text-xs text-muted-foreground">
              {invalid ? t("note.invalid") : t("note.hint")}
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={close}>
              {t("note.cancel")}
            </Button>
            <Button type="submit" disabled={saving || invalid}>
              {saving ? t("note.saving") : t("note.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
