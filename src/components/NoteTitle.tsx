import { cn } from "../lib/utils";

export function NoteTitle({ title, expanded = false }: { title?: string; expanded?: boolean }) {
  if (!title) return null;
  return (
    <div className="min-w-0 shrink-0 border-b border-muted-foreground/35 pt-1 pb-2 mb-1">
      <div
        className={cn(
          "text-[15px] font-semibold leading-6 tracking-tight text-foreground",
          expanded ? "break-words" : "truncate",
        )}
        title={title}
      >
        {title}
      </div>
    </div>
  );
}
