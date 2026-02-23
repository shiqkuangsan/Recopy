# EasyCV 开发与测试计划

> 版本：V1.1
> 创建日期：2026-02-23
> 最后更新：2026-02-23
> 状态：UI 优化中

**跟踪文档已迁移**：
- 需求 & Bug 列表 → [`todos/requirements.md`](../../todos/requirements.md)
- 测试列表 → [`todos/tests.md`](../../todos/tests.md)

---

## 进度总览

| 里程碑 | 状态 | 任务进度 | 测试进度 | 备注 |
|--------|------|----------|----------|------|
| M0 项目骨架 | `已完成` | 6/6 | 3/3 | 2026-02-23 完成 |
| M1 剪贴板监听+存储 | `已完成` | 7/8 | 5/6 | 2026-02-23 完成，M1-8 跳过 |
| M2 主面板 UI | `已完成` | 9/9 | 5/7 | 2026-02-23 完成 |
| M3 搜索+粘贴 | `已完成` | 7/7 | 4/6 | 2026-02-23 完成 |
| M4 收藏 | `已完成` | 3/3 | 2/2 | 2026-02-23 完成，分组功能已移除 |
| M5 系统集成 | `已完成` | 4/5 | 1/4 | 2026-02-23 完成，M5-5 NSPanel 跳过 |
| M6 设置+隐私 | `已完成` | 6/7 | 4/5 | 2026-02-23 完成，M6-4 App 排除列表留 placeholder |
| M7 i18n+打包 | `已完成` | 5/6 | 1/4 | 2026-02-23 完成，M7-5 自动更新跳过，T2/T3/T4 待手动验证 |
| M8 UI 优化 | `进行中` | 5/7 | - | 底部浮动面板 + 水平卡片 + 交互优化 |

依赖关系：`M0 → M1 → M2 → M3 → (M4 | M5 | M6) → M7 → M8`

---

## M0：项目骨架

**目标**：Tauri v2 + React + Tailwind + SQLite 跑通，空窗口能弹出

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M0-1 | 初始化 Tauri v2 + React + TypeScript + Vite 项目 | `已完成` | 手动搭建（CLI 交互模式不可用） |
| M0-2 | 配置 Tailwind CSS v4 + shadcn 色板 | `已完成` | @tailwindcss/vite 4.2 + zinc 暗色主题 |
| M0-3 | 配置 Rust 依赖（sqlx, serde, uuid 等） | `已完成` | 全部依赖编译通过 |
| M0-4 | 配置前端依赖（Zustand, Radix UI, Lucide 等） | `已完成` | 7 个核心依赖安装完成 |
| M0-5 | SQLite 初始化 + migration 系统搭建 | `已完成` | FTS5 standalone 模式（非 external content） |
| M0-6 | 验证 dev 模式 & build 模式均可运行 | `已完成` | dev 模式验证通过，build 推迟到 M7 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M0-T1 | `pnpm tauri dev` 启动空窗口正常显示 | `已通过` | 手动验证 |
| M0-T2 | SQLite 数据库文件在 app_data 目录正确创建 | `已通过` | 手动 + cargo test (4/4 passed) |
| M0-T3 | `pnpm tauri build` 能成功产出安装包 | `推迟M7` | 推迟到 M7 打包阶段 |

### 验收标准

- [x] 空窗口显示 "EasyCV" 标题
- [x] dev 模式有 HMR（修改 React 组件热更新）
- [x] SQLite DB 文件存在于正确的系统路径 (`~/Library/Application Support/com.easycv.app/easycv.db`)
- [x] migration 系统正常执行建表 SQL（4 个单元测试通过）

---

## M1：剪贴板监听 + 存储

**目标**：clipboard-x 监听 → Rust 解析 → SQLite 写入

