#!/usr/bin/env bash
# Bump the version across Recopy's manifest files.
# Cargo.lock is refreshed by the Cargo verification step after this script.
# Usage: ./scripts/bump-version.sh <version>
# Example: ./scripts/bump-version.sh 0.2.0

set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: Invalid semver format. Expected: X.Y.Z or X.Y.Z-suffix"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Bumping version to $VERSION ..."

# 1. package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"
echo "  ✓ package.json"

# 2. src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"
echo "  ✓ src-tauri/tauri.conf.json"

# 3. src-tauri/Cargo.toml (only the package version under [package], first match)
awk -v ver="$VERSION" '
  !done && /^version = "/ { sub(/"[^"]*"/, "\"" ver "\""); done=1 }
  { print }
' "$ROOT/src-tauri/Cargo.toml" > "$ROOT/src-tauri/Cargo.toml.tmp"
mv "$ROOT/src-tauri/Cargo.toml.tmp" "$ROOT/src-tauri/Cargo.toml"
echo "  ✓ src-tauri/Cargo.toml"

echo ""
echo "Done! Version updated to $VERSION in manifest files."
echo ""
echo "Next steps:"
echo "  (cd src-tauri && cargo test)  # refresh and verify Cargo.lock"
echo "  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock"
echo "  git commit -m \"chore: bump version to $VERSION\""
echo "  git push origin main"
echo "  git tag v$VERSION"
echo "  git push origin v$VERSION"
