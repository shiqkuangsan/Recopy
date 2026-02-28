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

## Step 9: Announcement Copy

Generate 3 tiers of announcement copy in both languages (6 total):

1. **Formal** — for tech communities and forums
2. **Casual** — for friend groups and social media
3. **Short** — one-liner for quick sharing

Include:

- Website link: https://recopy.pages.dev/
- Download link: https://github.com/shiqkuangsan/Recopy/releases/tag/vX.Y.Z
- GitHub link: https://github.com/shiqkuangsan/Recopy

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
| Announcement copy | ✅ saved to todos/temp/release/ |

Remind user: go to GitHub Releases page and click **Publish release** when ready.

## Red Lines

- **Never** push tag without user confirmation
- **Never** publish the release (only draft)
- **Never** add AI co-author signatures to commits
- If any pre-check fails, stop immediately