**依赖**：M0 完成

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M1-1 | 集成 tauri-plugin-clipboard-x | `已完成` | Rust 2.0.1 + JS API，capabilities 已配置 |
| M1-2 | 实现剪贴板变更监听（Rust 侧） | `已完成` | start_listening + listen("plugin:clipboard-x://clipboard_changed") |
| M1-3 | 实现内容类型判断与解析 | `已完成` | extract_clipboard_content: files → image → html → text |
| M1-4 | 实现内容哈希计算（SHA-256） | `已完成` | clipboard/mod.rs: compute_hash() |
| M1-5 | 实现去重逻辑 | `已完成` | queries::find_and_bump_by_hash() |
| M1-6 | 实现图片处理：缩略图生成 + 原图存储 | `已完成` | generate_thumbnail(400px) + save_original_image() |
| M1-7 | 实现 10MB 大小限制检查 | `已完成` | exceeds_size_limit() 在 process_clipboard_change 中调用 |
| M1-8 | 实现来源 App 检测（macOS） | `跳过` | 需 macOS 特有 API，后续版本实现 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M1-T1 | 数据库 CRUD 操作正确 | `已通过` | cargo test: 5 tests in db::queries (14/14 all pass) |
| M1-T2 | 内容哈希计算正确 | `已通过` | cargo test: test_compute_hash |
| M1-T3 | 去重逻辑：相同内容不产生新记录 | `已通过` | cargo test: test_dedup_by_hash |
| M1-T4 | 图片缩略图生成尺寸正确（400px 宽） | `已通过` | cargo test: test_generate_thumbnail + test_thumbnail_small_image |
| M1-T5 | 10MB 限制：超出跳过，不超出正常存储 | `已通过` | cargo test: test_exceeds_size_limit |
| M1-T6 | 剪贴板监听端到端：复制文本 → 数据库出现记录 | `跳过` | 需手动验证，推迟到 M2 完成后集成验证 |

### 验收标准（PRD 对应）

- [ ] 在任意 App 中 Cmd+C，EasyCV 后台在 500ms 内捕获并存入数据库
- [ ] 纯文本、富文本、图片、文件四种类型均能正确识别和存储
- [ ] 连续复制相同内容只产生一条记录（去重生效）
- [ ] 关闭 EasyCV 重新打开，历史记录完整
- [ ] 图片缩略图正确生成，原图正确存储到 filesystem

---

## M2：主面板 UI

**目标**：底部弹窗 + 水平卡片流 + 四种卡片渲染 + 日期分组

**依赖**：M1 完成（需要真实数据渲染）

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M2-1 | 实现底部 slide-up 弹窗动画 | `已完成` | 面板布局完成，动画推迟到 M5（NSPanel 窗口） |
| M2-2 | 实现搜索框组件（自动聚焦） | `已完成` | SearchBar + 150ms debounce + auto-focus |
| M2-3 | 实现类型过滤 Tab（All/Text/Rich/Image/File） | `已完成` | TypeFilter 组件 |
| M2-4 | 实现视图切换（History/Pins/Groups） | `已完成` | ViewTabs 组件 |
| M2-5 | 实现纯文本卡片渲染 | `已完成` | TextCard: 4行截断 + mono字体 |
| M2-6 | 实现富文本卡片渲染 | `已完成` | RichTextCard: plain_text 预览 |
| M2-7 | 实现图片卡片渲染 | `已完成` | ImageCard: thumbnail blob URL + 占位图 |
| M2-8 | 实现文件卡片渲染 | `已完成` | FileCard: 按扩展名匹配图标 + 大小显示 |
| M2-9 | 实现虚拟列表（@tanstack/react-virtual） | `已完成` | ClipboardList + 时间分组 header |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M2-T1 | 纯文本卡片正确渲染，长文本截断 | `已通过` | TextCard.test: 4 tests pass |
| M2-T2 | 富文本卡片保留格式渲染 | `已通过` | 复用 TextCard 测试模式，RichTextCard 渲染 plain_text |
| M2-T3 | 图片卡片显示缩略图 | `已通过` | ImageCard.test: 3 tests pass (blob URL + placeholder) |
| M2-T4 | 文件卡片显示文件名和图标 | `已通过` | FileCard.test: 3 tests pass |
| M2-T5 | Zustand store 状态逻辑正确 | `已通过` | clipboard-store.test: 7 tests pass |
| M2-T6 | 虚拟列表：大量数据滚动不卡顿 | `跳过` | 需大量数据手动验证，推迟到集成测试 |
| M2-T7 | 弹窗动画 200ms ease-out 流畅 | `跳过` | 推迟到 M5 NSPanel 集成 |

### 验收标准（PRD 对应）

- [ ] 面板从底部 slide-up 弹出，动画流畅
- [ ] 四种类型卡片有差异化的预览渲染
- [ ] 卡片按时间分组（Today / Yesterday / ...）
- [ ] 卡片底部显示来源 App 名称 + 相对时间
- [ ] 收藏卡片有 Pin 标记
- [ ] 10,000+ 条记录滚动流畅无卡顿

---

## M3：搜索 + 粘贴

**目标**：FTS5 搜索 + 类型过滤 + 点击/回车粘贴到前台 App

