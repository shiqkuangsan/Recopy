---
name: recopy-release
description: Use when releasing the Recopy desktop app, including version selection, version bumping, pre-release checks, GitHub tagging, release CI monitoring, bilingual release notes, and optional Gitee release sync.
---

# Recopy Release

Use this workflow when the user asks to release Recopy, run the release command, bump a release version, create a release tag, monitor release CI, write release notes, or sync release assets to Gitee.

## Hard Gates

- Never commit, push, tag, edit a GitHub release, force-push the `updater` branch, or call the Gitee API without explicit user confirmation for that exact action.
- Before committing, show the exact file scope and a concise diff summary.
- `git commit`, `git push`, tag push, release edits, and Gitee sync are separate external actions. Do not combine them with unrelated commands.
- If any verification step fails, stop and report the failing command and relevant output. Do not continue to commit or tag.
- Do not add AI signatures, generated-by notes, or AI co-author trailers.

## Inputs

The user may provide:

- A version type: `patch`, `minor`, or `major`
- An exact semver version: for example `1.7.0`
- Nothing: derive a recommended version from commits

Always confirm the final version number with the user before editing version files.

## Workflow

### 0. Orient

1. Confirm the local repository is Recopy.
2. Run `git status --short --branch`.
3. Confirm the branch and remote state are appropriate for release.
4. If local `main` is ahead, behind, or diverged, explain the state before proceeding.
5. Read the current version from `src-tauri/tauri.conf.json`.

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
4. Present the analysis and ask for confirmation.

### 2. Bump Version

After confirmation, run:

```bash
./scripts/bump-version.sh <version>
```

This should update:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Verify with `git diff -- package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`.

### 3. Pre-Checks

Run:

```bash
npx tsc --noEmit
npx vitest run
cargo test
```

Run `cargo test` from `src-tauri/`.

### 4. Local Build

For major releases, run:

```bash
pnpm tauri build
```

For patch or minor releases, skip the local build unless the user asks for it or the release risk suggests it is worth doing.

### 5. Commit And Push

After checks pass, ask the user to confirm the commit and push. Show the exact files that will be staged.

On confirmation:

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to X.Y.Z"
git push
```

### 6. Tag And Push Tag

Ask for confirmation before tagging. Explain that pushing the tag triggers the release build.

On confirmation:

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

Report job statuses in a compact table. If the user asks to check again, rerun the commands.

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

Ask for confirmation before updating the draft release:

```bash
gh release edit vX.Y.Z --notes "<release notes>"
```

### 9. Optional Gitee Sync

After release notes are written, offer to sync the release to Gitee for China mainland users.

Prerequisite: `GITEE_TOKEN` must be set. If it is missing, skip and remind the user.

Procedure:

1. Download GitHub release assets:

```bash
TAG="vX.Y.Z"
mkdir -p /tmp/gitee-sync
gh release download "$TAG" -R shiqkuangsan/Recopy -D /tmp/gitee-sync
```

2. Generate Gitee version of `latest.json`:

```bash
cd /tmp/gitee-sync
sed -i '' 's|https://github.com/shiqkuangsan/Recopy/releases/download/|https://gitee.com/shiqkuangsan/Recopy/releases/download/|g' latest.json
```

3. Create the Gitee release and upload all assets:

```bash
BODY=$(gh release view "$TAG" -R shiqkuangsan/Recopy --json body -q '.body')

RELEASE_ID=$(curl -sf -X POST "https://gitee.com/api/v5/repos/shiqkuangsan/Recopy/releases" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg token "$GITEE_TOKEN" \
    --arg tag "$TAG" \
    --arg name "Recopy $TAG" \
    --arg body "$BODY" \
    '{access_token: $token, tag_name: $tag, name: $name, body: $body, target_commitish: "main"}'
  )" | jq -r '.id')

for file in /tmp/gitee-sync/*; do
  [ -f "$file" ] || continue
  fname=$(basename "$file")
  curl -sf -X POST \
    "https://gitee.com/api/v5/repos/shiqkuangsan/Recopy/releases/${RELEASE_ID}/attach_files" \
    -F "access_token=${GITEE_TOKEN}" \
    -F "file=@${file}" > /dev/null
  echo "  uploaded $fname"
done
```

4. Push `latest.json` with Gitee download URLs to GitHub `updater` branch so the Gitee mirror can sync it:

```bash
cd /tmp
rm -rf github-updater
git init github-updater
cd github-updater
cp /tmp/gitee-sync/latest.json .
git add latest.json
git -c user.name="release" -c user.email="release@recopy.app" \
  commit -m "update latest.json for $TAG"
git branch -M updater
git remote add origin "https://github.com/shiqkuangsan/Recopy.git"
git push -f origin updater
```

5. Clean up:

```bash
rm -rf /tmp/gitee-sync /tmp/github-updater
```
