import { useTranslation } from "react-i18next";
import type { ClipboardItem } from "../lib/types";
import { relativeTime, formatSize } from "../lib/time";
import { createPressActionHandlers } from "../lib/press-action";
import { Star, File, FileArchive, FileImage, FileCode, FileText } from "lucide-react";
import { useThumbnail } from "../hooks/useThumbnail";

interface FileCardProps {
  item: ClipboardItem;
  selected: boolean;
  onClick: () => void;
}

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "tiff",
  "tif",
]);

export function FileCard({ item, selected, onClick }: FileCardProps) {
  const { t } = useTranslation();
  const pressHandlers = createPressActionHandlers<HTMLDivElement>(onClick, {
    enableKeyboardHandler: true,
  });
  const fileName = item.file_name || item.file_path || t("card.unknownFile");
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  // Only fetch thumbnail for image files
  const isImageFile = IMAGE_EXTS.has(ext);
  const thumbnailUrl = useThumbnail(isImageFile ? item.id : null);

  return (
    <div
      role="button"
      tabIndex={0}
      {...pressHandlers}
      className={`relative flex flex-col gap-1.5 rounded-lg border p-2.5 cursor-pointer transition-colors h-full overflow-hidden
        ${selected ? "border-primary bg-selected" : "border-border/50 bg-card/60 hover:border-muted-foreground/30 hover:bg-card/80"}`}
    >
      {item.is_favorited && (
        <Star
          className="absolute top-2 right-2 text-yellow-500 z-10"
          size={14}
          fill="currentColor"
        />
      )}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <File size={13} />
        <span className="text-sm">{t("card.file")}</span>
        {thumbnailUrl && <span className="text-sm ml-auto">{formatSize(item.content_size)}</span>}
      </div>
      {thumbnailUrl ? (
        <>
          <div className="flex items-center justify-center rounded-md bg-muted/30 overflow-hidden flex-1 min-h-0">
            <img
              src={thumbnailUrl}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div className="text-sm text-muted-foreground truncate" title={fileName}>
            {fileName}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 py-2">
          <FileIcon ext={ext} />
          <div className="min-w-0">
            <p className="text-sm text-foreground truncate" title={fileName}>
              {fileName}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatSize(item.content_size)}
              {ext && ` \u00B7 .${ext}`}
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end text-sm text-muted-foreground mt-auto pt-1.5">
        <span>{relativeTime(item.updated_at)}</span>
      </div>
    </div>
  );
}

const IMAGE_EXT_LIST = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"];
const CODE_EXT_LIST = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rs",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "css",
  "html",
  "json",
  "yaml",
  "yml",
  "toml",
];
const ARCHIVE_EXT_LIST = ["zip", "tar", "gz", "rar", "7z", "bz2"];
const TEXT_EXT_LIST = ["txt", "md", "doc", "docx", "pdf", "rtf"];

function FileIcon({ ext }: { ext: string }) {
  const props = { size: 28, className: "text-primary shrink-0" };
  if (IMAGE_EXT_LIST.includes(ext)) return <FileImage {...props} />;
  if (CODE_EXT_LIST.includes(ext)) return <FileCode {...props} />;
  if (ARCHIVE_EXT_LIST.includes(ext)) return <FileArchive {...props} />;
  if (TEXT_EXT_LIST.includes(ext)) return <FileText {...props} />;
  return <File {...props} />;
}
