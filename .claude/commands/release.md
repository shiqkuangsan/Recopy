---
description: 'Recopy 发版流程。用法: /release [patch|minor|major|x.y.z]'
allowed-tools:
  ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebFetch', 'Task']
---

# Recopy Release Workflow

Execute the full release pipeline for the Recopy project. This workflow handles version determination, pre-checks, building, tagging, CI monitoring, release notes, and announcement copy generation.

## Input

The user may provide:

- A version type: `patch`, `minor`, `major`
- An exact version: e.g. `0.2.0`
- Nothing: auto-derive from commits

Argument received: `$ARGUMENTS`

## Step 1: Version Determination

### If exact version provided

Use it directly. Validate semver format (X.Y.Z).

### If version type provided (patch/minor/major)

Get current version from `src-tauri/tauri.conf.json`, increment accordingly:

- `patch`: 0.1.0 → 0.1.1
- `minor`: 0.1.0 → 0.2.0
- `major`: 0.1.0 → 1.0.0

### If no argument provided

1. Get the latest git tag: `git describe --tags --abbrev=0`
2. Get all commits since that tag: `git log <last-tag>..HEAD --oneline`
3. Analyze commits using conventional commit prefixes:
   - Has `feat:` or `feat(...):` → at least **minor**
   - Has BREAKING CHANGE or `!:` → **major**
   - Only `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:` → **patch**
4. Present the analysis and recommended version to the user
5. Wait for user confirmation before proceeding

**Important:** Always confirm the final version number with the user before any changes.

## Step 2: Version Bump

Run the bump script:

```bash
./scripts/bump-version.sh <version>
```

This updates three files: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

Verify the changes with `git diff`.

## Step 3: Pre-checks

Run all three in parallel:

```bash
npx tsc --noEmit          # TypeScript
npx vitest run             # Frontend tests
cd src-tauri && cargo test  # Rust tests
```

If any check fails, stop and report. Do NOT proceed to commit.

## Step 4: Local Build (major versions only)

If the version bump is a **major** version (X.0.0 where X increased), run:

```bash
pnpm tauri build
```

Report build result. If failed, stop and debug.

For minor/patch versions, skip this step and note it was skipped.

## Step 5: Commit & Push

**This step requires explicit user confirmation.** Present the changes and ask:

> Version bumped to X.Y.Z. All checks passed. Ready to commit and push?

Upon confirmation:

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to X.Y.Z"
git push
```

## Step 6: Tag & Push Tag

**This step requires explicit user confirmation.** Ask:

> Ready to tag v{X.Y.Z} and push? This will trigger the CI release build.

Upon confirmation:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

## Step 7: Monitor CI

Check the release workflow status:

```bash
gh run list --limit 3
gh run view <run-id> --json jobs --jq '.jobs[] | "\(.name)\t\(.status)\t\(.conclusion // "running")"'
```

Report job statuses in a table. If user asks to check again, re-run the commands.

## Step 8: Release Notes

Once CI succeeds, write bilingual release notes (English on top, Chinese below, separated by `---`).

### Structure

```
## Recopy vX.Y.Z — [Short Title]

[1-2 sentence summary]

### Highlights / What's New
- bullet points of changes (derived from commits)

### Downloads
| Platform | File |
| table of assets from `gh release view` |

