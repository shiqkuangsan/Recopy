# Recopy 开发与测试计划

> **Archive Notice**: 本文档是 Recopy（原名 EasyCV）的完整开发与测试计划，记录了从零到 v1.0 的全过程。
> 所有里程碑均已完成，v1.0.0 于 2026-02-27 发布，当前版本 v1.0.3。
> 供社区学习"如何规划一个桌面应用从零到发布"的完整过程。
>
> 原始日期：2026-02-23 | 归档日期：2026-03-02

---

## 进度总览

| 里程碑 | 状态 | 任务进度 | 测试进度 | 备注 |
|--------|------|----------|----------|------|
| M0 项目骨架 | `已完成` | 6/6 | 3/3 | 2026-02-23 |
| M1 剪贴板监听+存储 | `已完成` | 7/8 | 5/6 | M1-8 来源 App 后续实现 |
| M2 主面板 UI | `已完成` | 9/9 | 5/7 | 2026-02-23 |
| M3 搜索+粘贴 | `已完成` | 7/7 | 4/6 | 2026-02-23 |
| M4 收藏 | `已完成` | 3/3 | 2/2 | 分组功能已移除 |
| M5 系统集成 | `已完成` | 5/5 | 4/4 | NSPanel 已实现 |
| M6 设置+隐私 | `已完成` | 6/7 | 4/5 | App 排除列表留 placeholder |
| M7 i18n+打包 | `已完成` | 6/6 | 4/4 | 含自动更新 |
| M8 UI 优化 | `已完成` | 7/7 | - | 毛玻璃 + NSPanel + HUD |

依赖关系：`M0 → M1 → M2 → M3 → (M4 | M5 | M6) → M7 → M8`

---

## M0：项目骨架

**目标**：Tauri v2 + React + Tailwind + SQLite 跑通，空窗口能弹出

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M0-1 | 初始化 Tauri v2 + React + TypeScript + Vite 项目 | `已完成` | 手动搭建（CLI 交互模式不可用） |
| M0-2 | 配置 Tailwind CSS v4 + 色板 | `已完成` | @tailwindcss/vite + `@theme` 自定义属性 |
| M0-3 | 配置 Rust 依赖（sqlx, serde, uuid 等） | `已完成` | 全部依赖编译通过 |
| M0-4 | 配置前端依赖（Zustand, Radix UI, Lucide 等） | `已完成` | 7 个核心依赖安装完成 |
| M0-5 | SQLite 初始化 + migration 系统搭建 | `已完成` | FTS5 standalone 模式 |
| M0-6 | 验证 dev 模式 & build 模式均可运行 | `已完成` | dev 模式验证通过 |

### 验收标准

- [x] 空窗口显示标题
- [x] dev 模式有 HMR（修改 React 组件热更新）
- [x] SQLite DB 文件存在于正确的系统路径
- [x] migration 系统正常执行建表 SQL

---

## M1：剪贴板监听 + 存储

**目标**：clipboard-x 监听 → Rust 解析 → SQLite 写入

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M1-1 | 集成 tauri-plugin-clipboard-x | `已完成` | Rust + JS API，capabilities 已配置 |
| M1-2 | 实现剪贴板变更监听（Rust 侧） | `已完成` | clipboard-changed 事件 |
| M1-3 | 实现内容类型判断与解析 | `已完成` | files → image → html → text 优先级 |
| M1-4 | 实现内容哈希计算（SHA-256） | `已完成` | clipboard/mod.rs: compute_hash() |
| M1-5 | 实现去重逻辑 | `已完成` | queries::find_and_bump_by_hash() |
| M1-6 | 实现图片处理：缩略图生成 + 原图存储 | `已完成` | generate_thumbnail(400px) + save_original_image() |
| M1-7 | 实现大小限制检查 | `已完成` | 可配置 max_item_size_mb（默认 10MB） |
| M1-8 | 实现来源 App 检测（macOS） | `后续实现` | source_app + source_app_name 字段已有 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M1-T1 | 数据库 CRUD 操作正确 | `已通过` | cargo test |
| M1-T2 | 内容哈希计算正确 | `已通过` | cargo test: test_compute_hash |
| M1-T3 | 去重逻辑：相同内容不产生新记录 | `已通过` | cargo test: test_dedup_by_hash |
| M1-T4 | 图片缩略图生成尺寸正确（400px 宽） | `已通过` | cargo test |
| M1-T5 | 大小限制：超出跳过，不超出正常存储 | `已通过` | cargo test |

