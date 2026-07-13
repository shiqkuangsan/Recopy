#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-${TAG:-}}"
REPO="${GITHUB_REPOSITORY:-shiqkuangsan/Recopy}"
GITEE_REPO="${GITEE_REPO:-shiqkuangsan/Recopy}"
UPDATE_GITHUB_UPDATER="${UPDATE_GITHUB_UPDATER:-true}"
REPLACE_GITEE_LATEST="${REPLACE_GITEE_LATEST:-false}"

if [[ -z "$TAG" ]]; then
  echo "usage: scripts/sync-gitee-release.sh vX.Y.Z" >&2
  exit 2
fi

if [[ -z "${GITEE_TOKEN:-}" ]]; then
  echo "GITEE_TOKEN is required" >&2
  exit 1
fi

for cmd in curl jq openssl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required" >&2
    exit 1
  fi
done

WORK_DIR="$(mktemp -d /tmp/recopy-gitee-release.XXXXXX)"
trap 'rm -r "$WORK_DIR"' EXIT

GITHUB_API="https://api.github.com/repos/${REPO}"
GITEE_API="https://gitee.com/api/v5/repos/${GITEE_REPO}"
GITEE_DOWNLOAD_PREFIX="https://gitee.com/${GITEE_REPO}/releases/download/"
GITHUB_ASSET_API_PREFIX="${GITHUB_API}/releases/assets/"
GITHUB_DOWNLOAD_PREFIX="https://github.com/${REPO}/releases/download/${TAG}/"
GITEE_RELEASE_DOWNLOAD_PREFIX="${GITEE_DOWNLOAD_PREFIX}${TAG}/"
VERSION="${TAG#v}"
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

github_headers=(-H "Accept: application/vnd.github+json")
github_asset_headers=(-H "Accept: application/octet-stream")
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  github_headers=(-H "Authorization: Bearer ${GITHUB_TOKEN}" "${github_headers[@]}")
  github_asset_headers=(-H "Authorization: Bearer ${GITHUB_TOKEN}" "${github_asset_headers[@]}")
fi

curl -fsSL "${github_headers[@]}" \
  "${GITHUB_API}/releases/tags/${TAG}" \
  > "$WORK_DIR/github-release.json"

jq -r '.body // ""' "$WORK_DIR/github-release.json" > "$WORK_DIR/release-notes.md"
jq -r '.assets[] | [.id, .name] | @tsv' "$WORK_DIR/github-release.json" > "$WORK_DIR/assets.tsv"

while IFS=$'\t' read -r asset_id asset_name; do
  curl -fsSL "${github_asset_headers[@]}" \
    "${GITHUB_API}/releases/assets/${asset_id}" \
    -o "$WORK_DIR/${asset_name}"
done < "$WORK_DIR/assets.tsv"

if [[ ! -f "$WORK_DIR/latest.json" ]]; then
  echo "latest.json asset is required" >&2
  exit 1
fi

