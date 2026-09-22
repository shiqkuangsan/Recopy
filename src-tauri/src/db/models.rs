use serde::{Deserialize, Serialize};

/// Content type of a clipboard item.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ContentType {
    PlainText,
    RichText,
    Image,
    File,
    Link,
}

impl ContentType {
    pub fn as_str(&self) -> &str {
        match self {
            ContentType::PlainText => "plain_text",
            ContentType::RichText => "rich_text",
            ContentType::Image => "image",
            ContentType::File => "file",
            ContentType::Link => "link",
        }
    }

    #[allow(dead_code)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "plain_text" => Some(ContentType::PlainText),
            "rich_text" => Some(ContentType::RichText),
            "image" => Some(ContentType::Image),
            "file" => Some(ContentType::File),
            "link" => Some(ContentType::Link),
            _ => None,
        }
    }
}

/// A clipboard item stored in the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub note_title: String,
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
    pub note_title: String,
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

impl PreviewState {
    /// Clipboard content is immutable for an ID; callers keep their last detail.
    pub fn snapshot(&self, known_id: Option<&str>, closing: bool) -> PreviewResponse {
        let state = self.0.lock().unwrap();
        PreviewResponse {
            detail: state
                .as_ref()
                .filter(|item| Some(item.id.as_str()) != known_id)
                .cloned(),
            closing,
            note_title: state.as_ref().map(|item| item.note_title.clone()),
        }
    }
}

/// Atomic flag: true while preview exit animation is playing.
pub struct PreviewClosing(pub std::sync::atomic::AtomicBool);

/// Response from get_current_preview: item detail + closing animation flag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewResponse {
    pub detail: Option<ItemDetail>,
    pub closing: bool,
    pub note_title: Option<String>,
}

/// Data returned by read_file_preview command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePreviewData {
    pub content: String,
    pub truncated: bool,
    pub total_lines: usize,
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_poll_omits_unchanged_content_but_keeps_closing_signal() {
        let state = PreviewState(std::sync::Mutex::new(Some(ItemDetail {
            id: "large".into(),
            note_title: String::new(),
            content_type: "plain_text".into(),
            plain_text: "x".repeat(1024 * 1024),
            rich_content: None,
            image_path: None,
            file_path: None,
            file_name: None,
            content_size: 1024 * 1024,
        })));
        assert!(state.snapshot(None, false).detail.is_some());
        assert!(state.snapshot(Some("other"), false).detail.is_some());
        for _ in 0..100 {
            let response = state.snapshot(Some("large"), true);
            assert!(response.detail.is_none());
            assert!(response.closing);
            assert!(serde_json::to_vec(&response).unwrap().len() < 64);
        }
        assert!(!state.snapshot(Some("large"), false).closing);
    }

    #[test]
    fn preview_poll_sends_changed_note_without_resending_unchanged_content() {
        let state = PreviewState(std::sync::Mutex::new(Some(ItemDetail {
            id: "note-item".into(),
            note_title: "Original".into(),
            content_type: "plain_text".into(),
            plain_text: "82719406".into(),
            rich_content: None,
            image_path: None,
            file_path: None,
            file_name: None,
            content_size: 8,
        })));
        state.0.lock().unwrap().as_mut().unwrap().note_title = "Company VPN".into();
        let response = state.snapshot(Some("note-item"), false);
        assert!(response.detail.is_none());
        assert_eq!(response.note_title.as_deref(), Some("Company VPN"));
    }

    #[test]
    fn test_content_type_as_str() {
        assert_eq!(ContentType::PlainText.as_str(), "plain_text");
        assert_eq!(ContentType::RichText.as_str(), "rich_text");
        assert_eq!(ContentType::Image.as_str(), "image");
        assert_eq!(ContentType::File.as_str(), "file");
        assert_eq!(ContentType::Link.as_str(), "link");
    }

    #[test]
    fn test_content_type_from_str() {
        assert_eq!(
            ContentType::from_str("plain_text"),
            Some(ContentType::PlainText)
        );
        assert_eq!(
            ContentType::from_str("rich_text"),
            Some(ContentType::RichText)
        );
        assert_eq!(ContentType::from_str("image"), Some(ContentType::Image));
        assert_eq!(ContentType::from_str("file"), Some(ContentType::File));
        assert_eq!(ContentType::from_str("link"), Some(ContentType::Link));
    }

    #[test]
    fn test_content_type_from_str_invalid() {
        assert_eq!(ContentType::from_str(""), None);
        assert_eq!(ContentType::from_str("unknown"), None);
        assert_eq!(ContentType::from_str("PlainText"), None);
        assert_eq!(ContentType::from_str("PLAIN_TEXT"), None);
    }

    #[test]
    fn test_content_type_roundtrip() {
        let variants = vec![
            ContentType::PlainText,
            ContentType::RichText,
            ContentType::Image,
            ContentType::File,
            ContentType::Link,
        ];

        for variant in variants {
            let s = variant.as_str();
            let recovered = ContentType::from_str(s);
            assert_eq!(recovered, Some(variant));
        }
    }

    #[test]
    fn test_content_type_serde_roundtrip() {
        let variants = vec![
            ContentType::PlainText,
            ContentType::RichText,
            ContentType::Image,
            ContentType::File,
            ContentType::Link,
        ];

        for variant in &variants {
            let json = serde_json::to_string(variant).unwrap();
            let deserialized: ContentType = serde_json::from_str(&json).unwrap();
            assert_eq!(&deserialized, variant);
        }
    }

    #[test]
    fn test_content_type_serde_snake_case() {
        // Verify serde(rename_all = "snake_case") produces expected JSON strings
        assert_eq!(
            serde_json::to_string(&ContentType::PlainText).unwrap(),
            "\"plain_text\""
        );
        assert_eq!(
            serde_json::to_string(&ContentType::RichText).unwrap(),
            "\"rich_text\""
        );
        assert_eq!(
            serde_json::to_string(&ContentType::Image).unwrap(),
            "\"image\""
        );
        assert_eq!(
            serde_json::to_string(&ContentType::File).unwrap(),
            "\"file\""
        );
        assert_eq!(
            serde_json::to_string(&ContentType::Link).unwrap(),
            "\"link\""
        );
    }
}
