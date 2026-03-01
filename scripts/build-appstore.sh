#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Recopy — Mac App Store Build Script
#
# Usage:
#   ./scripts/build-appstore.sh
#   ./scripts/build-appstore.sh --sign "Apple Distribution: Your Name (TEAMID)"
#
# Prerequisites:
#   - Apple Developer Program membership
#   - Xcode command line tools installed
#   - Rust targets: rustup target add aarch64-apple-darwin x86_64-apple-darwin
#
# What this script does:
#   1. Builds universal binary (arm64 + x86_64) with app-store feature
#   2. Optionally signs with provided identity
#   3. Packages as .pkg for App Store upload
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TAURI_DIR="$PROJECT_DIR/src-tauri"

# Parse arguments
SIGN_IDENTITY=""
INSTALLER_IDENTITY=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --sign)
      SIGN_IDENTITY="$2"
      shift 2
      ;;
    --installer-sign)
      INSTALLER_IDENTITY="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--sign \"Apple Distribution: Name (TEAMID)\"] [--installer-sign \"3rd Party Mac Developer Installer: Name (TEAMID)\"]"
      exit 1
      ;;
  esac
done

# Default installer identity from app identity (common Apple convention)
if [ -n "$SIGN_IDENTITY" ] && [ -z "$INSTALLER_IDENTITY" ]; then
  INSTALLER_IDENTITY="${SIGN_IDENTITY/Apple Distribution/3rd Party Mac Developer Installer}"
fi

echo "==> Building Recopy for Mac App Store"
echo "    Project: $PROJECT_DIR"
echo "    App sign identity: ${SIGN_IDENTITY:-<none, skip signing>}"
echo "    Installer sign identity: ${INSTALLER_IDENTITY:-<none>}"
echo ""

# Step 1: Build universal binary with app-store feature (no self-update)
echo "==> Step 1: Building universal binary..."
cd "$PROJECT_DIR"
pnpm tauri build \
  --no-default-features \
  --features app-store \
  --bundles app \
  --target universal-apple-darwin \
  --config src-tauri/tauri.appstore.conf.json

APP_PATH="$TAURI_DIR/target/universal-apple-darwin/release/bundle/macos/Recopy.app"

if [ ! -d "$APP_PATH" ]; then
  echo "ERROR: Build output not found at $APP_PATH"
  exit 1
fi

echo "==> Build complete: $APP_PATH"

# Step 2: Apply entitlements and sign (if identity provided)
if [ -n "$SIGN_IDENTITY" ]; then
  echo ""
  echo "==> Step 2: Signing with entitlements..."

  # Sign helper binaries with inherit entitlements
  find "$APP_PATH/Contents/Frameworks" -name "*.dylib" -o -name "*.framework" 2>/dev/null | while read -r item; do
    codesign --force --sign "$SIGN_IDENTITY" \
      --entitlements "$TAURI_DIR/entitlements/inherit.entitlements" \
      "$item"
  done

  # Sign the main app with full entitlements
  codesign --force --sign "$SIGN_IDENTITY" \
    --entitlements "$TAURI_DIR/entitlements/app.entitlements" \
    "$APP_PATH"

  echo "==> Signed successfully"

  # Step 3: Package as .pkg
  echo ""
  echo "==> Step 3: Creating .pkg installer..."
  VERSION=$(grep '"version"' "$TAURI_DIR/tauri.conf.json" | head -1 | sed 's/.*"version": *"\(.*\)".*/\1/')
  PKG_PATH="$TAURI_DIR/target/Recopy-${VERSION}-appstore.pkg"

  if [ -n "$INSTALLER_IDENTITY" ]; then
    xcrun productbuild \
      --component "$APP_PATH" /Applications \
      --sign "$INSTALLER_IDENTITY" \
      "$PKG_PATH"
  else
    xcrun productbuild \
      --component "$APP_PATH" /Applications \
      "$PKG_PATH"
    echo "    WARNING: .pkg is unsigned (no --installer-sign provided)"
  fi

  echo "==> Package created: $PKG_PATH"
  echo ""
  echo "Upload with: xcrun altool --upload-app -f '$PKG_PATH' -t macos --apiKey <KEY> --apiIssuer <ISSUER>"
else
  echo ""
  echo "==> Skipping signing (no --sign identity provided)"
  echo "    To sign: $0 --sign \"Apple Distribution: Your Name (TEAMID)\""
fi

echo ""
echo "==> Done!"