jq \
  --slurpfile release "$WORK_DIR/github-release.json" \
  --rawfile notes "$WORK_DIR/release-notes.md" \
  --arg github_asset_api_prefix "$GITHUB_ASSET_API_PREFIX" \
  --arg github_download_prefix "$GITHUB_DOWNLOAD_PREFIX" \
  --arg gitee_download_prefix "$GITEE_RELEASE_DOWNLOAD_PREFIX" \
  --arg version "$VERSION" \
  --argjson expected_platform_assets "$EXPECTED_PLATFORM_ASSETS" \
  '
    ($release[0].assets
      | map({ key: (.id | tostring), value: .name })
      | from_entries) as $asset_names
    | ($release[0].assets | map(.name)) as $release_asset_names
    | if .version != $version then
        error("updater version \(.version) does not match tag version \($version)")
      elif (.platforms | keys) != ($expected_platform_assets | keys) then
        error("updater platform keys do not match the required Recopy platforms")
      elif (([.platforms[].signature | (type == "string" and length > 0)] | all) == false) then
        error("updater signatures must be nonempty strings")
      else
        .
      end
    | .platforms |= with_entries(
        .key as $platform
        | .value.url as $source_url
        | (if ($source_url | startswith($github_asset_api_prefix)) then
            ($source_url | split("/")[-1]) as $asset_id
            | ($asset_names[$asset_id]
                // error("unknown GitHub release asset id: \($asset_id)")) as $asset_name
            | $asset_name
          elif ($source_url | startswith($github_download_prefix)) then
            $source_url | ltrimstr($github_download_prefix)
          elif ($source_url | startswith($gitee_download_prefix)) then
            $source_url | ltrimstr($gitee_download_prefix)
          else
            error("unsupported updater asset URL: \($source_url)")
          end) as $asset_name
        | if $asset_name != $expected_platform_assets[$platform] then
            error("unexpected asset for \($platform): \($asset_name)")
          elif ($release_asset_names | index($asset_name)) == null then
            error("updater asset is missing from the GitHub release: \($asset_name)")
          else
            .value.url = ($gitee_download_prefix + $asset_name)
          end
      )
    | .notes = $notes
  ' \
  "$WORK_DIR/latest.json" > "$WORK_DIR/latest.updated.json"
mv "$WORK_DIR/latest.updated.json" "$WORK_DIR/latest.json"

gitee_release_json="$WORK_DIR/gitee-release.json"
curl -fsSL "${GITEE_API}/releases/tags/${TAG}" > "$gitee_release_json"
release_id="$(jq -r '.id // empty' "$gitee_release_json")"

if [[ -z "$release_id" ]]; then
  body="$(cat "$WORK_DIR/release-notes.md")"
  curl -fsS -X POST "${GITEE_API}/releases" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg token "$GITEE_TOKEN" \
      --arg tag "$TAG" \
      --arg name "Recopy $TAG" \
      --arg body "$body" \
      '{access_token: $token, tag_name: $tag, name: $name, body: $body, target_commitish: "main"}')" \
    > "$gitee_release_json"
  release_id="$(jq -r '.id' "$gitee_release_json")"
  echo "created Gitee release ${TAG} (${release_id})"
else
  echo "found Gitee release ${TAG} (${release_id})"
fi

gitee_attachments_json="$WORK_DIR/gitee-attachments.json"
refresh_gitee_attachments() {
  curl -fsSL --retry 3 --retry-all-errors --retry-delay 2 \
    --connect-timeout 30 --max-time 120 \
    "${GITEE_API}/releases/${release_id}/attach_files?access_token=${GITEE_TOKEN}&per_page=100" \
    > "$gitee_attachments_json"
}

gitee_asset_exists() {
  local asset_name="$1"
  jq -e --arg name "$asset_name" 'any(.[]; .name == $name)' \
    "$gitee_attachments_json" >/dev/null
}

refresh_gitee_attachments

if [[ "$REPLACE_GITEE_LATEST" == "true" ]]; then
  latest_ids_file="$WORK_DIR/gitee-latest-ids.txt"
  jq -r '.[] | select(.name == "latest.json") | .id' \
    "$gitee_attachments_json" > "$latest_ids_file"
  while IFS= read -r latest_id; do
    [[ -n "$latest_id" ]] || continue
    curl -fsS -X DELETE \
      --connect-timeout 30 --max-time 120 \
      "${GITEE_API}/releases/${release_id}/attach_files/${latest_id}?access_token=${GITEE_TOKEN}"
    echo "deleted existing asset latest.json (${latest_id}) for replacement"
  done < "$latest_ids_file"
  refresh_gitee_attachments
  if gitee_asset_exists "latest.json"; then
    echo "failed to remove all existing latest.json assets" >&2
    exit 1
  fi
fi

