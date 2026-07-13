---
name: recopy-release
description: Use when releasing the Recopy desktop app, including version selection, version bumping, pre-release checks, GitHub tagging, release CI monitoring, bilingual release notes, updater metadata, and Gitee release sync.
---

# Recopy Release

Use this workflow when the user asks to release Recopy, run the release command, bump a release version, create a release tag, monitor release CI, write release notes, or sync release assets to Gitee.

## Hard Gates

- Never commit, push, tag, edit a GitHub release, or call external release APIs unless the user has explicitly asked to release or sync.
- Before committing, show the exact file scope and a concise diff summary.
- `git commit`, `git push`, tag push, release edits, and Gitee sync are separate external actions. Do not combine them with unrelated commands.
- If any verification step fails, stop and report the failing command and relevant output. Do not continue to commit or tag.
- Do not add AI signatures, generated-by notes, or AI co-author trailers.

Release intent rule:

- A clear Recopy release request such as "我要发版", "准备发版", or "release vX.Y.Z" confirms the standard release pipeline for the current repo: pre-checks, version/tag handling, GitHub release, release notes, updater metadata, Homebrew monitoring, and Gitee sync.
- Ask again only when the version target is ambiguous, verification fails, the working tree contains unrelated changes, a destructive recovery action is required, or required credentials/secrets are missing.
- Gitee sync is mandatory for every Recopy release. Do not ask separately after GitHub release publication.

## Inputs

The user may provide:

- A version type: `patch`, `minor`, or `major`
- An exact semver version: for example `1.7.0`
- Nothing: derive a recommended version from commits

Confirm the final version number before editing version files. If the version files are already prepared and the user explicitly asked to release, report the inferred version and continue unless it conflicts with tags or release state.

## Workflow

### 0. Orient

1. Confirm the local repository is Recopy.
2. Run `git status --short --branch`.
3. Confirm the branch and remote state are appropriate for release.
4. If local `main` is ahead, behind, or diverged, explain the state before proceeding.
5. Read the current version from `src-tauri/tauri.conf.json`.
6. Confirm GitHub Actions secrets include `GITEE_TOKEN` before relying on automatic Gitee sync.

### 1. Determine Version

If the user gives an exact version, validate `X.Y.Z` semver and use it after confirmation.

If the user gives `patch`, `minor`, or `major`, increment from the current version:

- `patch`: `1.6.0` to `1.6.1`
- `minor`: `1.6.0` to `1.7.0`
- `major`: `1.6.0` to `2.0.0`

If the user gives no version:

1. Get the latest tag: `git describe --tags --abbrev=0`.
2. List commits since that tag: `git log <last-tag>..HEAD --oneline`.
3. Recommend the version bump from conventional commits:
   - `BREAKING CHANGE` or `!:` means `major`.
   - `feat:` or `feat(...):` means at least `minor`.
   - Only `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, or `test:` means `patch`.
4. Present the analysis. If the user explicitly asked to release and the inferred version matches the prepared version files, continue; otherwise ask for confirmation.

### 2. Bump Version

After confirmation, run:

```bash
./scripts/bump-version.sh <version>
```

The script directly updates:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

The first Cargo verification command refreshes the root `recopy` package version
in `src-tauri/Cargo.lock`. The effective release-version contract therefore
contains four files. After the Cargo checks, verify with:

```bash
git diff -- \
  package.json \
  src-tauri/tauri.conf.json \
  src-tauri/Cargo.toml \
  src-tauri/Cargo.lock
```

### 3. Pre-Checks

Run:

```bash
npx tsc --noEmit
npx vitest run
cargo test
cargo test --locked
```

Run both Cargo commands from `src-tauri/`. The unlocked run refreshes
`Cargo.lock` after the version bump; the locked run proves the committed graph
is now self-consistent.

### 4. Local Build

For major releases, run:

```bash
pnpm tauri build
```

For patch or minor releases, skip the local build unless the user asks for it or the release risk suggests it is worth doing.

### 5. Commit And Push

After checks pass, show the exact files that will be staged. If the user explicitly asked to release, commit and push as part of the standard release pipeline.

On confirmation:

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to X.Y.Z"
git push
```

### 6. Tag And Push Tag

Tag and push after the release commit is on `main`. Explain that pushing the tag triggers the release build.

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 7. Monitor CI

Use:

