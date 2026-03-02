# Recopy 技术选型文档

> **Archive Notice**: 本文档是 Recopy（原名 EasyCV）的技术选型决策记录。
> 详细记录了每个技术决策的候选方案、对比分析和选择理由。
> 供社区学习"如何为桌面应用做技术选型"的参考。
>
> 原始日期：2026-02-23 | 归档日期：2026-03-02

---

## Retrospective: 选型验证

| 选型 | 计划 | 实际 | 结论 |
|------|------|------|------|
| Tauri v2 | ✅ | ✅ 核心框架 | 体积和性能优势显著验证 |
| React | 18 | **19** | 跟进最新版本，无兼容问题 |
| Tailwind CSS | v4 | ✅ v4 + `@theme` | `@theme` 自定义属性比传统 config 更灵活 |
| Zustand | ✅ | ✅ | 简洁高效，完全符合预期 |
| SQLite FTS5 | trigram + external content | trigram + **standalone** | standalone 更简单，性能足够 |
| tauri-nspanel | 计划使用 | **自行 FFI** | 插件兼容性不佳，改为直接调用 AppKit |
| tauri-plugin-updater | V1 跳过 | **V1 已集成** | 提前实现，用户体验提升 |

---

## 一、选型总览

| 层级 | 选型 | 实际版本 |
|------|------|---------|
| 应用框架 | **Tauri v2** | 2.x |
| 前端框架 | **React + TypeScript** | React 19 + TS 5.6+ |
| 构建工具 | **Vite** | 6.x |
| UI 方案 | **Tailwind CSS v4 + Radix UI** | Tailwind 4 + Radix |
| 状态管理 | **Zustand** | 5.x |
| 数据库 | **SQLite**（Rust sqlx） | sqlx 0.8 |
| 全文搜索 | **SQLite FTS5 + trigram** | standalone 模式 |
| 剪贴板 | **tauri-plugin-clipboard-x** | 最新版 |
| 全局快捷键 | **tauri-plugin-global-shortcut** | 2.x |
| 系统托盘 | **Tauri 内置 tray-icon** | 内置 |
| 国际化 | **i18next + react-i18next** | i18next 23 |
| 自动更新 | **tauri-plugin-updater** | 2.x |
| 虚拟列表 | **@tanstack/react-virtual** | 3.x |
| 图标 | **Lucide React** | 最新版 |
| 包管理 | **pnpm** | 9+ |

---

## 二、核心决策论证

### 决策 1：应用框架 — Tauri v2（而非 Electron）

这是整个项目最关键的技术决策。

#### 对比数据

| 指标 | Electron | Tauri v2 |
|------|----------|----------|
| 安装包体积 | 80-150 MB | **~8 MB（DMG）** |
| 空闲内存占用 | 200-300 MB | **30-40 MB** |
| 冷启动时间 | 1-2 秒 | **< 0.5 秒** |
| 渲染引擎 | 自带 Chromium | 系统 WebView |
| 后端语言 | Node.js | Rust |
| 安全模型 | 默认开放 | 默认最小权限 |

#### 为什么 Tauri 适合剪贴板管理器

1. **体积与性能是核心需求**。常驻后台的工具类应用，用户对内存和体积极度敏感。实际 DMG 仅 ~8MB，内存 30-40MB。
2. **已有成功先例**。EcoPaste（6.5k GitHub stars）使用 Tauri v2 + React 验证了可行性。
3. **Rust 后端适合系统级操作**。剪贴板监听、NSPanel FFI、osascript 调用，Rust 通过 FFI 调用原生 API 的性能和安全性优于 Node.js。
4. **快捷键响应速度**。面板是预创建窗口，show/hide 切换，实际响应远快于 200ms 要求。

#### Tauri 的已知风险与实际验证

| 风险 | 预判 | 实际情况 |
|------|------|---------|
| WebView 跨平台渲染差异 | 影响小 | ✅ Tailwind CSS 跨引擎一致性好 |
| 需要 Rust 能力 | 可控 | ✅ 核心 Rust 代码量合理 |
| NSPanel 集成困难 | 依赖 tauri-nspanel | ⚠️ 自行 FFI 实现，比预期复杂但可控 |
| 生态不如 Electron | 插件有限 | ✅ 所需插件全部可用 |

---

### 决策 2：剪贴板操作 — tauri-plugin-clipboard-x

#### 候选方案