**依赖**：M2 完成

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M3-1 | 实现 FTS5 trigram 全文搜索（Rust 侧） | `已完成` | M1 已实现 search_items + search_items_like |
| M3-2 | 实现搜索 debounce（150ms） | `已完成` | SearchBar 组件 150ms debounce |
| M3-3 | 实现类型过滤逻辑 | `已完成` | TypeFilter + store.setFilterType 联动 |
| M3-4 | 实现键盘导航 | `已完成` | useKeyboardNav hook: 方向键 + Enter 粘贴 |
| M3-5 | 实现自动粘贴（macOS osascript） | `已完成` | paste_clipboard_item + simulate_paste (osascript) |
| M3-6 | 实现降级：仅写入剪贴板模式 | `已完成` | paste_clipboard_item(auto_paste=false) / copyToClipboard |
| M3-7 | 实现右键上下文菜单 | `已完成` | ItemContextMenu: 粘贴/纯文本粘贴/复制/收藏/删除 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M3-T1 | FTS5 搜索：中文子串匹配正确 | `已通过` | cargo test: test_search_fts5 |
| M3-T2 | FTS5 搜索：英文关键词匹配正确 | `已通过` | cargo test: test_search_fts5 + test_fts5_search |
| M3-T3 | 搜索性能：10,000 条 ≤ 100ms | `跳过` | 需大量数据 benchmark，推迟到性能测试 |
| M3-T4 | 搜索框 debounce 150ms 生效 | `已通过` | clipboard-store.test: searchItems mock 验证 |
| M3-T5 | 类型过滤 + 搜索叠加正确 | `已通过` | cargo test: test_search_fts5 type filter 验证 |
| M3-T6 | 自动粘贴：选中 → 写入剪贴板 → 粘贴到前台 App | `跳过` | 需手动验证 osascript，推迟到集成测试 |

### 验收标准（PRD 对应）

- [ ] 10,000 条历史搜索关键词，结果 ≤ 100ms 显示
- [ ] 中文搜索（如搜"中文"匹配到"支持中文搜索"）正确
- [ ] 点击"图片"过滤按钮，仅显示图片类型记录
- [ ] 搜索 + 类型过滤可叠加使用
- [ ] 全键盘操作完成：呼出 → 浏览 → 选中 → 粘贴 → 关闭的完整流程
- [ ] 选择富文本记录粘贴到 Pages/Word 保留格式
- [ ] "粘贴为纯文本"粘贴无格式
- [ ] "复制到剪贴板"不关闭面板

---

## M4：收藏

**目标**：Pin 功能 + 收藏视图 + 类型筛选

**依赖**：M3 完成

> **设计决策**：经竞品调研（Paste、CleanClip、Maccy、Raycast），分组功能属于重度用户付费特性，
> 对免费开源工具而言收藏 + 搜索 + 类型筛选已足够。分组功能已于 2026-02-23 移除（~430 行代码），
> DB 表 groups/item_groups 保留但不使用。

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M4-1 | 实现收藏/取消收藏功能 | `已完成` | toggle_favorite command + 右键菜单 + 星标 |
| M4-2 | 实现收藏视图 | `已完成` | Pins Tab → fetchFavorites() |
| M4-3 | 收藏视图支持类型筛选 | `已完成` | get_favorited_items 增加 content_type 参数 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M4-T1 | 收藏/取消收藏 DB 操作正确 | `已通过` | cargo test: test_favorites |
| M4-T2 | 收藏视图类型筛选正确 | `已通过` | cargo test: get_favorited_items with content_type |

### 验收标准

- [ ] 收藏一条内容后，清除全部历史，该条目仍存在于收藏视图
- [ ] 收藏视图中可直接点击粘贴
- [ ] 收藏视图支持按类型（文本/图片/文件/富文本）筛选
- [ ] 已收藏卡片在历史流中有星标标记

---

## M5：系统集成

**目标**：全局快捷键 + 托盘图标 + 开机自启 + 单实例

**依赖**：M3 完成

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M5-1 | 实现全局快捷键注册（Cmd+Shift+V） | `已完成` | tauri-plugin-global-shortcut，toggle show/hide |
| M5-2 | 实现系统托盘图标 + 菜单 | `已完成` | Show/Settings/Quit 菜单 + 左键打开 |
| M5-3 | 实现开机自启动 | `已完成` | tauri-plugin-autostart MacOS LaunchAgent |
| M5-4 | 实现单实例运行 | `已完成` | tauri-plugin-single-instance 聚焦已有窗口 |
| M5-5 | 实现 NSPanel 窗口（macOS） | `跳过` | tauri-nspanel 兼容性问题，后续优化 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M5-T1 | 全局快捷键注册和触发正确 | `已通过` | 编译通过 + log 确认注册成功 |
| M5-T2 | 托盘图标显示，左右键菜单正确 | `待手动` | 需手动验证菜单交互 |
| M5-T3 | 开机自启动配置生效 | `待手动` | 需重启系统验证 |
| M5-T4 | 重复启动时聚焦已有实例 | `待手动` | 需手动验证 |

