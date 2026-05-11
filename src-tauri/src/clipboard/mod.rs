use sha2::{Digest, Sha256};
use std::io::Cursor;

/// Default max item size: 10MB
pub const DEFAULT_MAX_ITEM_SIZE_MB: usize = 10;

/// Thumbnail max width in pixels.
const THUMBNAIL_WIDTH: u32 = 400;

/// Compute SHA-256 hash of content bytes, returning hex string.
pub fn compute_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    bytes_to_lower_hex(&hasher.finalize())
}

fn bytes_to_lower_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";

    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

/// Check if content size exceeds the limit.
pub fn exceeds_size_limit(size: usize, limit_mb: usize) -> bool {
    size > limit_mb * 1024 * 1024
}

/// Generate a thumbnail from image bytes.
/// Returns (thumbnail_bytes, original_width, original_height).
/// The thumbnail is resized to THUMBNAIL_WIDTH while maintaining aspect ratio.
/// Output format is PNG.
pub fn generate_thumbnail(image_data: &[u8]) -> Result<Vec<u8>, String> {
    let img =
        image::load_from_memory(image_data).map_err(|e| format!("Failed to load image: {}", e))?;

    let (w, h) = (img.width(), img.height());

    let thumb = if w > THUMBNAIL_WIDTH {
        let new_height = (THUMBNAIL_WIDTH as f64 / w as f64 * h as f64) as u32;
        img.resize(
            THUMBNAIL_WIDTH,
            new_height,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    };

    let mut buf = Vec::new();
    thumb
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;

    Ok(buf)
}

/// Save original image to filesystem.
/// Returns the saved file path.
pub fn save_original_image(
    app_data_dir: &std::path::Path,
    image_data: &[u8],
    ext: &str,
) -> Result<String, String> {
    let now = chrono::Utc::now();
    let dir = app_data_dir
        .join("images")
        .join(now.format("%Y-%m").to_string());

    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create image dir: {}", e))?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let path = dir.join(&filename);

    std::fs::write(&path, image_data).map_err(|e| format!("Failed to write image: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_hash() {
        let hash1 = compute_hash(b"hello");
        let hash2 = compute_hash(b"hello");
        let hash3 = compute_hash(b"world");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_eq!(hash1.len(), 64); // SHA-256 hex length
        assert_eq!(
            hash1,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_exceeds_size_limit() {
        let limit_mb = DEFAULT_MAX_ITEM_SIZE_MB;
        let max_bytes = limit_mb * 1024 * 1024;
        assert!(!exceeds_size_limit(1024, limit_mb));
        assert!(!exceeds_size_limit(max_bytes, limit_mb));
        assert!(exceeds_size_limit(max_bytes + 1, limit_mb));
        // Custom limit
        assert!(!exceeds_size_limit(20 * 1024 * 1024, 20));
        assert!(exceeds_size_limit(20 * 1024 * 1024 + 1, 20));
    }

    #[test]
    fn test_generate_thumbnail() {
        // Create a simple 800x600 red image
        let img = image::RgbImage::from_fn(800, 600, |_, _| image::Rgb([255u8, 0, 0]));
        let mut buf = Vec::new();
        let dyn_img = image::DynamicImage::ImageRgb8(img);
        dyn_img
            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();

        let thumb_bytes = generate_thumbnail(&buf).unwrap();
        assert!(!thumb_bytes.is_empty());

        // Verify thumbnail dimensions
        let thumb = image::load_from_memory(&thumb_bytes).unwrap();
        assert_eq!(thumb.width(), 400);
        assert_eq!(thumb.height(), 300); // 400/800 * 600 = 300
    }

    #[test]
    fn test_thumbnail_small_image_no_resize() {
        // Create a 200x100 image (smaller than THUMBNAIL_WIDTH)
        let img = image::RgbImage::from_fn(200, 100, |_, _| image::Rgb([0u8, 255, 0]));
        let mut buf = Vec::new();
        let dyn_img = image::DynamicImage::ImageRgb8(img);
        dyn_img
            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();

        let thumb_bytes = generate_thumbnail(&buf).unwrap();
        let thumb = image::load_from_memory(&thumb_bytes).unwrap();
        // Should not be resized since it's smaller than 400px
        assert_eq!(thumb.width(), 200);
        assert_eq!(thumb.height(), 100);
    }

    #[test]
    fn test_save_original_image() {
        let temp_dir = std::env::temp_dir().join("recopy-test-images");
        let _ = std::fs::remove_dir_all(&temp_dir);

        let image_data = vec![0u8; 100];
        let path = save_original_image(&temp_dir, &image_data, "png").unwrap();

        assert!(std::path::Path::new(&path).exists());
        assert!(path.ends_with(".png"));
        assert!(path.contains("images/"));

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_generate_thumbnail_invalid_data() {
        let invalid_bytes = b"this is not an image";
        let result = generate_thumbnail(invalid_bytes);
        assert!(result.is_err());
    }

    #[test]
    fn test_generate_thumbnail_empty_data() {
        let empty_bytes: &[u8] = b"";
        let result = generate_thumbnail(empty_bytes);
        assert!(result.is_err());
    }

    #[test]
    fn test_compute_hash_empty() {
        let hash1 = compute_hash(b"");
        let hash2 = compute_hash(b"");
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64);
        assert_eq!(
            hash1,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_compute_hash_large_input() {
        let large_data = vec![0xABu8; 10 * 1024 * 1024];
        let hash1 = compute_hash(&large_data);
        let hash2 = compute_hash(&large_data);
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_exceeds_size_limit_boundary() {
        let limit_mb = 10;
        let exact_boundary = limit_mb * 1024 * 1024;
        assert!(!exceeds_size_limit(exact_boundary, limit_mb));
        assert!(exceeds_size_limit(exact_boundary + 1, limit_mb));
        assert!(!exceeds_size_limit(exact_boundary - 1, limit_mb));

        let limit_mb_1 = 1;
        let boundary_1 = limit_mb_1 * 1024 * 1024;
        assert!(!exceeds_size_limit(boundary_1, limit_mb_1));
        assert!(exceeds_size_limit(boundary_1 + 1, limit_mb_1));
    }
}