| 方案 | 维护者 | 格式支持 | 监听 | 评价 |
|------|--------|----------|------|------|
| **tauri-plugin-clipboard-x** ✅ | ayangweb（EcoPaste 作者） | 全格式 | ✅ | 生产验证 |
| tauri-plugin-clipboard（CrossCopy） | CrossCopy | 全格式 | ✅ | 备选 |
| Tauri 官方 clipboard | Tauri 团队 | 纯文本+图片 | ❌ | 不够用 |

选择理由：EcoPaste 生产验证，专为剪贴板管理器设计，底层使用 clipboard-rs。

---

### 决策 3：数据库 — SQLite + Rust sqlx

#### 为什么是 SQLite

- 零配置零依赖，跨平台行为一致
- 单用户本地应用，轻松应对 10 万+ 条记录
- FTS5 内置全文搜索
- WAL 模式支持读写并发（后台写入不阻塞前端读取）

#### 为什么用 Rust sqlx（而非前端 SQL 插件）

| 方式 | 说明 | 选择 |
|------|------|------|
| **Rust sqlx** | Rust 侧直接操作，通过 Tauri command 暴露 | ✅ |
| 前端 tauri-plugin-sql | 前端 JS 写 SQL | ❌ |

优势：编译时类型检查、Rust 侧处理 blob 无 IPC 开销、FTS5 灵活控制。

#### 数据库位置

```
macOS:  ~/Library/Application Support/com.recopy.app/recopy.db
Windows: %APPDATA%/com.recopy.app/recopy.db
```

---

### 决策 4：全文搜索 — FTS5 + trigram（standalone 模式）

#### 中文搜索问题

SQLite FTS5 的 `unicode61` tokenizer 按空格分词，不支持中文。`trigram` 每 3 个连续字符作为 token，天然支持任意子串匹配。

| 方案 | 中文支持 | 额外依赖 | 选择 |
|------|----------|---------|------|
| **FTS5 trigram** | ✅ 子串匹配 | 无 | ✅ |
| FTS5 + simple tokenizer | ✅ 分词+拼音 | 需编译扩展 | V2 考虑 |
| LIKE '%keyword%' | ✅ | 无 | 性能差 |

> **实际经验**：原始计划使用 external content 模式（FTS 表引用主表数据，避免重复存储），
> 实际使用 **standalone 模式**（FTS 表独立维护数据）。standalone 更简单，
> 不需要维护触发器同步数据，对本应用的数据规模性能足够。

---

### 决策 5：前端框架 — React 19 + TypeScript

| 框架 | 生态 | TypeScript | Tauri 适配 |
|------|------|-----------|-----------|
| **React 19** ✅ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Vue 3 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Svelte | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

选择理由：EcoPaste 已验证 React + Tauri 可行性；虚拟列表方案成熟；生态最大。

---

### 决策 6：UI 方案 — Tailwind CSS v4 + Radix UI

#### 为什么不用 Ant Design

| 方案 | 体积 | 可定制性 | 适合场景 |
|------|------|----------|---------|
| Ant Design | 重 (~1MB+) | 中 | 后台管理 |
| **Tailwind + Radix** ✅ | 极轻 | 极高 | 精致工具 App |

选择理由：
- 对标 Paste 的 Glassmorphism 风格需要完全自定义
- Tailwind v4 的 `@theme` 指令 + `data-theme` 属性实现 dark/light 切换
- Radix UI 提供无样式可访问组件（Dialog, Tabs, Context Menu 等）
- 安装包不需要带大型组件库

---

### 决策 7：状态管理 — Zustand

| 方案 | 体积 | 学习成本 | TypeScript |
|------|------|----------|-----------|
| **Zustand** ✅ | 1.5KB | 极低 | 极好 |
| Valtio | 3KB | 低 | 好 |
| Redux Toolkit | 13KB | 中 | 好 |

状态逻辑不复杂（历史列表、搜索词、视图状态、设置项），Zustand 完全覆盖。

实际使用了 3 个 store：
- `clipboard-store`：剪贴板条目、搜索、过滤
- `settings-store`：主题、语言、快捷键、保留策略
- `toast-store` / `update-store`：UI 状态

---

## 三、关键插件清单

| 插件 | 用途 | 状态 |
|------|------|------|
| tauri-plugin-clipboard-x | 剪贴板读写 + 监听 | ✅ |
| tauri-plugin-global-shortcut | 全局快捷键 | ✅ |
| tauri-plugin-autostart | 开机自启动 | ✅ |
| tauri-plugin-updater | 自动更新 | ✅ |
| tauri-plugin-single-instance | 单实例 | ✅ |
| tauri-plugin-process | 进程控制（重启） | ✅ |
| Tauri 内置 tray-icon | 系统托盘 | ✅ |