jq -r '.[].name' "$gitee_attachments_json" | sort > "$WORK_DIR/existing-assets.txt"

upload_gitee_asset() {
  local asset_name="$1"
  local check upload_status

  if curl -fsS -X POST \
    --connect-timeout 30 --max-time 600 \
    "${GITEE_API}/releases/${release_id}/attach_files" \
    -F "access_token=${GITEE_TOKEN}" \
    -F "file=@${WORK_DIR}/${asset_name}" \
    > "$WORK_DIR/upload-${asset_name}.json"; then
    echo "uploaded asset ${asset_name}"
    return 0
  else
    upload_status=$?
  fi

  for check in 1 2 3; do
    if ! refresh_gitee_attachments; then
      echo "could not verify asset ${asset_name} after upload response failure; refusing to retry POST" >&2
      return "$upload_status"
    fi
    if gitee_asset_exists "$asset_name"; then
      echo "asset ${asset_name} exists after upload response failure"
      return 0
    fi
    if [[ "$check" != "3" ]]; then
      sleep $((check * 2))
    fi
  done

  echo "asset ${asset_name} is absent after upload failure; rerun the idempotent sync instead of retrying POST" >&2
  return "$upload_status"
}

while IFS=$'\t' read -r _ asset_name; do
  if grep -Fxq "$asset_name" "$WORK_DIR/existing-assets.txt"; then
    echo "skip existing asset ${asset_name}"
    continue
  fi

  upload_gitee_asset "$asset_name"
done < "$WORK_DIR/assets.tsv"

refresh_gitee_attachments
while IFS=$'\t' read -r _ asset_name; do
  if ! gitee_asset_exists "$asset_name"; then
    echo "Gitee release is missing asset after sync: ${asset_name}" >&2
    exit 1
  fi
done < "$WORK_DIR/assets.tsv"

if [[ "$UPDATE_GITHUB_UPDATER" == "true" ]]; then
  if [[ -z "${GITHUB_TOKEN:-}" ]]; then
    echo "GITHUB_TOKEN is required to update the updater branch" >&2
    exit 1
  fi

  updater_json="$WORK_DIR/updater-content.json"
  updater_status="$(curl -sS -o "$updater_json" -w '%{http_code}' \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "${GITHUB_API}/contents/latest.json?ref=updater")"

  current_sha=""
  if [[ "$updater_status" == "200" ]]; then
    current_sha="$(jq -r '.sha' "$updater_json")"
  elif [[ "$updater_status" != "404" ]]; then
    cat "$updater_json" >&2
    exit 1
  fi

  latest_b64="$(openssl base64 -A -in "$WORK_DIR/latest.json")"
  payload="$WORK_DIR/updater-payload.json"
  if [[ -n "$current_sha" ]]; then
    jq -n \
      --arg message "update latest.json for ${TAG}" \
      --arg content "$latest_b64" \
      --arg branch "updater" \
      --arg sha "$current_sha" \
      '{message: $message, content: $content, branch: $branch, sha: $sha}' \
      > "$payload"
  else
    jq -n \
      --arg message "update latest.json for ${TAG}" \
      --arg content "$latest_b64" \
      --arg branch "updater" \
      '{message: $message, content: $content, branch: $branch}' \
      > "$payload"
  fi

  update_response="$WORK_DIR/updater-update.json"
  update_status="$(curl -sS -o "$update_response" -w '%{http_code}' -X PUT \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "${GITHUB_API}/contents/latest.json" \
    --data @"$payload")"

  if [[ "$update_status" == "200" || "$update_status" == "201" ]]; then
    jq -r '"updated updater branch at " + .commit.sha' "$update_response"
  elif [[ "$update_status" == "422" ]] && jq -e '.message | test("No changes"; "i")' "$update_response" >/dev/null; then
    echo "updater branch already current"
  else
    cat "$update_response" >&2
    exit 1
  fi
fi

echo "Gitee sync complete for ${TAG}"
