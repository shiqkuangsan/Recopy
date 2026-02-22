# EasyCV 技术选型文档

> 版本：V1.0  
> 日期：2026-02-23  
> 关联文档：easycv-prd-v1.md（产品需求文档）

---

## 一、选型总览

| 层级 | 选型 | 说明 |
|------|------|------|
| 应用框架 | **Tauri v2** | Rust 后端 + Web 前端，轻量跨平台 |
| 前端框架 | **React 18 + TypeScript** | 生态成熟，EcoPaste 已验证 |
| 构建工具 | **Vite** | 快速 HMR，Tauri 官方推荐 |
| UI 方案 | **Tailwind CSS + Radix UI** | 轻量可定制，避免重型组件库 |
| 状态管理 | **Zustand** | 轻量、TypeScript 友好、无 boilerplate |
| 数据库 | **SQLite**（通过 Rust sqlx） | 轻量零配置，本地持久存储 |
| 全文搜索 | **SQLite FTS5 + trigram tokenizer** | 零额外依赖，支持中文子串匹配 |
| 剪贴板操作 | **tauri-plugin-clipboard-x** | 支持全格式读写 + 变更监听 |
| 全局快捷键 | **tauri-plugin-global-shortcut** | Tauri 官方插件 |
| 系统托盘 | **Tauri 内置 tray-icon** | Tauri v2 内置能力 |
| 包管理 | **pnpm** | 快、节省磁盘 |
| 国际化 | **i18next + react-i18next** | 中英双语 |
| 自动更新 | **tauri-plugin-updater** | Tauri 官方插件 |

---

## 二、核心决策论证

### 决策 1：应用框架 — Tauri v2（而非 Electron）

这是整个项目最关键的技术决策。结论：**选 Tauri v2**。

#### 对比数据

| 指标 | Electron | Tauri v2 |
|------|----------|----------|
| 安装包体积 | 80-150 MB | **2.5-10 MB** |
| 空闲内存占用 | 200-300 MB | **30-40 MB** |
| 冷启动时间 | 1-2 秒 | **< 0.5 秒** |
| 渲染引擎 | 自带 Chromium（一致） | 系统 WebView（轻量） |
| 后端语言 | Node.js | Rust |
| 安全模型 | 默认开放，需手动收紧 | 默认最小权限，按需开放 |
| 生态成熟度 | ⭐⭐⭐⭐⭐（10年+） | ⭐⭐⭐⭐（快速增长中） |

#### 为什么 Tauri 适合 EasyCV

1. **体积与性能是核心需求**。EasyCV 是常驻后台的工具类应用，用户对内存和体积极度敏感。一个剪贴板管理器占 200MB 内存是不可接受的。Tauri 的 30-40MB 内存和 <10MB 安装包完全符合预期。

2. **已有成功先例**。EcoPaste（6.5k GitHub stars）使用完全相同的技术栈（Tauri v2 + React），已在 macOS/Windows/Linux 三平台验证了剪贴板管理场景的可行性。这大幅降低了技术风险。

3. **快捷键响应速度**。PRD 要求面板 200ms 内出现。Tauri 冷启动 < 500ms，面板是预创建的窗口切换显示/隐藏，实际响应远快于 200ms。

4. **Rust 后端适合剪贴板监听**。剪贴板监听需要调用系统原生 API（macOS NSPasteboard / Windows clipboard listener），Rust 通过 FFI 调用原生 API 的性能和安全性优于 Node.js。

#### Tauri 的已知风险与应对

| 风险 | 说明 | 应对 |
|------|------|------|
| WebView 跨平台渲染差异 | macOS 用 WebKit，Windows 用 WebView2（Chromium） | 实际影响小（CSS 差异有限），EcoPaste 已验证；Tailwind 原子化 CSS 跨引擎一致性好 |
| 需要 Rust 能力 | 后端逻辑和原生交互需 Rust | 核心 Rust 代码量可控（剪贴板监听 + 数据库操作），大量插件已封装好 |
| 生态不如 Electron | 社区插件和文档较少 | EasyCV 所需的关键插件（剪贴板、快捷键、托盘、SQLite、自动更新）全部已有成熟方案 |

