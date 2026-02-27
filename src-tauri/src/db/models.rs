use serde::{Deserialize, Serialize};

/// Content type of a clipboard item.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ContentType {
    PlainText,
    RichText,
    Image,
    File,
}

impl ContentType {
    pub fn as_str(&self) -> &str {
        match self {
            ContentType::PlainText => "plain_text",
            ContentType::RichText => "rich_text",
            ContentType::Image => "image",
            ContentType::File => "file",
        }
    }

    #[allow(dead_code)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "plain_text" => Some(ContentType::PlainText),
            "rich_text" => Some(ContentType::RichText),
            "image" => Some(ContentType::Image),
            "file" => Some(ContentType::File),
            _ => None,
        }
    }
}

/// A clipboard item stored in the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub content_type: String,
    pub plain_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    pub source_app: String,
    pub source_app_name: String,
    pub content_size: i64,
    pub content_hash: String,
    pub is_favorited: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Full item detail returned for preview (includes rich_content as string).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemDetail {
    pub id: String,
    pub content_type: String,
    pub plain_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rich_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    pub content_size: i64,
}

/// Shared state holding the current preview item detail.
pub struct PreviewState(pub std::sync::Mutex<Option<ItemDetail>>);

/// Payload for inserting a new clipboard item.
pub struct NewClipboardItem {
    pub content_type: ContentType,
    pub plain_text: String,
    pub rich_content: Option<Vec<u8>>,
    pub thumbnail: Option<Vec<u8>>,
    pub image_path: Option<String>,
    pub file_path: Option<String>,
    pub file_name: Option<String>,
    pub source_app: String,
    pub source_app_name: String,
    pub content_size: i64,
    pub content_hash: String,
}
