#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_DIR="$(mktemp -d /tmp/recopy-release-tooling-test.XXXXXX)"
trap 'rm -r "$TMP_DIR"' EXIT

TAG="v9.8.7"
VERSION="${TAG#v}"
GITHUB_ASSET_API_PREFIX="https://api.github.com/repos/shiqkuangsan/Recopy/releases/assets/"
GITHUB_DOWNLOAD_PREFIX="https://github.com/shiqkuangsan/Recopy/releases/download/${TAG}/"
GITEE_DOWNLOAD_PREFIX="https://gitee.com/shiqkuangsan/Recopy/releases/download/${TAG}/"
NORMALIZE_FILTER="$ROOT/scripts/lib/normalize-updater.jq"

fail() {
  echo "release-tooling test failed: $*" >&2
  exit 1
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  [[ "$actual" == "$expected" ]] || fail "$message (expected=$expected actual=$actual)"
}

assert_fails() {
  local message="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    fail "$message"
  fi
}

EXPECTED_PLATFORM_ASSETS="$(jq -cn --arg version "$VERSION" '
  {
    "darwin-aarch64": ("Recopy_" + $version + "_aarch64.app.tar.gz"),
    "darwin-aarch64-app": ("Recopy_" + $version + "_aarch64.app.tar.gz"),
    "darwin-x86_64": ("Recopy_" + $version + "_x64.app.tar.gz"),
    "darwin-x86_64-app": ("Recopy_" + $version + "_x64.app.tar.gz"),
    "windows-x86_64": ("Recopy_" + $version + "_x64-setup.exe"),
    "windows-x86_64-nsis": ("Recopy_" + $version + "_x64-setup.exe")
  }
')"
EXPECTED_PLATFORM_URLS="$(jq -cn \
  --arg prefix "$GITEE_DOWNLOAD_PREFIX" \
  --argjson assets "$EXPECTED_PLATFORM_ASSETS" \
  '$assets | with_entries(.value = ($prefix + .value))')"

jq -n --arg version "$VERSION" '
  {
    assets: [
      {id: 101, name: ("Recopy_" + $version + "_aarch64.app.tar.gz")},
      {id: 102, name: ("Recopy_" + $version + "_aarch64.app.tar.gz.sig")},
      {id: 103, name: ("Recopy_" + $version + "_aarch64.dmg")},
      {id: 201, name: ("Recopy_" + $version + "_x64.app.tar.gz")},
      {id: 202, name: ("Recopy_" + $version + "_x64.app.tar.gz.sig")},
      {id: 203, name: ("Recopy_" + $version + "_x64.dmg")},
      {id: 301, name: ("Recopy_" + $version + "_x64-setup.exe")},
      {id: 302, name: ("Recopy_" + $version + "_x64-setup.exe.sig")},
      {id: 401, name: "latest.json"}
    ]
  }
' > "$TMP_DIR/github-release.json"
printf '%s\n' 'English notes' '---' '中文说明' > "$TMP_DIR/release-notes.md"

make_latest() {
  local mode="$1"
  local output="$2"
  local arm64_url x64_url windows_url

  case "$mode" in
    api)
      arm64_url="${GITHUB_ASSET_API_PREFIX}101"
      x64_url="${GITHUB_ASSET_API_PREFIX}201"
      windows_url="${GITHUB_ASSET_API_PREFIX}301"
      ;;
    github)
      arm64_url="${GITHUB_DOWNLOAD_PREFIX}Recopy_${VERSION}_aarch64.app.tar.gz"
      x64_url="${GITHUB_DOWNLOAD_PREFIX}Recopy_${VERSION}_x64.app.tar.gz"
      windows_url="${GITHUB_DOWNLOAD_PREFIX}Recopy_${VERSION}_x64-setup.exe"
      ;;
    gitee)
      arm64_url="${GITEE_DOWNLOAD_PREFIX}Recopy_${VERSION}_aarch64.app.tar.gz"
      x64_url="${GITEE_DOWNLOAD_PREFIX}Recopy_${VERSION}_x64.app.tar.gz"
      windows_url="${GITEE_DOWNLOAD_PREFIX}Recopy_${VERSION}_x64-setup.exe"
      ;;
    *) fail "unknown latest.json mode: $mode" ;;
  esac

  jq -n \
    --arg version "$VERSION" \
    --arg arm64_url "$arm64_url" \
    --arg x64_url "$x64_url" \
    --arg windows_url "$windows_url" \
    '{
      version: $version,
      notes: "old notes",
      platforms: {
        "darwin-aarch64": {url: $arm64_url, signature: "arm64-signature"},
        "darwin-aarch64-app": {url: $arm64_url, signature: "arm64-signature"},
        "darwin-x86_64": {url: $x64_url, signature: "x64-signature"},
        "darwin-x86_64-app": {url: $x64_url, signature: "x64-signature"},
        "windows-x86_64": {url: $windows_url, signature: "windows-signature"},
        "windows-x86_64-nsis": {url: $windows_url, signature: "windows-signature"}
      }
    }' > "$output"
}