### 验收标准

- [x] 在任意 App 中 Cmd+C，后台在 500ms 内捕获并存入数据库
- [x] 纯文本、富文本、图片、文件四种类型均能正确识别和存储
- [x] 连续复制相同内容只产生一条记录（去重生效）
- [x] 关闭重新打开，历史记录完整
- [x] 图片缩略图正确生成，原图正确存储到 filesystem

---

## M2：主面板 UI

**目标**：底部弹窗 + 水平卡片流 + 四种卡片渲染 + 日期分组

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M2-1 | 实现底部 slide-up 弹窗 | `已完成` | 面板布局 + 动画 |
| M2-2 | 实现搜索框组件 | `已完成` | SearchBar + 150ms debounce + auto-focus + IME 支持 |
| M2-3 | 实现类型过滤 Tab | `已完成` | TypeFilter: All/Text/Rich/Image/File |
| M2-4 | 实现视图切换 | `已完成` | ViewTabs: History/Pins |
| M2-5 | 实现纯文本卡片渲染 | `已完成` | TextCard: 4 行截断 |
| M2-6 | 实现富文本卡片渲染 | `已完成` | RichTextCard: plain_text 预览 |
| M2-7 | 实现图片卡片渲染 | `已完成` | ImageCard: thumbnail + lazy loading |
| M2-8 | 实现文件卡片渲染 | `已完成` | FileCard: 扩展名图标 + 大小显示 |
| M2-9 | 实现虚拟列表 | `已完成` | @tanstack/react-virtual + 时间分组 header |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M2-T1 | 纯文本卡片正确渲染，长文本截断 | `已通过` | Vitest |
| M2-T2 | 富文本卡片渲染 | `已通过` | Vitest |
| M2-T3 | 图片卡片显示缩略图 | `已通过` | Vitest |
| M2-T4 | 文件卡片显示文件名和图标 | `已通过` | Vitest |
| M2-T5 | Zustand store 状态逻辑正确 | `已通过` | Vitest |

### 验收标准

- [x] 面板从底部弹出，macOS 毛玻璃背景
- [x] 四种类型卡片有差异化的预览渲染
- [x] 卡片按时间分组（Today / Yesterday / ...）
- [x] 卡片底部显示来源 App 名称 + 相对时间
- [x] 收藏卡片有 Pin 标记

---

## M3：搜索 + 粘贴

**目标**：FTS5 搜索 + 类型过滤 + 点击/回车粘贴到前台 App

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M3-1 | 实现 FTS5 全文搜索 | `已完成` | search_items + search_items_like |
| M3-2 | 实现搜索 debounce（150ms） | `已完成` | SearchBar 组件 |
| M3-3 | 实现类型过滤逻辑 | `已完成` | TypeFilter + store 联动 |
| M3-4 | 实现键盘导航 | `已完成` | useKeyboardNav: 方向键 + Enter 粘贴 + Cmd+C 复制 |
| M3-5 | 实现自动粘贴（macOS） | `已完成` | osascript 模拟 Cmd+V |
| M3-6 | 实现降级：仅写入剪贴板模式 | `已完成` | copyToClipboard |
| M3-7 | 实现右键上下文菜单 | `已完成` | ItemContextMenu: 粘贴/纯文本粘贴/复制/收藏/删除 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M3-T1 | FTS5 搜索：中文子串匹配正确 | `已通过` | cargo test |
| M3-T2 | FTS5 搜索：英文关键词匹配正确 | `已通过` | cargo test |
| M3-T4 | 搜索框 debounce 150ms 生效 | `已通过` | Vitest |
| M3-T5 | 类型过滤 + 搜索叠加正确 | `已通过` | cargo test |