```bash
gh run list --limit 3
gh run view <run-id> --json jobs --jq '.jobs[] | "\(.name)\t\(.status)\t\(.conclusion // "running")"'
```

Report job statuses in a compact table. If the tag push does not create a Release run, use the manual fallback:

```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/shiqkuangsan/Recopy/actions/workflows/release.yml/dispatches \
  -d '{"ref":"vX.Y.Z","inputs":{"platform":"all","publish_release":"true"}}'
```

Cancel duplicate runs if both tag push and manual dispatch start.

### 8. Release Notes

Once CI succeeds, write bilingual release notes with English first and Chinese second, separated by `---`.

Use this structure:

```markdown
## Recopy vX.Y.Z - Short Title

One or two sentence summary.

### Highlights / What's New

- Derive bullets from commits.

### Downloads

| Platform | File |
| --- | --- |

### Notes

- **macOS:** The app is not notarized yet. On first launch: right-click -> Open -> confirm. See [Installation Guide](https://github.com/shiqkuangsan/Recopy/blob/main/docs/macos-unsigned-app.md).
- Platform testing status.

---

## Recopy vX.Y.Z - 中文标题

中文摘要。

### 亮点 / 更新内容

- 从提交记录提炼。

### 下载

| 平台 | 文件 |
| --- | --- |

### 说明

- **macOS:** 应用尚未公证。首次打开：右键 -> 打开 -> 确认。详见 [安装指南](https://github.com/shiqkuangsan/Recopy/blob/main/docs/macos-unsigned-app.md)。
- 平台测试状态。
```

Content rules:

- Derive highlights from `git log <prev-tag>..vX.Y.Z --oneline`.
- Group commits by features, fixes, improvements, and chores.
- Skip merge commits and trivial chores.
- Get asset names from `gh release view vX.Y.Z --json assets`.

Update the draft release notes after Release CI succeeds:

```bash
gh release edit vX.Y.Z --notes "<release notes>"
```

### 9. Refresh Updater Metadata

After release notes are written, update the `latest.json` updater metadata so the in-app update notes match the published release notes.

Replace the GitHub `latest.json` asset after release notes are updated:

```bash
TAG="vX.Y.Z"
VERSION="${TAG#v}"
WORK_DIR=$(mktemp -d /tmp/recopy-updater-notes.XXXXXX)
GITHUB_DOWNLOAD_PREFIX="https://github.com/shiqkuangsan/Recopy/releases/download/${TAG}"

gh release view "$TAG" -R shiqkuangsan/Recopy --json body -q '.body' > "$WORK_DIR/release-notes.md"
gh release download "$TAG" -R shiqkuangsan/Recopy -p latest.json -D "$WORK_DIR"
gh release view "$TAG" -R shiqkuangsan/Recopy --json assets -q '.assets[].name' > "$WORK_DIR/assets.txt"

for asset in \
  "Recopy_${VERSION}_aarch64.app.tar.gz" \
  "Recopy_${VERSION}_x64.app.tar.gz" \
  "Recopy_${VERSION}_x64-setup.exe"; do
  grep -Fxq "$asset" "$WORK_DIR/assets.txt" || {
    echo "Missing updater asset: $asset" >&2
    exit 1
  }
done

jq \
  --rawfile notes "$WORK_DIR/release-notes.md" \
  --arg prefix "$GITHUB_DOWNLOAD_PREFIX" \
  --arg version "$VERSION" \
  '
    .notes = $notes
    | .platforms["darwin-aarch64"].url = ($prefix + "/Recopy_" + $version + "_aarch64.app.tar.gz")
    | .platforms["darwin-aarch64-app"].url = ($prefix + "/Recopy_" + $version + "_aarch64.app.tar.gz")
    | .platforms["darwin-x86_64"].url = ($prefix + "/Recopy_" + $version + "_x64.app.tar.gz")
    | .platforms["darwin-x86_64-app"].url = ($prefix + "/Recopy_" + $version + "_x64.app.tar.gz")
    | .platforms["windows-x86_64"].url = ($prefix + "/Recopy_" + $version + "_x64-setup.exe")
    | .platforms["windows-x86_64-nsis"].url = ($prefix + "/Recopy_" + $version + "_x64-setup.exe")
  ' \
  "$WORK_DIR/latest.json" > "$WORK_DIR/latest.updated.json"
mv "$WORK_DIR/latest.updated.json" "$WORK_DIR/latest.json"

jq -e \
  --arg version "$VERSION" \
  --arg prefix "${GITHUB_DOWNLOAD_PREFIX}/" \
  '
    .version == $version
    and (.platforms | length == 6)
    and ([.platforms[].url | startswith($prefix)] | all)
    and ([.platforms[].signature | length > 0] | all)
  ' "$WORK_DIR/latest.json" >/dev/null || {
    echo "Invalid updater metadata for ${TAG}" >&2
    exit 1
  }

gh release upload "$TAG" -R shiqkuangsan/Recopy "$WORK_DIR/latest.json" --clobber
```