normalize_latest() {
  local input="$1"
  local output="$2"

  jq \
    --slurpfile release "$TMP_DIR/github-release.json" \
    --rawfile notes "$TMP_DIR/release-notes.md" \
    --arg github_asset_api_prefix "$GITHUB_ASSET_API_PREFIX" \
    --arg github_download_prefix "$GITHUB_DOWNLOAD_PREFIX" \
    --arg gitee_download_prefix "$GITEE_DOWNLOAD_PREFIX" \
    --arg version "$VERSION" \
    --argjson expected_platform_assets "$EXPECTED_PLATFORM_ASSETS" \
    -f "$NORMALIZE_FILTER" \
    "$input" > "$output"
}

test_normalization_contract() {
  local mode input output

  for mode in api github gitee; do
    input="$TMP_DIR/latest-${mode}.json"
    output="$TMP_DIR/latest-${mode}-normalized.json"
    make_latest "$mode" "$input"
    normalize_latest "$input" "$output"
    jq -e \
      --arg prefix "$GITEE_DOWNLOAD_PREFIX" \
      --argjson expected_urls "$EXPECTED_PLATFORM_URLS" \
      --rawfile notes "$TMP_DIR/release-notes.md" \
      '([.platforms[].url | startswith($prefix)] | all)
       and (.platforms | with_entries(.value = .value.url)) == $expected_urls
       and .notes == $notes' \
      "$output" >/dev/null
  done

  make_latest api "$TMP_DIR/latest-invalid.json"

  jq '.version = "1.0.0"' "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/wrong-version.json"
  assert_fails "wrong updater version was accepted" \
    normalize_latest "$TMP_DIR/wrong-version.json" "$TMP_DIR/out.json"

  jq 'del(.platforms["windows-x86_64-nsis"])' \
    "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/missing-platform.json"
  assert_fails "missing updater platform was accepted" \
    normalize_latest "$TMP_DIR/missing-platform.json" "$TMP_DIR/out.json"

  jq --arg url "${GITHUB_ASSET_API_PREFIX}201" \
    '.platforms["darwin-aarch64"].url = $url' \
    "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/wrong-asset.json"
  assert_fails "platform-to-asset mismatch was accepted" \
    normalize_latest "$TMP_DIR/wrong-asset.json" "$TMP_DIR/out.json"

  jq '.platforms["darwin-aarch64"].signature = ""' \
    "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/empty-signature.json"
  assert_fails "empty updater signature was accepted" \
    normalize_latest "$TMP_DIR/empty-signature.json" "$TMP_DIR/out.json"

  jq --arg url "${GITHUB_ASSET_API_PREFIX}999" \
    '.platforms["darwin-aarch64"].url = $url' \
    "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/unknown-asset.json"
  assert_fails "unknown GitHub API asset id was accepted" \
    normalize_latest "$TMP_DIR/unknown-asset.json" "$TMP_DIR/out.json"

  jq --arg url "https://github.com/shiqkuangsan/Recopy/releases/download/v9.8.6/Recopy_${VERSION}_aarch64.app.tar.gz" \
    '.platforms["darwin-aarch64"].url = $url' \
    "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/wrong-github-tag.json"
  assert_fails "GitHub direct URL from another tag was accepted" \
    normalize_latest "$TMP_DIR/wrong-github-tag.json" "$TMP_DIR/out.json"

  jq --arg url "https://gitee.com/shiqkuangsan/Recopy/releases/download/v9.8.6/Recopy_${VERSION}_aarch64.app.tar.gz" \
    '.platforms["darwin-aarch64"].url = $url' \
    "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/wrong-gitee-tag.json"
  assert_fails "Gitee direct URL from another tag was accepted" \
    normalize_latest "$TMP_DIR/wrong-gitee-tag.json" "$TMP_DIR/out.json"

  jq --arg url "${GITHUB_DOWNLOAD_PREFIX}Recopy_${VERSION}_x64.app.tar.gz" \
    '.platforms["darwin-aarch64"].url = $url' \
    "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/wrong-github-file.json"
  assert_fails "wrong GitHub direct asset was accepted for a platform" \
    normalize_latest "$TMP_DIR/wrong-github-file.json" "$TMP_DIR/out.json"

  jq --arg url "${GITEE_DOWNLOAD_PREFIX}Recopy_${VERSION}_x64.app.tar.gz" \
    '.platforms["darwin-aarch64"].url = $url' \
    "$TMP_DIR/latest-invalid.json" > "$TMP_DIR/wrong-gitee-file.json"
  assert_fails "wrong Gitee direct asset was accepted for a platform" \
    normalize_latest "$TMP_DIR/wrong-gitee-file.json" "$TMP_DIR/out.json"
}