---

### 决策 2：剪贴板操作 — tauri-plugin-clipboard-x

这是 EasyCV 的核心能力，需要仔细选型。

#### 候选方案对比

| 方案 | 维护者 | 支持格式 | 变更监听 | 说明 |
|------|--------|----------|----------|------|
| **tauri-plugin-clipboard-x** | ayangweb（EcoPaste 作者） | 纯文本、富文本(RTF)、HTML、图片、文件 | ✅ | 专为 Tauri v2 设计，EcoPaste 生产验证 |
| tauri-plugin-clipboard（CrossCopy） | CrossCopy 团队 | 纯文本、HTML、RTF、图片、文件 | ✅ | 社区最早的方案，文档完善 |
| Tauri 官方 clipboard 插件 | Tauri 团队 | 纯文本、HTML、图片（v2 新增） | ❌ 不支持监听 | 不支持 RTF、文件；无变更监听 |

#### 选型：tauri-plugin-clipboard-x

理由：
- 由 EcoPaste 作者（ayangweb）开发和维护，专门为剪贴板管理器场景设计
- EcoPaste 在生产环境中已充分验证了该插件在三平台上的稳定性
- 底层使用 clipboard-rs（Rust crate）进行跨平台剪贴板操作
- API 简洁：`startListening()` + `onClipboardChange()` 即可监听所有类型变更
- 支持我们需要的全部格式：plain text / rich text / HTML / image / files

#### API 概览

```typescript
// 监听剪贴板变化
import { startListening, onClipboardChange } from "tauri-plugin-clipboard-x-api";

await startListening();
const unlisten = await onClipboardChange((result) => {
  // result 包含类型和内容
  console.log(result);
});

// 读写操作
import {
  readText, writeText,
  readHtml, writeHtml,
  readRichText, writeRichText,
  readImage, writeImage,
  readFiles, writeFiles,
  hasText, hasImage, hasHtml, hasRichText, hasFiles
} from "tauri-plugin-clipboard-x-api";
```

#### 备选方案

如果 clipboard-x 出现维护问题，可切换到 CrossCopy 的 tauri-plugin-clipboard，API 设计类似，迁移成本低。

---

### 决策 3：数据库 — SQLite（通过 Rust sqlx 操作）

#### 为什么是 SQLite

- 零配置、零依赖：无需安装数据库服务器，数据库就是一个本地文件
- 跨平台：SQLite 在 macOS / Windows / Linux 上行为完全一致
- 性能足够：单用户本地应用，SQLite 轻松应对 10 万+ 条记录
- FTS5 全文搜索：内置扩展，无需引入额外搜索引擎
- Tauri 生态完善：有多个成熟的 SQLite 插件

#### 操作方式：Rust 侧 sqlx 直接操作（而非前端 SQL 插件）

有两种方式在 Tauri 中使用 SQLite：

| 方式 | 说明 | 选择 |
|------|------|------|
| **Rust 侧 sqlx** | 在 Rust 代码中用 sqlx crate 直接操作 SQLite，通过 Tauri command 暴露给前端 | ✅ 选这个 |
| 前端 tauri-plugin-sql | 前端 JS 直接写 SQL 语句，通过插件桥接到 SQLite | ❌ |

选 Rust sqlx 的理由：
- 类型安全：sqlx 的 `query_as!` 宏在编译时检查 SQL 语法和类型映射
- 性能：Rust 侧处理数据无需 IPC 序列化开销（尤其处理图片 blob 时）
- 灵活性：可以自由使用 FTS5 扩展、自定义函数、事务控制
- 迁移管理：sqlx 内置 migration 系统，schema 变更可追踪

EcoPaste 使用前端 tauri-plugin-sql 方案，但他们在 Rust 侧也有大量自定义 command。对于 EasyCV，统一在 Rust 侧操作数据库更清晰。