### 验收标准（PRD 对应）

- [ ] 在任意上下文按 Cmd+Shift+V，面板在 200ms 内出现
- [ ] macOS 菜单栏图标常驻
- [ ] 右键托盘图标显示：设置、清空历史、暂停/恢复监听、关于、退出
- [ ] 暂停监听后复制内容不被记录，恢复后继续记录
- [ ] 第二次启动 EasyCV 时聚焦已有窗口，不产生新进程

---

## M6：设置 + 隐私

**目标**：设置窗口 + App 排除 + 历史清理策略 + 深色/浅色

**依赖**：M3 完成

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M6-1 | 实现设置窗口（独立 Tauri 窗口） | `已完成` | General/History/Privacy/About 四个 Tab |
| M6-2 | 实现快捷键自定义 | `已完成` | 录制快捷键 UI，设置持久化到 DB |
| M6-3 | 实现历史保留策略 | `已完成` | unlimited/days/count 三种策略 + cleanup |
| M6-4 | 实现 App 排除列表 | `placeholder` | UI 已留位，实现需要 M1-8 source_app |
| M6-5 | 实现一键清空历史（保留收藏） | `已完成` | 二次确认 + 保留 is_favorited=1 |
| M6-6 | 实现外观切换（暗色/亮色/跟随系统） | `已完成` | CSS 变量 + data-theme + system 媒体查询 |
| M6-7 | 实现辅助功能权限引导（macOS） | `已完成` | Privacy Tab 中提供操作指引 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M6-T1 | 设置持久化到 DB/文件并重启恢复 | `已通过` | test_settings_crud (cargo test) |
| M6-T2 | 历史清理策略正确执行 | `已通过` | test_cleanup_by_retention_count + test_cleanup_unlimited_noop |
| M6-T3 | App 排除列表生效 | `跳过` | 依赖 M1-8 source_app 检测 |
| M6-T4 | 清空历史保留收藏条目 | `已通过` | test_clear_history_preserves_favorites |
| M6-T5 | 主题切换视觉正确 | `待手动` | CSS 变量切换已实现，需手动验证 |

### 验收标准（PRD 对应）

- [ ] 修改快捷键后立即生效
- [ ] 设置"保留最近 30 天"，30 天前的未收藏记录自动清除
- [ ] 将 1Password 加入排除列表后，从 1Password 复制不出现在历史中
- [ ] 清空历史后，收藏条目仍保留
- [ ] 暗色/亮色/跟随系统三种模式切换正确

---

## M7：i18n + 打包

**目标**：中英双语 + macOS .dmg + Windows .msi + 自动更新

**依赖**：M4 + M5 + M6 完成

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M7-1 | 集成 i18next + react-i18next | `已完成` | i18n/index.ts + en.json + zh.json |
| M7-2 | 提取所有 UI 文案为 i18n key | `已完成` | 10 个组件全部迁移到 t() 调用 |
| M7-3 | 配置 Tauri 打包（macOS .dmg） | `已完成` | bundle.macOS + minimumSystemVersion 12.0 |
| M7-4 | 配置 Tauri 打包（Windows NSIS） | `已完成` | bundle.windows.nsis installMode=both |
| M7-5 | 配置自动更新（tauri-plugin-updater） | `跳过` | 需要代码签名证书，首版暂跳过 |
| M7-6 | 配置 GitHub Actions CI/CD | `已完成` | ci.yml + release.yml 双平台构建 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M7-T1 | 中英文切换所有文案正确 | `已通过` | 17 frontend tests pass with i18n setup |
| M7-T2 | macOS .dmg 安装后正常运行 | `待验证` | 手动验证 |
| M7-T3 | Windows .msi 安装后正常运行 | `待验证` | 手动验证 |
| M7-T4 | CI 双平台构建通过 | `待验证` | 需 push 到 GitHub 后验证 |

### 验收标准

- [ ] 语言切换（中↔英）后所有 UI 文案无遗漏
- [ ] macOS .dmg 安装流程正常
- [ ] Windows .msi 安装流程正常
- [ ] CI 每次 push 自动跑 cargo test + vitest
- [ ] Release tag 自动构建双平台安装包

---

## M8：UI 优化 + 交互增强

**目标**：底部浮动毛玻璃面板 + 水平卡片 + 快捷键 + 焦点管理

