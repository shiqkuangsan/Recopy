# EasyCV 设计与技术决策记录

> 日期：2026-02-23
> 状态：已确认

---

## 一、UI/UX 设计

- **风格**：shadcn Dark Theme（zinc 色系）
- **主面板**：桌面底部 slide-up 弹窗，200ms ease-out 动画
- **卡片流**：横向排列，按时间分组（Today / Yesterday / ...）
- **色板**：Background #09090B → Card #18181B → Border #27272A → Text #FAFAFA → Muted #A1A1AA → Accent #3B82F6
- **字体**：Inter (400/500/600)
- **圆角**：8px (cards), 6px (buttons/inputs)
- **图标**：Lucide React
- **线框图**：`docs/wireframes/easycv-main-panel.excalidraw`

---

## 二、开发里程碑

```
M0 → M1 → M2 → M3 ─┬─ M4 (收藏/分组)
                     ├─ M5 (系统集成)
                     ├─ M6 (设置/隐私)
                     └─ M7 (i18n/打包)
```

| 里程碑 | 目标 | 核心交付 |
|--------|------|---------|
| M0 | 项目骨架 | Tauri v2 + React + Tailwind + SQLite 跑通，空窗口能弹出 |
| M1 | 剪贴板监听 + 存储 | clipboard-x 监听 → Rust 解析 → SQLite 写入 |
| M2 | 主面板 UI | 底部弹窗 + 卡片流 + 四种卡片渲染 + 虚拟列表 |
| M3 | 搜索 + 粘贴 | FTS5 搜索 + 类型过滤 + 点击/回车粘贴到前台 App |
| M4 | 收藏 + 分组 | Pin 功能 + 分组 CRUD + 视图切换 |
| M5 | 系统集成 | 全局快捷键 + 托盘图标 + 开机自启 + 单实例 |
| M6 | 设置 + 隐私 | 设置窗口 + App 排除 + 历史清理策略 + 深色/浅色 |
| M7 | i18n + 打包 | 中英双语 + macOS .dmg + Windows .msi + 自动更新 |

---

## 三、测试策略

### Rust 后端
- 单元测试：数据库 CRUD、FTS5 搜索、内容哈希/去重、缩略图生成（cargo test，内存 SQLite）
- 集成测试：Tauri command 端到端（cargo test + tauri-test）
- 不测：剪贴板监听本身、窗口显隐（手动验证）

### 前端
- 组件测试：卡片渲染（4 种类型）、搜索框 debounce、类型过滤、虚拟列表（Vitest + React Testing Library）
- Store 测试：Zustand store 状态逻辑（Vitest）
- 不测：Tailwind 样式、Tauri invoke 真实调用（mock）

### 跨平台 E2E
- CI 矩阵：GitHub Actions macOS + Windows 双平台跑 cargo test + vitest
- 手动 Checklist：每个里程碑按 PRD 验收标准在两平台各过一遍
- V1 不引入 GUI 自动化

---

## 四、技术实现决策

### 4.1 自动粘贴

主交互（点击/回车）为**主动粘贴**模式，右键"复制到剪贴板"为仅写入模式。

| 平台 | 实现方案 | 权限要求 |
|------|---------|---------|
| macOS | `osascript` 调用 AppleScript `System Events` 模拟 Cmd+V | 辅助功能权限（首次启动引导开启） |
| Windows | `enigo` crate 模拟 Shift+Insert，调用前 `SetForegroundWindow` 还原焦点 | 无 |

降级策略：用户拒绝辅助功能权限时，降级为"仅写入剪贴板"模式。

### 4.2 来源 App 检测

V1 **只存 App 名称（文字）**，不提取图标（V2 再加）。

| 平台 | API | 获取内容 |
|------|-----|---------|
| macOS | `NSWorkspaceDidActivateApplicationNotification` | PID → localizedName |
| Windows | `SetWinEventHook` + `EVENT_SYSTEM_FOREGROUND` | HWND → 窗口标题 + 进程名 |

该监听器与粘贴还原焦点共用同一个，无额外开销。

### 4.3 图片存储

- **缩略图**：Rust `image` crate 压缩到 400px 宽，一律存 SQLite blob
- **原图**：一律存文件系统 `{app_data}/images/{YYYY-MM}/{uuid}.{ext}`，DB 只存路径
- **单条记录大小上限**：10MB（超出不记录）

### 4.4 主面板窗口类型

| 平台 | 方案 | 关键配置 |
|------|------|---------|
| macOS | `tauri-nspanel` 转为 NSPanel | `nonactivating_panel` + `can_become_key_window` + `PanelLevel::Dock` |
| Windows | 普通 Tauri 窗口 | `alwaysOnTop: true` + `skipTaskbar: true` + `decorations: false` |

show 时接收键盘输入，paste 时让出焦点再模拟按键。

---

## 五、开源协议

**MIT License**

---

## 六、PRD 修订记录

基于技术讨论，以下 PRD 内容需更新：

| 原始 | 修订为 | 原因 |
|------|--------|------|
| FR-01.5 单条 50MB 上限 | **10MB** | 剪贴板场景 10MB 已覆盖绝大多数截图，减少存储压力 |
| FR-02.4 来源 App 图标 | V1 **仅显示 App 名称**，V2 加图标 | 图标提取跨平台复杂度高 |
| 开源协议"待定" | **MIT** | 最宽松，利于传播 |
