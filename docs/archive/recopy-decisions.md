# Recopy 设计与技术决策记录

> **Archive Notice**: 本文档是 Recopy（原名 EasyCV）早期规划阶段的设计决策记录，供社区学习参考。
> 原始日期：2026-02-23 | 归档日期：2026-03-02

---

## Retrospective: 计划 vs 实际

| 决策项 | 原始计划 | 实际结果 | 说明 |
|--------|---------|---------|------|
| 项目名称 | EasyCV | **Recopy** | 品牌重命名 |
| 开源协议 | MIT | **PolyForm Noncommercial** | 调整为非商业许可 |
| React 版本 | React 18 | **React 19** | 跟进最新版本 |
| 单条大小上限 | 50MB（PRD） → 10MB（决策） | **10MB（可配置 1-100MB）** | 决策正确 |
| 来源 App 图标 | V1 仅名称，V2 加图标 | **V1 仅名称**（保持） | 与计划一致 |
| NSPanel 窗口 | 使用 tauri-nspanel | **自行实现 NSPanel 集成** | tauri-nspanel 兼容性不佳，改为直接 FFI 调用 AppKit |
| 分组功能 | PRD 列为 FR-05 | **已移除** | 竞品调研后简化为收藏 + 搜索 |
| 自动粘贴 (Windows) | enigo Shift+Insert | **未实现** | V1 仅 macOS 自动粘贴 |
| App 排除列表 | V1 实现 | **V1 未实现** | 依赖来源 App 检测，后续版本 |
| 自动更新 | V1 跳过 | **V1 已实现** | tauri-plugin-updater 集成 |

---

## 一、UI/UX 设计

- **风格**：Glassmorphism 毛玻璃效果（从最初的 shadcn Dark Theme 演化而来）
- **主面板**：桌面底部 slide-up 弹窗，全宽 × 380px，NSPanel 非激活浮动窗口
- **卡片流**：横向排列，按时间分组（Today / Yesterday / ...）
- **色板**：基于 Tailwind CSS v4 `@theme` 自定义属性，支持 dark/light/system 三种模式
- **字体**：Inter (400/500/600)
- **圆角**：8px (cards), 6px (buttons/inputs)
- **图标**：Lucide React
- **线框图**：`docs/archive/wireframes/recopy-main-panel.excalidraw`

---

## 二、开发里程碑

```
M0 → M1 → M2 → M3 ─┬─ M4 (收藏)
                     ├─ M5 (系统集成)
                     ├─ M6 (设置/隐私)
                     └─ M7 (i18n/打包) → M8 (UI优化)
```

| 里程碑 | 目标 | 核心交付 | 实际状态 |
|--------|------|---------|---------|
| M0 | 项目骨架 | Tauri v2 + React + Tailwind + SQLite 跑通 | ✅ 完成 |
| M1 | 剪贴板监听 + 存储 | clipboard-x 监听 → Rust 解析 → SQLite 写入 | ✅ 完成 |
| M2 | 主面板 UI | 底部弹窗 + 卡片流 + 四种卡片渲染 + 虚拟列表 | ✅ 完成 |
| M3 | 搜索 + 粘贴 | FTS5 搜索 + 类型过滤 + 点击/回车粘贴 | ✅ 完成 |
| M4 | 收藏 | Pin 功能 + 收藏视图（分组功能已移除） | ✅ 完成 |
| M5 | 系统集成 | 全局快捷键 + 托盘 + 自启 + 单实例 | ✅ 完成 |
| M6 | 设置 + 隐私 | 设置窗口 + 历史清理策略 + 深色/浅色 | ✅ 完成 |
| M7 | i18n + 打包 | 中英双语 + .dmg + NSIS + 自动更新 | ✅ 完成 |
| M8 | UI 优化 | 毛玻璃面板 + NSPanel + HUD 反馈 | ✅ 完成 |

> 所有里程碑均在 2026-02-23 至 2026-02-27 期间完成，v1.0.0 于 2026-02-27 发布。

---

## 三、测试策略