#### 数据库文件位置

```
macOS:  ~/Library/Application Support/com.easycv.app/easycv.db
Windows: %APPDATA%/com.easycv.app/easycv.db
```

图片等大 blob 存储策略：
- 缩略图（≤ 200KB）：直接存 SQLite blob 字段，减少 I/O 次数
- 原图（> 200KB）：存文件系统，数据库只存路径引用
- 文件路径：`{app_data_dir}/images/{YYYY-MM}/{uuid}.{ext}`

---

### 决策 4：全文搜索 — SQLite FTS5 + trigram tokenizer

#### 问题：FTS5 默认不支持中文

SQLite FTS5 内置三种 tokenizer：
- `unicode61`：按空格/标点分词，**不能正确处理中文**（中文没有空格分隔词语）
- `porter`：英文词干提取（correction → correct），不支持中文
- `trigram`：每 3 个连续字符作为一个 token，**支持任意子串匹配，包括中文**

#### 方案选择

| 方案 | 中文支持 | 复杂度 | 说明 |
|------|----------|--------|------|
| FTS5 + trigram | ✅ 子串匹配 | 低 | 无需额外依赖，索引略大 |
| FTS5 + simple tokenizer（第三方扩展） | ✅ 分词 + 拼音 | 中 | 需编译加载扩展 |
| FTS5 + ICU tokenizer | ✅ 分词 | 高 | 需系统安装 ICU 库 |
| 纯 SQL LIKE '%keyword%' | ✅ | 无 | 性能差，万条记录以上明显卡顿 |

#### V1 选择：FTS5 trigram

理由：
- 零额外依赖，trigram 是 FTS5 内置 tokenizer
- 对中文的子串匹配天然支持（搜"中文"能匹配到"支持中文搜索"）
- 性能远好于 LIKE，10 万条记录搜索仍在 100ms 以内
- 缺点是索引体积比 unicode61 大（每条记录生成更多 token），但本地应用可接受
- V2 如果需要拼音搜索，可引入 simple tokenizer 扩展

#### FTS5 表结构

```sql
-- FTS5 虚拟表，用于全文搜索
CREATE VIRTUAL TABLE clipboard_fts USING fts5(
  plain_text,           -- 纯文本内容（富文本也提取纯文本）
  file_name,            -- 文件名
  source_app_name,      -- 来源应用名
  content='clipboard_items',  -- 外部内容表
  content_rowid='rowid',
  tokenize='trigram'
);
```

使用外部内容表（external content）模式，避免数据重复存储。

---

### 决策 5：前端框架 — React 18 + TypeScript

#### 为什么不是 Vue / Svelte

| 框架 | 生态 | TypeScript | Tauri 适配 | 说明 |
|------|------|-----------|-----------|------|
| **React 18** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | EcoPaste 已验证，组件库最丰富 |
| Vue 3 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 也很好，但社区组件库不如 React |
| Svelte | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 编译时框架，运行时更轻，但生态较小 |

React 选型理由：
- EcoPaste 用 React + Tauri v2 已验证可行性，可直接参考其架构
- 虚拟列表（@tanstack/react-virtual）成熟方案，10 万条卡片流必须虚拟化
- TypeScript 一等公民支持
- 团队（个人）最熟悉的框架应优先——如果你更熟 Vue，换 Vue 完全没问题

---

### 决策 6：UI 方案 — Tailwind CSS + Radix UI

#### 为什么不用 Ant Design

EcoPaste 使用 Ant Design（antd），但 EasyCV 不推荐：

| 方案 | 体积 | 可定制性 | 风格 |
|------|------|----------|------|
| Ant Design | 重（~1MB+ CSS/JS） | 中（主题系统较重） | 企业风，不适合工具类 App |
| **Tailwind + Radix UI** | 极轻（按需） | 极高（原子化 CSS） | 完全自定义 |
| shadcn/ui | 轻（基于 Radix） | 极高（直接复制源码） | 现代、简洁 |