### Notes
- **macOS:** The app is not notarized yet. On first launch: right-click → Open → confirm. See [Installation Guide](https://github.com/shiqkuangsan/Recopy/blob/main/docs/macos-unsigned-app.md).
- Platform testing status

---

## Recopy vX.Y.Z — [中文标题]

[same content in Chinese]

### 说明
- **macOS：** 应用尚未公证。首次打开：右键 → 打开 → 确认。详见 [安装指南](https://github.com/shiqkuangsan/Recopy/blob/main/docs/macos-unsigned-app.md)。
```

### Content Rules

- Derive highlights from `git log <prev-tag>..vX.Y.Z --oneline`
- Group by: features, fixes, improvements, chores
- Skip merge commits and trivial chores
- Get actual asset names from `gh release view vX.Y.Z --json assets`

Update the draft release:

```bash
gh release edit vX.Y.Z --notes "<release notes>"
```

## Step 8.5: Sync to Gitee

After release notes are written, sync the release to Gitee for China mainland users.

**This step requires the `GITEE_TOKEN` environment variable.** If not set, skip and remind the user.

### Procedure

1. Download all release assets from GitHub:

```bash
TAG="vX.Y.Z"
mkdir -p /tmp/gitee-sync
gh release download "$TAG" -R shiqkuangsan/Recopy -D /tmp/gitee-sync
```

2. Generate Gitee version of `latest.json` (replace GitHub URLs with Gitee):

```bash
cd /tmp/gitee-sync
sed -i '' 's|https://github.com/shiqkuangsan/Recopy/releases/download/|https://gitee.com/shiqkuangsan/Recopy/releases/download/|g' latest.json
```

3. Create Gitee Release and upload all assets (including `latest.json`):

```bash
# Get release notes from GitHub
BODY=$(gh release view "$TAG" -R shiqkuangsan/Recopy --json body -q '.body')

# Create Release
RELEASE_ID=$(curl -sf -X POST "https://gitee.com/api/v5/repos/shiqkuangsan/Recopy/releases" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg token "$GITEE_TOKEN" \
    --arg tag "$TAG" \
    --arg name "Recopy $TAG" \
    --arg body "$BODY" \
    '{access_token: $token, tag_name: $tag, name: $name, body: $body, target_commitish: "main"}'
  )" | jq -r '.id')

# Upload all assets (including latest.json)
for file in /tmp/gitee-sync/*; do
  [ -f "$file" ] || continue
  fname=$(basename "$file")
  curl -sf -X POST \
    "https://gitee.com/api/v5/repos/shiqkuangsan/Recopy/releases/${RELEASE_ID}/attach_files" \
    -F "access_token=${GITEE_TOKEN}" \
    -F "file=@${file}" > /dev/null
  echo "  ✓ $fname"
done
```

4. Push `latest.json` to GitHub `updater` branch (Gitee mirror sync will propagate it):

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

Note: The `latest.json` pushed here contains **Gitee download URLs** (from step 2). Gitee mirror sync will copy this branch as-is, so the Gitee updater endpoint `raw/updater/latest.json` will point to Gitee release assets. The GitHub endpoint uses its own `latest.json` from release assets (with GitHub URLs).

5. Clean up:

```bash
rm -rf /tmp/gitee-sync /tmp/github-updater
```

Report upload progress for each file. If any upload fails, report which file failed but continue with the rest.

## Step 9: Announcement Copy

Generate 3 tiers of announcement copy in both languages (6 total), using **X/Twitter-compatible plain text format**:

1. **Formal** — for tech communities and forums (X thread style)
2. **Casual** — for social media and friend groups
3. **Short** — single post, must be under 280 characters

### Formatting Rules

- **No Markdown syntax**: no `**bold**`, no `- bullet lists`, no `[link](url)`. X does not render Markdown — raw `**` and `-` will show as literal text.
- Use emoji prefixes (⌨️ 🧠 ⭐ 🖥️ 📜 🔍 🚀 etc.) as visual separators for feature lines
- Add hashtags at the end of formal sections: `#opensource #clipboard #macOS #Windows #tauri #rust`
- Casual section adds `#Recopy #opensource` (or Chinese equivalents)
- Links as plain URLs (no Markdown link syntax)

### Content to include

- Website link: https://recopy.pages.dev/
- Download link: https://github.com/shiqkuangsan/Recopy/releases/tag/vX.Y.Z
- GitHub link: https://github.com/shiqkuangsan/Recopy (formal section only)

Save the generated copy to `todos/temp/release/announcements.X.Y.Z.md`.

## Step 10: Final Summary

Present a summary table:

| Item              | Status                          |
| ----------------- | ------------------------------- |
| Version           | vX.Y.Z                          |
| Tests             | ✅ / ❌                         |
| Local build       | ✅ / skipped                    |
| Tag pushed        | ✅                              |
| CI build          | ✅ all jobs                     |
| Release notes     | ✅ filled                       |
| Gitee sync        | ✅ / skipped                    |
| Announcement copy | ✅ saved to todos/temp/release/ |

Remind user: go to GitHub Releases page and click **Publish release** when ready.

## Red Lines

- **Never** push tag without user confirmation
- **Never** publish the release (only draft)
- **Never** add AI co-author signatures to commits
- If any pre-check fails, stop immediately