### Rust 后端
- 单元测试：数据库 CRUD、FTS5 搜索、内容哈希/去重、缩略图生成（cargo test，内存 SQLite）
- 集成测试：Tauri command 端到端（cargo test + tauri-test）
- 不测：剪贴板监听本身、窗口显隐（手动验证）

### 前端
- 组件测试：卡片渲染（4 种类型）、搜索框 debounce、类型过滤（Vitest + React Testing Library）
- Store 测试：Zustand store 状态逻辑（Vitest）
- 不测：Tailwind 样式、Tauri invoke 真实调用（mock）

### 跨平台 CI
- CI 矩阵：GitHub Actions macOS (aarch64) + Windows (x64) 跑 cargo test + vitest
- Release：版本 tag 触发 DMG + NSIS 构建
- 前端还包含 `tsc --noEmit` 类型检查

---

## 四、技术实现决策

### 4.1 自动粘贴

主交互（点击/回车）为**主动粘贴**模式，右键"复制到剪贴板"为仅写入模式。

| 平台 | 实现方案 | 权限要求 | 实际状态 |
|------|---------|---------|---------|
| macOS | `osascript` 模拟 Cmd+V，NSPanel resign key window 后执行 | 辅助功能权限 | ✅ 已实现 |
| Windows | `enigo` crate 模拟 Shift+Insert | 无 | ⏳ 未实现 |

**关键实现细节（实际）**：
1. `platform_resign_before_paste()` — 同步 main-thread dispatch，NSPanel 让出焦点
2. `simulate_paste()` — osascript Cmd+V，50ms 延迟
3. `platform_hide_window()` — 异步 fire-and-forget（避免 blur handler 死锁）

### 4.2 来源 App 检测

V1 **只存 App 名称和 bundle ID**，不提取图标。

| 平台 | 实现方式 | 实际状态 |
|------|---------|---------|
| macOS | 剪贴板变更时记录 `source_app`（bundle ID）和 `source_app_name` | ✅ 已实现 |
| Windows | 待实现 | ⏳ |

### 4.3 图片存储

- **缩略图**：Rust `image` crate 压缩到 400px 宽，存 SQLite blob
- **原图**：存文件系统 `{app_data}/images/{YYYY-MM}/{uuid}.png`，DB 只存路径
- **文件缩略图**：异步后台生成，避免阻塞剪贴板处理流程
- **单条记录大小上限**：可配置 1-100MB（默认 10MB），超出自动跳过
- **目录复制**：自动跳过，不记录

### 4.4 主面板窗口类型

| 平台 | 方案 | 实际实现 |
|------|------|---------|
| macOS | NSPanel（自行 FFI 集成 AppKit） | ✅ 非激活浮动面板，`always_on_top` + `can_become_key` |
| Windows | 普通 Tauri 窗口 | ✅ `alwaysOnTop` + `skipTaskbar` + `decorations: false` |

**重要经验**：所有 AppKit 操作必须在主线程执行。Tauri commands 运行在 tokio worker threads，需要 `app.run_on_main_thread()`。同步等待用 `sync_channel`，异步操作用 fire-and-forget。

---

## 五、开源协议

**PolyForm Noncommercial 1.0.0**（最初计划为 MIT，后调整为非商业许可）

---

## 六、PRD 修订记录

基于技术讨论和实际开发，以下 PRD 内容有变更：

| 原始 | 最终结果 | 原因 |
|------|---------|------|
| FR-01.5 单条 50MB 上限 | **10MB（可配置 1-100MB）** | 剪贴板场景 10MB 已覆盖绝大多数截图 |
| FR-02.4 来源 App 图标 | V1 **仅显示 App 名称** | 图标提取跨平台复杂度高 |
| FR-05 分组管理 | **已移除** | 竞品调研后，收藏 + 搜索 + 类型筛选已足够 |
| 开源协议 "待定" | **PolyForm Noncommercial** | 非商业许可 |
| 项目名 "EasyCV" | **Recopy** | 品牌重命名 |
| macOS 最低版本 13.0 | **12.0 (Monterey)** | 扩大兼容范围 |