选择 Tailwind + Radix UI 的理由：
- EasyCV 需要类 Paste 的精致卡片 UI，不是后台管理页面
- Tailwind 的原子化 CSS 在 WebKit（macOS）和 Chromium（Windows WebView2）上一致性好
- Radix UI 提供无样式的可访问组件（Dialog、Popover、Context Menu 等），自己控制视觉
- 可以选择性引入 shadcn/ui 组件（它是 Radix + Tailwind 的预封装）
- 安装包体积更小——工具类应用不需要带一整套企业级组件库

---

### 决策 7：状态管理 — Zustand

| 方案 | 体积 | 学习成本 | TypeScript | 说明 |
|------|------|----------|-----------|------|
| **Zustand** | 1.5KB | 极低 | 极好 | 简洁直觉，无 Provider |
| Valtio | 3KB | 低 | 好 | EcoPaste 使用，proxy-based |
| Redux Toolkit | 13KB | 中 | 好 | 太重，不适合小工具 |
| Jotai | 2.5KB | 低 | 好 | 原子化状态，适合细粒度 |

EasyCV 的状态逻辑不复杂（历史列表、搜索关键词、当前视图、设置项），Zustand 足够覆盖且代码最少。

---

## 三、关键 Tauri 插件清单

| 插件 | 用途 | 来源 | FR 对应 |
|------|------|------|---------|
| **tauri-plugin-clipboard-x** | 剪贴板读写 + 监听 | 社区（EcoPaste 作者） | FR-01 |
| **tauri-plugin-global-shortcut** | 全局快捷键 | Tauri 官方 | FR-02 |
| **tauri-plugin-autostart** | 开机自启动 | Tauri 官方 | FR-09 |
| **tauri-plugin-updater** | 自动更新检查 | Tauri 官方 | NFR-04 |
| **tauri-plugin-log** | 日志记录 | Tauri 官方 | 调试 |
| **tauri-plugin-single-instance** | 单实例运行 | Tauri 官方 | 基础 |
| **tauri-plugin-os** | 获取系统信息 | Tauri 官方 | 辅助 |
| **tauri-plugin-fs** | 文件系统操作（图片存储） | Tauri 官方 | FR-01 |
| Tauri 内置 tray-icon | 系统托盘 | Tauri 内置 | FR-08 |
| Tauri 内置 window API | 窗口管理（面板显隐） | Tauri 内置 | FR-02 |

Rust crate 依赖：

| Crate | 用途 |
|-------|------|
| **sqlx**（sqlite feature） | SQLite 数据库操作 |
| **serde / serde_json** | 序列化（IPC 数据传递） |
| **uuid** | 主键生成 |
| **sha2 / md5** | 内容哈希（去重） |
| **image** | 图片缩略图生成 |
| **tokio** | 异步运行时（Tauri 依赖） |

---

## 四、架构概览