### 验收标准

- [x] 中文搜索正确
- [x] 搜索 + 类型过滤可叠加
- [x] 全键盘操作完成：呼出 → 浏览 → 选中 → 粘贴 → 关闭
- [x] "粘贴为纯文本"粘贴无格式
- [x] "复制到剪贴板"不关闭面板

---

## M4：收藏

**目标**：Pin 功能 + 收藏视图

> **设计决策**：经竞品调研（Paste、CleanClip、Maccy、Raycast），分组功能属于重度用户付费特性，
> 对免费工具而言收藏 + 搜索 + 类型筛选已足够。分组功能已移除（~430 行代码）。

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M4-1 | 实现收藏/取消收藏功能 | `已完成` | toggle_favorite + 右键菜单 + 星标 |
| M4-2 | 实现收藏视图 | `已完成` | Pins Tab → fetchFavorites() |
| M4-3 | 收藏视图支持类型筛选 | `已完成` | content_type 参数 |

### 验收标准

- [x] 收藏一条内容后，清除全部历史，该条目仍存在于收藏视图
- [x] 收藏视图中可直接点击粘贴
- [x] 收藏视图支持按类型筛选
- [x] 已收藏卡片在历史流中有星标标记

---

## M5：系统集成

**目标**：全局快捷键 + 托盘图标 + 开机自启 + 单实例 + NSPanel

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M5-1 | 实现全局快捷键注册 | `已完成` | tauri-plugin-global-shortcut，Cmd+Shift+V toggle |
| M5-2 | 实现系统托盘图标 + 菜单 | `已完成` | Show/Settings/Quit + i18n 菜单 |
| M5-3 | 实现开机自启动 | `已完成` | tauri-plugin-autostart |
| M5-4 | 实现单实例运行 | `已完成` | tauri-plugin-single-instance |
| M5-5 | 实现 NSPanel 窗口（macOS） | `已完成` | 自行 FFI 集成 AppKit（非 tauri-nspanel） |

> **经验教训**：tauri-nspanel 插件存在兼容性问题，最终选择直接通过 Rust FFI 调用 AppKit API
> 实现 NSPanel。所有 AppKit 操作必须在主线程执行，使用 `run_on_main_thread()` 调度。

### 验收标准

- [x] 在任意上下文按快捷键，面板在 200ms 内出现
- [x] macOS 菜单栏图标常驻
- [x] 右键托盘图标显示菜单
- [x] 第二次启动时聚焦已有窗口
- [x] NSPanel 不激活窗口，不抢焦点

---

## M6：设置 + 隐私

**目标**：设置窗口 + 历史清理策略 + 深色/浅色

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M6-1 | 实现设置窗口 | `已完成` | General/History/About Tab，640×520 窗口 |
| M6-2 | 实现快捷键自定义 | `已完成` | 录制快捷键 UI + 持久化 |
| M6-3 | 实现历史保留策略 | `已完成` | unlimited/days/count 三种策略 |
| M6-4 | 实现 App 排除列表 | `placeholder` | UI 已留位，实现依赖来源 App 检测 |
| M6-5 | 实现一键清空历史 | `已完成` | 二次确认 + 保留收藏 |
| M6-6 | 实现外观切换 | `已完成` | dark/light/system + `data-theme` 属性 |
| M6-7 | 实现失焦关闭设置 | `已完成` | close_on_blur 可配置 |

### 测试清单