Before publication, verify every updater URL uses the direct
`https://github.com/.../releases/download/$TAG/...` form. GitHub API asset URLs
such as `https://api.github.com/repos/.../releases/assets/...` are metadata
endpoints and must not be published as updater download URLs.

Publish the GitHub release only after `latest.json` contains the final release notes.

### 10. Gitee Sync

Gitee sync is required for every Recopy release.

Preferred path: GitHub Actions automatically runs `.github/workflows/sync-gitee.yml` on `release.published`.

Prerequisites:

- GitHub Actions secret `GITEE_TOKEN` exists.
- GitHub release is published, not draft.
- `latest.json` on the GitHub release already contains final release notes.

Monitor the workflow:

```bash
gh run list --workflow "Sync Gitee Release" --limit 3
```

Fallback path if Actions is unavailable or must be run locally:

```bash
GITHUB_TOKEN=<token> GITEE_TOKEN=<token> scripts/sync-gitee-release.sh vX.Y.Z
```

If a failed sync already uploaded an incorrect `latest.json`, rerun the fallback
with `REPLACE_GITEE_LATEST=true`. This explicitly deletes and replaces only that
metadata asset; all other existing assets remain idempotently skipped.

The script:

- Downloads GitHub release assets.
- Rewrites `latest.json` download URLs from GitHub to Gitee.
- Creates the Gitee release if missing.
- Uploads missing Gitee assets idempotently.
- Updates the GitHub `updater` branch through the GitHub Contents API.

Completion checks:

```bash
TAG="vX.Y.Z"
VERSION="${TAG#v}"
WORK_DIR=$(mktemp -d /tmp/recopy-release-check.XXXXXX)

gh release download "$TAG" -R shiqkuangsan/Recopy \
  -p latest.json -D "$WORK_DIR/github"
jq -e --arg version "$VERSION" \
  --arg prefix "https://github.com/shiqkuangsan/Recopy/releases/download/${TAG}/" \
  '.version == $version and (.platforms | length == 6)
   and ([.platforms[].url | startswith($prefix)] | all)
   and ([.platforms[].signature | (type == "string" and length > 0)] | all)
   and (.notes | type == "string" and length > 0)' \
  "$WORK_DIR/github/latest.json"

curl -fsSL https://gitee.com/api/v5/repos/shiqkuangsan/Recopy/releases/tags/vX.Y.Z \
  | jq -r '[.tag_name, (.assets|length)] | @tsv'
curl -fsSL https://gitee.com/shiqkuangsan/Recopy/releases/download/vX.Y.Z/latest.json \
  | jq -e --arg version "$VERSION" \
      --arg prefix "https://gitee.com/shiqkuangsan/Recopy/releases/download/${TAG}/" \
      '.version == $version and (.platforms | length == 6)
       and ([.platforms[].url | startswith($prefix)] | all)
       and ([.platforms[].signature | (type == "string" and length > 0)] | all)
       and (.notes | type == "string" and length > 0)'

gh api 'repos/shiqkuangsan/Recopy/contents/latest.json?ref=updater' --jq '.content' \
  | tr -d '\n' \
  | openssl base64 -d -A \
  | jq -e --arg version "$VERSION" \
      --arg prefix "https://gitee.com/shiqkuangsan/Recopy/releases/download/${TAG}/" \
      '.version == $version and (.platforms | length == 6)
       and ([.platforms[].url | startswith($prefix)] | all)
       and ([.platforms[].signature | (type == "string" and length > 0)] | all)
       and (.notes | type == "string" and length > 0)'
```

Use the GitHub Contents API result as the canonical `updater` branch check.
`raw.githubusercontent.com` can briefly return stale cached content immediately
after the branch is updated.