```
┌──────────────────────────────────────────────────────────┐
│                     前端（WebView）                        │
│                                                          │
│  React 18 + TypeScript + Vite                            │
│  ├── UI 层：Tailwind CSS + Radix UI                      │
│  ├── 状态管理：Zustand                                    │
│  ├── 虚拟列表：@tanstack/react-virtual                    │
│  ├── 国际化：i18next                                      │
│  └── Tauri API 调用（invoke / listen）                    │
│                                                          │
├──────────────── Tauri IPC Bridge ─────────────────────────┤
│                                                          │
│                     后端（Rust）                           │
│                                                          │
│  Tauri v2 Core                                           │
│  ├── 剪贴板模块                                           │
│  │   ├── clipboard-x 插件：监听 + 读写                    │
│  │   ├── 内容解析：类型判断、纯文本提取、缩略图生成          │
│  │   └── App 来源检测：获取前台 App 信息                   │
│  │                                                       │
│  ├── 数据库模块                                           │
│  │   ├── sqlx + SQLite：CRUD 操作                        │
│  │   ├── FTS5 trigram：全文搜索                           │
│  │   └── migrations：schema 版本管理                      │
│  │                                                       │
│  ├── 系统集成模块                                         │
│  │   ├── global-shortcut：全局快捷键                      │
│  │   ├── tray-icon：系统托盘                              │
│  │   ├── autostart：开机自启                              │
│  │   └── single-instance：单实例控制                      │
│  │                                                       │
│  └── 存储模块                                             │
│      ├── SQLite 数据库文件                                │
│      └── 图片文件目录                                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 前后端通信

前端通过 Tauri 的 `invoke()` 调用 Rust command，通过 `listen()` 监听 Rust 发出的事件。

```
前端 → 后端（Command）：
  invoke('get_clipboard_items', { query, filters })  → Vec<ClipboardItem>
  invoke('toggle_favorite', { itemId })               → bool
  invoke('create_group', { name })                    → Group
  invoke('delete_item', { itemId })                   → ()
  invoke('paste_item', { itemId, asPlainText })       → ()
  invoke('get_settings')                              → Settings
  invoke('update_settings', { settings })             → ()

后端 → 前端（Event）：
  emit('clipboard-changed', { item })    — 新的剪贴板条目
  emit('monitor-status', { running })    — 监听状态变化
```

---

## 五、性能关键点

### 5.1 虚拟列表

10 万条历史记录不能全部渲染 DOM，必须虚拟化。

使用 `@tanstack/react-virtual`（EcoPaste 同款）：
- 只渲染可视区域内的卡片（通常 20-50 个）
- 滚动时动态回收和创建 DOM 节点
- 支持动态高度（不同类型卡片高度不同）

### 5.2 图片缩略图

图片类型的剪贴板内容可能很大（截屏 4K = 8MB+），直接渲染会卡：
- Rust 侧接收到图片后，用 `image` crate 生成固定宽度缩略图（如 400px 宽）
- 缩略图存数据库 blob，列表中只加载缩略图
- 点击查看大图时再从文件系统加载原图

### 5.3 搜索去抖

用户输入搜索关键词时，每次按键触发搜索会导致频繁查询：
- 前端 debounce 150ms（输入停顿 150ms 后才执行搜索）
- Rust 侧搜索本身应在 100ms 内返回（FTS5 索引查询）

### 5.4 WAL 模式

SQLite 默认使用 WAL（Write-Ahead Logging）模式：
- 读写并发：后台写入新记录不阻塞前端读取列表
- 对常驻后台应用至关重要

---

## 六、开发环境要求

### 必需工具

| 工具 | 版本 | 说明 |
|------|------|------|
| **Rust** | 1.77.2+ | Tauri v2 最低要求 |
| **Node.js** | 18+ | 前端构建 |
| **pnpm** | 9+ | 包管理 |
| **Tauri CLI** | 2.x | `cargo install tauri-cli` |

### 平台依赖

**macOS：**
- Xcode Command Line Tools
- 系统自带 WebKit，无需额外安装

**Windows：**
- Visual Studio Build Tools（C++ 工具集）
- WebView2 Runtime（Windows 10/11 通常已预装）

### 项目结构

```
easycv/
├── src/                          # 前端源码
│   ├── components/               # React 组件
│   │   ├── CardList/             # 卡片流列表（虚拟化）
│   │   ├── SearchBar/            # 搜索框
│   │   ├── TypeFilter/           # 类型过滤 Tab
│   │   ├── GroupSidebar/         # 分组侧边栏
│   │   ├── SettingsWindow/       # 设置窗口
│   │   └── ClipboardCard/        # 单张卡片（文本/图片/文件）
│   ├── hooks/                    # 自定义 hooks
│   ├── stores/                   # Zustand stores
│   ├── lib/                      # 工具函数
│   ├── i18n/                     # 国际化资源
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                    # Rust 后端源码
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # Tauri setup
│   │   ├── commands/             # Tauri commands（暴露给前端）
│   │   │   ├── clipboard.rs      # 剪贴板相关
│   │   │   ├── database.rs       # 数据查询
│   │   │   ├── settings.rs       # 设置
│   │   │   └── paste.rs          # 粘贴操作
│   │   ├── db/                   # 数据库层
│   │   │   ├── mod.rs
│   │   │   ├── models.rs         # 数据模型
│   │   │   └── queries.rs        # SQL 查询
│   │   ├── clipboard/            # 剪贴板监听逻辑
│   │   └── utils/                # 工具（哈希、缩略图等）
│   ├── migrations/               # SQLite migrations
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

