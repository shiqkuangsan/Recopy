export type ContentType = "plain_text" | "rich_text" | "image" | "file";

export interface ClipboardItem {
  id: string;
  content_type: ContentType;
  plain_text: string;
  thumbnail?: number[];
  image_path?: string;
  file_path?: string;
  file_name?: string;
  source_app: string;
  source_app_name: string;
  content_size: number;
  content_hash: string;
  is_favorited: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemDetail {
  id: string;
  content_type: ContentType;
  plain_text: string;
  rich_content?: string;
  image_path?: string;
  file_path?: string;
  file_name?: string;
  content_size: number;
}

export type ViewMode = "history" | "pins";
export type FilterType = "all" | "plain_text" | "rich_text" | "image" | "file";
