import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
import { useSettingsStore } from "../stores/settings-store";
import { FileText, ImageIcon, Type, File } from "lucide-react";
import type { ItemDetail } from "../lib/types";

export function PreviewPage() {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
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
      invoke<ItemDetail | null>("get_current_preview")
        .then((d) => {
          if (d && d.id !== lastIdRef.current) {
            lastIdRef.current = d.id;
            setDetail(d);
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
  }, []);

  if (loading || !detail) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-white/50 text-xs">
        {loading ? "Loading..." : "Waiting for preview data..."}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4">
      <div className="preview-content preview-enter w-full h-full flex flex-col rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 shrink-0">
          <ContentTypeIcon type={detail.content_type} />
          <span className="text-sm font-medium text-foreground/80 truncate">
            {getHeaderText(detail)}
          </span>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatSize(detail.content_size)}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <PreviewContent detail={detail} />
        </div>
      </div>
    </div>
  );
}

function PreviewContent({ detail }: { detail: ItemDetail }) {
  switch (detail.content_type) {
    case "plain_text":
      return <PlainTextPreview text={detail.plain_text} />;
    case "rich_text":
      return (
        <RichTextPreview
          html={detail.rich_content}
          fallback={detail.plain_text}
        />
      );
    case "image":
      return <ImagePreview imagePath={detail.image_path} />;
    case "file":
      return (
        <FilePreview
          filePath={detail.file_path}
          fileName={detail.file_name}
          contentSize={detail.content_size}
        />
      );
    default:
      return <PlainTextPreview text={detail.plain_text} />;
  }
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
      className="text-sm text-foreground prose prose-sm prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

function ImagePreview({ imagePath }: { imagePath?: string }) {
  const assetUrl = imagePath ? convertFileSrc(imagePath) : null;

  return (
    <div className="flex items-center justify-center h-full">
      {assetUrl ? (
        <img
          src={assetUrl}
          alt="Preview"
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon size={48} />
          <span className="text-sm">Image not available</span>
        </div>
      )}
    </div>
  );
}

function FilePreview({
  filePath,
  fileName,
  contentSize,
}: {
  filePath?: string;
  fileName?: string;
  contentSize: number;
}) {
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

// --- Helpers ---

function ContentTypeIcon({ type }: { type: string }) {
  const cls = "text-muted-foreground";
  switch (type) {
    case "plain_text":
      return <Type size={14} className={cls} />;
    case "rich_text":
      return <FileText size={14} className={cls} />;
    case "image":
      return <ImageIcon size={14} className={cls} />;
    case "file":
      return <File size={14} className={cls} />;
    default:
      return <Type size={14} className={cls} />;
  }
}

function getHeaderText(detail: ItemDetail): string {
  switch (detail.content_type) {
    case "plain_text":
      return detail.plain_text.slice(0, 80).replace(/\n/g, " ");
    case "rich_text":
      return detail.plain_text.slice(0, 80).replace(/\n/g, " ") || "Rich Text";
    case "image":
      return detail.file_name || "Clipboard Image";
    case "file":
      return detail.file_name || detail.file_path || "File";
    default:
      return "Preview";
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