test_ambiguous_upload_posts_once() (
  # shellcheck source=../sync-gitee-release.sh
  source "$ROOT/scripts/sync-gitee-release.sh"

  WORK_DIR="$TMP_DIR/upload-test"
  gitee_attachments_json="$WORK_DIR/attachments.json"
  GITEE_API="https://gitee.test/api"
  GITEE_TOKEN="token"
  release_id="release-id"
  mkdir -p "$WORK_DIR"
  printf 'asset' > "$WORK_DIR/example.bin"
  printf '[]\n' > "$gitee_attachments_json"

  POST_COUNT=0
  REFRESH_COUNT=0
  curl() {
    local argument expect_method=false method=""
    for argument in "$@"; do
      if [[ "$expect_method" == "true" ]]; then
        method="$argument"
        expect_method=false
      elif [[ "$argument" == "-X" ]]; then
        expect_method=true
      fi
    done
    [[ "$method" == "POST" ]] || return 64
    POST_COUNT=$((POST_COUNT + 1))
    return 52
  }
  refresh_gitee_attachments() {
    REFRESH_COUNT=$((REFRESH_COUNT + 1))
    printf '[]\n' > "$gitee_attachments_json"
  }
  sleep() { :; }

  if upload_gitee_asset "example.bin" >/dev/null 2>&1; then
    fail "ambiguous upload unexpectedly succeeded"
  else
    upload_status=$?
  fi

  assert_eq "52" "$upload_status" "ambiguous upload did not preserve curl status"
  assert_eq "1" "$POST_COUNT" "ambiguous upload issued more than one POST"
  assert_eq "3" "$REFRESH_COUNT" "ambiguous upload did not perform bounded verification"
)

test_replace_deletes_all_latest_assets() (
  # shellcheck source=../sync-gitee-release.sh
  source "$ROOT/scripts/sync-gitee-release.sh"

  WORK_DIR="$TMP_DIR/replace-test"
  gitee_attachments_json="$WORK_DIR/attachments.json"
  GITEE_API="https://gitee.test/api"
  GITEE_TOKEN="token"
  release_id="release-id"
  mkdir -p "$WORK_DIR"
  cat > "$gitee_attachments_json" <<'JSON'
[
  {"id": 111, "name": "latest.json"},
  {"id": 222, "name": "latest.json"},
  {"id": 333, "name": "Recopy_9.8.7_aarch64.dmg"}
]
JSON

  DELETE_IDS="$WORK_DIR/delete-ids.txt"
  : > "$DELETE_IDS"
  curl() {
    local argument expect_method=false method="" url=""
    for argument in "$@"; do
      if [[ "$expect_method" == "true" ]]; then
        method="$argument"
        expect_method=false
      elif [[ "$argument" == "-X" ]]; then
        expect_method=true
      fi
      case "$argument" in
        https://*) url="$argument" ;;
      esac
    done
    [[ "$method" == "DELETE" ]] || fail "replacement did not use DELETE"
    case "$url" in
      */attach_files/111\?*) echo 111 >> "$DELETE_IDS" ;;
      */attach_files/222\?*) echo 222 >> "$DELETE_IDS" ;;
      *) fail "replacement attempted an unexpected DELETE URL: $url" ;;
    esac
  }
  refresh_gitee_attachments() {
    printf '[{"id":333,"name":"Recopy_9.8.7_aarch64.dmg"}]\n' \
      > "$gitee_attachments_json"
  }

  replace_gitee_latest >/dev/null
  assert_eq $'111\n222' "$(sort -n "$DELETE_IDS")" \
    "replacement did not delete every exact latest.json asset"
  if gitee_asset_exists "latest.json"; then
    fail "replacement left a latest.json asset behind"
  fi
)

test_release_runbook_contract() {
  local skill="$ROOT/.agents/skills/recopy-release/SKILL.md"
  local bump_script="$ROOT/scripts/bump-version.sh"
  local ci_workflow="$ROOT/.github/workflows/release-tooling.yml"

  grep -Fq 'src-tauri/Cargo.lock' "$skill" || \
    fail "release Skill does not include Cargo.lock in the version contract"
  grep -Fq 'src-tauri/Cargo.lock' "$bump_script" || \
    fail "bump helper does not mention the Cargo.lock refresh"
  if grep -Fq 'git push origin main --tags' "$bump_script"; then
    fail "bump helper still combines branch and tag pushes"
  fi
  grep -Fq 'bash scripts/tests/release-tooling.sh' "$ci_workflow" || \
    fail "release-tooling regression test is not wired into CI"
  grep -Fq 'ubuntu-latest' "$ci_workflow" || \
    fail "release-tooling CI does not cover Ubuntu"
  grep -Fq 'macos-latest' "$ci_workflow" || \
    fail "release-tooling CI does not cover macOS Bash"
  grep -Fq '.agents/skills/recopy-release/SKILL.md' "$ci_workflow" || \
    fail "release Skill changes do not trigger release-tooling CI"
}

test_normalization_contract
test_ambiguous_upload_posts_once
test_replace_deletes_all_latest_assets
test_release_runbook_contract

echo "release-tooling tests passed"
