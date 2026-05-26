#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-${TAG:-}}"
REPO="${GITHUB_REPOSITORY:-shiqkuangsan/Recopy}"
GITEE_REPO="${GITEE_REPO:-shiqkuangsan/Recopy}"
UPDATE_GITHUB_UPDATER="${UPDATE_GITHUB_UPDATER:-true}"

if [[ -z "$TAG" ]]; then
  echo "usage: scripts/sync-gitee-release.sh vX.Y.Z" >&2
  exit 2
fi

if [[ -z "${GITEE_TOKEN:-}" ]]; then
  echo "GITEE_TOKEN is required" >&2
  exit 1
fi

for cmd in curl jq openssl perl; do
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

perl -0pi -e "s|https://github\\.com/${REPO}/releases/download/|${GITEE_DOWNLOAD_PREFIX}|g" \
  "$WORK_DIR/latest.json"
jq --rawfile notes "$WORK_DIR/release-notes.md" '.notes = $notes' \
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

jq -r '.assets[]?.name // empty' "$gitee_release_json" | sort > "$WORK_DIR/existing-assets.txt"

while IFS=$'\t' read -r _ asset_name; do
  if grep -Fxq "$asset_name" "$WORK_DIR/existing-assets.txt"; then
    echo "skip existing asset ${asset_name}"
    continue
  fi

  curl -fsS -X POST \
    "${GITEE_API}/releases/${release_id}/attach_files" \
    -F "access_token=${GITEE_TOKEN}" \
    -F "file=@${WORK_DIR}/${asset_name}" \
    > "$WORK_DIR/upload-${asset_name}.json"
  echo "uploaded asset ${asset_name}"
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
