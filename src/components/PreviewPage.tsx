import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { useSettingsStore } from "../stores/settings-store";
import { ImageIcon, File } from "lucide-react";
import type { ItemDetail, PreviewResponse, FilePreviewData } from "../lib/types";

export function PreviewPage() {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const lastIdRef = useRef<string | null>(null);

  // Load theme settings
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Poll backend for current preview data every 100ms.
  // Event-based delivery doesn't work for hidden NSPanel WebViews,
  // so we use polling via invoke() which is always reliable.
  useEffect(() => {
    const poll = () => {
      invoke<PreviewResponse>("get_current_preview")
        .then((resp) => {
          // Handle closing animation signal
          if (resp.closing && !closing) {
            setClosing(true);
          } else if (!resp.closing && closing) {
            setClosing(false);
          }

          const d = resp.detail;
          if (d && d.id !== lastIdRef.current) {
            lastIdRef.current = d.id;
            setDetail(d);
            setClosing(false); // Reset closing on new content
            setLoading(false);
          } else if (!d && loading) {
            setLoading(false);
          }
        })
        .catch(() => {});
    };

    // Initial fetch
    poll();

    // Poll interval
    const timer = setInterval(poll, 100);
    return () => clearInterval(timer);
  }, [closing]);

  if (loading || !detail) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-muted-foreground text-xs">
        {loading ? "Loading..." : "Waiting for preview data..."}
      </div>
    );
  }

  return (
    <div className={`preview-content ${closing ? "preview-exit" : "preview-enter"} h-screen w-screen`}>
      <PreviewContent detail={detail} />
    </div>
  );
}

function PreviewContent({ detail }: { detail: ItemDetail }) {
  switch (detail.content_type) {
    case "plain_text":
      return <ReadableCard><PlainTextPreview text={detail.plain_text} /></ReadableCard>;
    case "rich_text":
      return (
        <ReadableCard>
          <RichTextPreview html={detail.rich_content} fallback={detail.plain_text} />
        </ReadableCard>
      );
    case "image":
      return (
        <WithTitleBar title={getTitle(detail)} size={detail.content_size}>
          <ImagePreview imagePath={detail.image_path} />
        </WithTitleBar>
      );
    case "file":
      return (
        <WithTitleBar title={getTitle(detail)} size={detail.content_size}>
          <FileContent
            filePath={detail.file_path}
            fileName={detail.file_name}
            contentSize={detail.content_size}
          />
        </WithTitleBar>
      );
    default:
      return <ReadableCard><PlainTextPreview text={detail.plain_text} /></ReadableCard>;
  }
}

/** Title bar + 3-side padded content — Quick Look style */
function WithTitleBar({ title, size, children }: { title: string; size: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col w-full h-full">
      <div className="shrink-0 flex items-center px-3 py-1.5">
        <span className="text-xs font-medium text-foreground/70 truncate flex-1">{title}</span>
        <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatSize(size)}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden px-2 pb-2 rounded-b-xl">
        {children}
      </div>
    </div>
  );
}

function getTitle(detail: ItemDetail): string {
  if (detail.file_name) return detail.file_name;
  if (detail.content_type === "image" && detail.image_path) {
    const parts = detail.image_path.split("/");
    return parts[parts.length - 1] || "Image";
  }
  if (detail.file_path) {
    const parts = detail.file_path.split("/");
    return parts[parts.length - 1] || "File";
  }
  return detail.content_type === "image" ? "Image" : "File";
}

/** Semi-transparent card for text-based content — readable against glassmorphism */
function ReadableCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full p-3">
      <div className="w-full h-full overflow-y-auto rounded-xl bg-card/60 p-4">
        {children}
      </div>
    </div>
  );
}

function PlainTextPreview({ text }: { text: string }) {
  return (
    <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
      {text}
    </pre>
  );
}

function RichTextPreview({
  html,
  fallback,
}: {
  html?: string;
  fallback: string;
}) {
  if (!html) {
    return <PlainTextPreview text={fallback} />;
  }

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "b",
      "i",
      "u",
      "strong",
      "em",
      "span",
      "div",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "a",
      "code",
      "pre",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "img",
      "sub",
      "sup",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "class", "style"],
  });

  return (
    <div
      className="text-sm text-foreground prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

function ImagePreview({ imagePath }: { imagePath?: string }) {
  const assetUrl = imagePath ? convertFileSrc(imagePath) : null;

  if (!assetUrl) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-muted-foreground">
        <ImageIcon size={48} />
        <span className="text-sm">Image not available</span>
      </div>
    );
  }

  return (
    <img
      src={assetUrl}
      alt="Preview"
      className="w-full h-full object-contain rounded-md"
    />
  );
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "js", "ts", "jsx", "tsx", "py", "rs", "css", "html", "xml",
  "yaml", "yml", "toml", "log", "csv", "sh", "bash", "zsh", "fish",
  "c", "cpp", "h", "hpp", "java", "kt", "go", "rb", "php", "swift", "sql",
  "env", "gitignore", "dockerfile", "makefile", "conf", "ini", "cfg",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"]);

function getFileExtension(path?: string, name?: string): string {
  const source = name || path || "";
  const dot = source.lastIndexOf(".");
  return dot >= 0 ? source.slice(dot + 1).toLowerCase() : "";
}

function FileContent({
  filePath,
  fileName,
  contentSize,
}: {
  filePath?: string;
  fileName?: string;
  contentSize: number;
}) {
  const ext = getFileExtension(filePath, fileName);

  if (IMAGE_EXTENSIONS.has(ext) && filePath) {
    return <ImagePreview imagePath={filePath} />;
  }

  if (TEXT_EXTENSIONS.has(ext) && filePath) {
    return <ReadableCard><TextFilePreview filePath={filePath} /></ReadableCard>;
  }

  // Fallback: file metadata display
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="w-20 h-20 rounded-2xl bg-overlay flex items-center justify-center">
        <File size={40} className="text-muted-foreground" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-medium text-foreground">
          {fileName || "Unknown file"}
        </p>
        <p className="text-sm text-muted-foreground">{formatSize(contentSize)}</p>
        {filePath && (
          <p className="text-xs text-muted-foreground/60 max-w-md truncate">
            {filePath}
          </p>
        )}
      </div>
    </div>
  );
}

function TextFilePreview({ filePath }: { filePath: string }) {
  const [data, setData] = useState<FilePreviewData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    invoke<FilePreviewData>("read_file_preview", { path: filePath })
      .then(setData)
      .catch(() => setError(true));
  }, [filePath]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        File not available
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Loading...
      </div>
    );
  }

  return (
    <div>
      <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
        {data.content}
      </pre>
      {data.truncated && (
        <p className="text-xs text-muted-foreground/60 mt-2 italic">
          Truncated ({data.total_lines} lines total)
        </p>
      )}
    </div>
  );
}

// --- Helpers ---

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