---

## 七、构建与分发

### 构建产物

| 平台 | 格式 | 说明 |
|------|------|------|
| macOS | `.dmg` + `.app` | 标准 macOS 安装 |
| macOS（Homebrew） | Cask formula | `brew install --cask easycv` |
| Windows | `.msi` + `.exe`（NSIS） | 标准 Windows 安装 |
| Windows（winget） | Manifest | `winget install easycv` |

### CI/CD

使用 GitHub Actions 自动构建：
- Tauri 官方提供 `tauri-apps/tauri-action` GitHub Action
- 支持自动构建 macOS（Intel + Apple Silicon）和 Windows 安装包
- Release 时自动上传到 GitHub Releases
- 自动更新的 JSON manifest 也发布到 GitHub Releases

### 代码签名（V1 可选，推荐尽早配置）

- macOS：Apple Developer 证书（开源项目可先不签名，用户需手动允许）
- Windows：无签名会触发 SmartScreen 警告（开源项目可先不签名）

---

## 八、与 EcoPaste 的技术对比

EcoPaste 是最接近的参考项目，以下是 EasyCV 的差异化技术选择：

| 维度 | EcoPaste | EasyCV | 差异理由 |
|------|----------|--------|----------|
| UI 组件库 | Ant Design | Tailwind + Radix | Paste 级精致 UI 需要完全自定义，Ant Design 太"后台管理" |
| 状态管理 | Valtio | Zustand | 更轻量、无 proxy 魔法、TypeScript 推断更好 |
| 数据库操作 | 前端 tauri-plugin-sql | Rust sqlx | 类型安全、性能更好、FTS5 控制更灵活 |
| CSS 方案 | UnoCSS | Tailwind CSS | 生态更大，工具链更成熟 |
| 剪贴板插件 | tauri-plugin-clipboard-x | 同上 | 同一个插件，EcoPaste 作者维护 |
| 构建工具 | Vite | Vite | 相同 |
| 框架 | React 18 | React 18 | 相同 |

---

## 附录 A：关键依赖版本锁定

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@tauri-apps/api": "^2.1.0",
    "@tauri-apps/plugin-global-shortcut": "^2.2.0",
    "@tauri-apps/plugin-autostart": "^2.2.0",
    "@tauri-apps/plugin-updater": "^2.3.0",
    "@tauri-apps/plugin-log": "^2.2.0",
    "@tauri-apps/plugin-os": "^2.2.0",
    "@tauri-apps/plugin-fs": "^2.2.0",
    "@tauri-apps/plugin-process": "^2.2.0",
    "tauri-plugin-clipboard-x-api": "latest",
    "@tanstack/react-virtual": "^3.11.0",
    "zustand": "^5.0.0",
    "i18next": "^23.16.0",
    "react-i18next": "^15.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@radix-ui/react-context-menu": "^2.2.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-popover": "^1.1.0"
  }
}
```

```toml
# src-tauri/Cargo.toml 关键依赖
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-clipboard-x = "0.1"
tauri-plugin-global-shortcut = "2.2"
tauri-plugin-autostart = "2.2"
tauri-plugin-updater = "2.3"
tauri-plugin-log = "2.2"
tauri-plugin-single-instance = "2.2"
tauri-plugin-fs = "2.2"
tauri-plugin-os = "2.2"
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
sha2 = "0.10"
image = "0.25"
tokio = { version = "1", features = ["full"] }
```