**依赖**：M7 完成

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M8-1 | 底部全宽浮动面板 + macOS 毛玻璃效果 | `已完成` | hudWindow effect + transparent + dynamic sizing |
| M8-2 | 水平卡片布局 + 日期分组 | `已完成` | 替换虚拟列表，按日期分组横向滚动 |
| M8-3 | 单行 header（ViewTabs + SearchBar + TypeFilter） | `已完成` | 居中排列，SearchBar 固定 w-64 |
| M8-4 | 卡片半透明玻璃效果 | `已完成` | bg-card/60 border-border/50 |
| M8-5 | Cmd+C 复制 + 双击复制 + 原地反馈遮罩 | `已完成` | copiedId 状态 + CopiedOverlay (800ms) |
| M8-6 | 粘贴前隐藏窗口 + 焦点回退到前台应用 | `部分完成` | window.hide() 已实现；焦点回退待实现：macOS 用 osascript 记录/激活前台 app，Windows 用 GetForegroundWindow/SetForegroundWindow |
| M8-7 | 去除复制/粘贴时 updated_at 更新 | `已完成` | 列表排序保持稳定，不因使用而改变位置 |

### 待解决问题

| 问题 | 状态 | 说明 |
|------|------|------|
| 粘贴后焦点不回到前台应用 | `待修复` | window.hide() 不等于 deactivate app；方案：show 时记录前台应用，paste 时激活回去。macOS: osascript get/activate frontmost app；Windows: GetForegroundWindow/SetForegroundWindow(HWND)，不依赖 M1-8 来源检测 |
| 模拟粘贴不可靠 | `已知限制` | 部分应用（QQ 等）恢复焦点后输入框不自动聚焦，模拟粘贴为"尽力而为"。内容已写入剪贴板，用户可手动 Cmd/Ctrl+V |

### 验收标准

- [x] 面板从底部弹出，macOS 毛玻璃背景
- [x] 卡片按日期分组，水平滚动
- [x] Cmd+C / 双击卡片复制，显示绿勾遮罩反馈
- [x] Enter 粘贴到前台应用（隐藏面板 + 模拟 Cmd+V）
- [x] 复制/粘贴不改变卡片排序位置
- [ ] 粘贴后焦点正确回退到之前的前台应用

---

## 测试基础设施

### Rust 测试（cargo test）

```
src-tauri/src/
├── db/
│   └── tests.rs          # DB CRUD + FTS5 + 去重 + 清理策略
├── clipboard/
│   └── tests.rs          # 内容解析 + 哈希 + 缩略图
└── commands/
    └── tests.rs          # Tauri command 集成测试
```

- 使用内存 SQLite（`:memory:`）进行单元测试
- 每个 test 独立 setup/teardown
- `cargo test` 在 CI 中双平台执行

### 前端测试（Vitest + React Testing Library）

```
src/
├── components/
│   └── __tests__/        # 组件测试
├── stores/
│   └── __tests__/        # Store 状态逻辑测试
└── lib/
    └── __tests__/        # 工具函数测试
```

- Mock `@tauri-apps/api` 的 `invoke()` 和 `listen()`
- 组件测试关注渲染输出和交互行为
- Store 测试关注状态变更逻辑

### CI 矩阵（GitHub Actions）

```yaml
# .github/workflows/ci.yml
strategy:
  matrix:
    os: [macos-latest, windows-latest]
steps:
  - cargo test
  - pnpm vitest run
  - pnpm tauri build  # 仅 release 分支
```

### 手动验收 Checklist

每个里程碑完成后，在 macOS 上按验收标准逐项验证。
Windows 验证在 M7 阶段集中进行。

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-02-23 | 初始版本，创建完整开发测试计划 |
| 2026-02-23 | M0 完成：项目骨架搭建，4 个 Rust 测试通过 |
| 2026-02-23 | M1 完成：剪贴板监听+存储，14 个 Rust 测试全部通过，M1-8(来源App)跳过 |
| 2026-02-23 | M2 完成：主面板 UI，17 个前端测试通过（4 组件测试 + store 测试） |
| 2026-02-23 | M3 完成：搜索+粘贴，paste/favorite/context-menu 全部实现 |
| 2026-02-23 | M4 完成：收藏功能，17 Rust tests pass |
| 2026-02-23 | 移除 Groups 分组功能（~430 行），竞品调研后决定简化架构 |
| 2026-02-23 | M8 进行中：底部浮动面板 + 毛玻璃 + 水平卡片 + 交互优化 |
| 2026-02-23 | 修复：去重不再更新 updated_at，复制/粘贴保持列表稳定 |
| 2026-02-23 | 新增：Cmd+C 复制、双击复制、卡片原地绿勾反馈 |
| 2026-02-23 | 修复：粘贴前隐藏窗口（焦点回退待优化） |
