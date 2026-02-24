import { useTranslation } from "react-i18next";
import type { ClipboardItem } from "../lib/types";
import { relativeTime, formatSize } from "../lib/time";
import { createPressActionHandlers } from "../lib/press-action";
import { Star, File, FileArchive, FileImage, FileCode, FileText } from "lucide-react";

interface FileCardProps {
  item: ClipboardItem;
  selected: boolean;
  onClick: () => void;
}

export function FileCard({ item, selected, onClick }: FileCardProps) {
  const { t } = useTranslation();
  const pressHandlers = createPressActionHandlers<HTMLDivElement>(onClick, {
    enableKeyboardHandler: true,
  });
  const fileName = item.file_name || item.file_path || t("card.unknownFile");
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const IconComponent = getFileIcon(ext);

  return (
    <div
      role="button"
      tabIndex={0}
      {...pressHandlers}
      className={`relative flex flex-col gap-1.5 rounded-lg border p-2.5 cursor-pointer transition-colors h-full overflow-hidden
        ${selected ? "border-accent bg-accent/10" : "border-border/50 bg-card/60 hover:border-muted-foreground/30 hover:bg-card/80"}`}
    >
      {item.is_favorited && (
        <Star
          className="absolute top-2 right-2 text-yellow-500"
          size={14}
          fill="currentColor"
        />
      )}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <File size={12} />
        <span className="text-xs">{t("card.file")}</span>
      </div>
      <div className="flex items-center gap-3 py-2">
        <IconComponent size={28} className="text-accent shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate" title={fileName}>
            {fileName}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatSize(item.content_size)}
            {ext && ` \u00B7 .${ext}`}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-1.5">
        <span>{item.source_app_name || t("card.unknown")}</span>
        <span>{relativeTime(item.updated_at)}</span>
      </div>
    </div>
  );
}

function getFileIcon(ext: string) {
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"];
  const codeExts = ["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "css", "html", "json", "yaml", "yml", "toml"];
  const archiveExts = ["zip", "tar", "gz", "rar", "7z", "bz2"];

  if (imageExts.includes(ext)) return FileImage;
  if (codeExts.includes(ext)) return FileCode;
  if (archiveExts.includes(ext)) return FileArchive;
  if (["txt", "md", "doc", "docx", "pdf", "rtf"].includes(ext)) return FileText;
  return File;
}