| # | 验证项 | 状态 | 方法 |
|---|--------|------|------|
| M6-T1 | 设置持久化到 DB 并重启恢复 | `已通过` | cargo test |
| M6-T2 | 历史清理策略正确执行 | `已通过` | cargo test |
| M6-T4 | 清空历史保留收藏条目 | `已通过` | cargo test |

### 验收标准

- [x] 修改快捷键后立即生效
- [x] 设置"保留最近 30 天"，30 天前的未收藏记录自动清除
- [x] 清空历史后，收藏条目仍保留
- [x] dark/light/system 三种模式切换正确

---

## M7：i18n + 打包

**目标**：中英双语 + macOS .dmg + Windows NSIS + 自动更新

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M7-1 | 集成 i18next + react-i18next | `已完成` | 系统语言检测 + 手动切换 |
| M7-2 | 提取所有 UI 文案为 i18n key | `已完成` | 含托盘菜单 i18n |
| M7-3 | 配置 Tauri 打包（macOS .dmg） | `已完成` | minimumSystemVersion 12.0 |
| M7-4 | 配置 Tauri 打包（Windows NSIS） | `已完成` | installMode=both |
| M7-5 | 配置自动更新（tauri-plugin-updater） | `已完成` | GitHub Releases + JSON manifest |
| M7-6 | 配置 GitHub Actions CI/CD | `已完成` | ci.yml + release.yml |

### 验收标准

- [x] 语言切换（中↔英）后所有 UI 文案无遗漏
- [x] macOS .dmg 安装流程正常
- [x] Windows NSIS 安装流程正常
- [x] CI 每次 push 自动跑 cargo test + vitest
- [x] Release tag 自动构建双平台安装包
- [x] 自动更新检测 + 下载 + 安装正常

---

## M8：UI 优化 + 交互增强

**目标**：底部浮动毛玻璃面板 + 水平卡片 + HUD 反馈 + 快捷键优化

### 开发任务

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| M8-1 | 底部全宽浮动面板 + macOS 毛玻璃效果 | `已完成` | NSPanel + transparent |
| M8-2 | 水平卡片布局 + 日期分组 | `已完成` | 横向滚动 + 分组 header |
| M8-3 | 单行 header（ViewTabs + SearchBar + TypeFilter） | `已完成` | 紧凑布局 |
| M8-4 | 卡片半透明玻璃效果 | `已完成` | bg-card/60 border-border/50 |
| M8-5 | Cmd+C 复制 + 双击复制 + HUD 反馈 | `已完成` | CopyHud 窗口 140×140，800ms 自动关闭 |
| M8-6 | 粘贴流程优化：resign → paste → hide | `已完成` | NSPanel resign + osascript + async hide |
| M8-7 | 去除复制/粘贴时 updated_at 更新 | `已完成` | 列表排序稳定 |

### 验收标准

- [x] 面板从底部弹出，macOS 毛玻璃背景
- [x] 卡片按日期分组，水平滚动
- [x] Cmd+C / 双击卡片复制，显示 HUD 反馈
- [x] Enter 粘贴到前台应用
- [x] 复制/粘贴不改变卡片排序位置

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
- 22 个测试用例，5 个测试文件

### CI 矩阵（GitHub Actions）

```yaml
strategy:
  matrix:
    platform:
      - macos (aarch64)
      - windows (x64)
steps:
  - tsc --noEmit
  - vitest run
  - cargo test
  - cargo check
```

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-02-23 | 初始版本，M0-M8 全部完成 |
| 2026-02-23 | 移除 Groups 分组功能（~430 行） |
| 2026-02-27 | v1.0.0 发布，M7 自动更新已实现 |
| 2026-02-27 | NSPanel 自行 FFI 实现（替代 tauri-nspanel） |
| 2026-03-02 | v1.0.3 发布，含图标优化、设置窗口调整、Homebrew 分发 |
| 2026-03-02 | 归档至 docs/archive/ |