Rust crate 依赖：

| Crate | 用途 |
|-------|------|
| sqlx (sqlite) | SQLite 数据库 |
| serde / serde_json | 序列化 |
| uuid | 主键生成 |
| sha2 | SHA-256 内容哈希 |
| image | 缩略图生成 |
| tokio | 异步运行时 |
| sys-locale | 系统语言检测 |

---

## 四、架构概览

```
┌──────────────────────────────────────────────────────────┐
│                     前端（WebView）                        │
│                                                          │
│  React 19 + TypeScript + Vite                            │
│  ├── UI 层：Tailwind CSS v4 + Radix UI + Lucide          │
│  ├── 状态管理：Zustand                                    │
│  ├── 虚拟列表：@tanstack/react-virtual                    │
│  ├── 国际化：i18next + react-i18next                      │
│  └── Tauri API 调用（invoke / listen）                    │
│                                                          │
├──────────────── Tauri IPC Bridge ─────────────────────────┤
│                                                          │
│                     后端（Rust）                           │
│                                                          │
│  Tauri v2 Core                                           │
│  ├── commands/clipboard.rs                               │
│  │   └── 所有 IPC commands (CRUD, paste, settings...)    │
│  ├── db/                                                 │
│  │   ├── models.rs (数据类型)                             │
│  │   ├── queries.rs (SQL 查询)                           │
│  │   └── mod.rs (连接池 + migrations)                    │
│  ├── clipboard/mod.rs                                    │
│  │   └── SHA-256, 缩略图生成, 原图存储                    │
│  ├── platform/                                           │
│  │   ├── macos.rs (NSPanel FFI, HUD, main-thread)        │
│  │   └── fallback.rs (非 macOS stubs)                    │
│  └── lib.rs                                              │
│      └── App setup, tray, shortcuts, clipboard monitor    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 窗口架构

| 窗口 | 大小 | 类型 | 行为 |
|------|------|------|------|
| 主面板 | 全宽 × 380px | NSPanel (macOS) | 非激活浮动，底部弹出，blur-to-hide |
| 设置 | 640×520 | 普通窗口 | 可调整大小，关闭时重新注册快捷键 |
| HUD | 140×140 | NSPanel (macOS) | 非激活，800ms 自动关闭 |

---

## 五、性能关键点

### 虚拟列表
- @tanstack/react-virtual，只渲染可视区域卡片
- 支持水平滚动 + 日期分组 header

### 图片缩略图
- Rust `image` crate 生成 400px 宽缩略图
- 缩略图存 DB blob（列表加载），原图存文件系统（查看大图）
- 文件缩略图异步后台生成

### 搜索去抖
- 前端 150ms debounce
- FTS5 查询 < 100ms

### SQLite WAL
- 读写并发，后台写入不阻塞前端读取
- 最大 5 连接池

---

## 六、与 EcoPaste 的技术对比

EcoPaste 是最接近的参考项目，以下是差异化选择：

| 维度 | EcoPaste | Recopy | 差异理由 |
|------|----------|--------|----------|
| UI 组件库 | Ant Design | Tailwind + Radix | 精致 Glassmorphism UI 需要完全自定义 |
| 状态管理 | Valtio | Zustand | 更轻量、TS 推断更好 |
| 数据库操作 | 前端 SQL 插件 | Rust sqlx | 类型安全、性能更好 |
| CSS 方案 | UnoCSS | Tailwind CSS v4 | 生态更大 |
| 窗口方案 | 普通窗口 | NSPanel FFI | 非激活浮动体验更好 |
| 主题 | CSS 变量 | Tailwind `@theme` + `data-theme` | 更系统化 |
| React | 18 | **19** | 跟进最新 |

---

## 七、构建与分发

### 构建产物

| 平台 | 格式 | 体积 |
|------|------|------|
| macOS (aarch64) | .dmg | ~8 MB |
| Windows (x64) | NSIS .exe | ~4 MB |

### CI/CD（GitHub Actions）

- `ci.yml`：每次 push/PR 跑 `tsc --noEmit` + `vitest run` + `cargo test` + `cargo check`
- `release.yml`：版本 tag 触发 macOS + Windows 双平台构建，上传 GitHub Releases
- `update-homebrew.yml`：Release 发布后自动更新 Homebrew Cask

### 代码签名

- macOS：暂未签名，用户需右键打开或 `xattr -cr` 解除限制
- Windows：暂未签名，SmartScreen 会提示
