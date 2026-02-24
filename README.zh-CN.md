# Recopy

免费开源的跨平台剪贴板历史管理工具，支持 macOS 和 Windows。

> 你的每一次复制，都不会再丢失。

[English](README.md) | 中文

![Recopy 预览](assets/preview.png)

## 功能特性

- **全类型支持** — 纯文本、富文本、图片、文件
- **一键召唤** — `Cmd+Shift+V` 呼出面板，方向键导航，Enter 粘贴
- **智能去重** — SHA-256 哈希自动去重，重复内容只保留最新一条
- **全文搜索** — FTS5 + trigram 分词，中英文模糊搜索
- **收藏夹** — 置顶常用条目，快速访问
- **不抢焦点** — macOS 使用 NSPanel，面板不会抢走前台应用的焦点
- **主题切换** — 深色/浅色模式，支持跟随系统
- **中英双语** — 自动检测系统语言，可手动切换
- **隐私优先** — 所有数据存储在本地 SQLite，不上传任何内容

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Tauri v2](https://v2.tauri.app) |
| 前端 | React 19 + TypeScript + Tailwind CSS v4 |
| 后端 | Rust |
| 数据库 | SQLite（SQLx，WAL 模式） |
| 状态管理 | Zustand |
| UI 组件 | Radix UI + Lucide Icons |
| 国际化 | react-i18next |
| 平台适配 | NSPanel（macOS）、虚拟滚动（@tanstack/react-virtual） |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+
- [Rust](https://rustup.rs/) 1.77+
- Xcode Command Line Tools（macOS）或 Visual Studio Build Tools（Windows）

### 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器（Vite + Rust 热重载）
pnpm tauri dev

# 运行测试
npx vitest run              # 前端测试（17 个）
cd src-tauri && cargo test  # 后端测试（19 个）

# 类型检查
npx tsc --noEmit

# 生产构建
pnpm tauri build
```

### 构建产物

| 平台 | 格式 |
|------|------|
| macOS | `.dmg` |
| Windows | NSIS 安装包 |

## 项目结构

```
Recopy
├── src/                  # React 前端
│   ├── components/       # UI 组件（卡片、搜索、筛选）
│   ├── stores/           # Zustand 状态管理
│   ├── hooks/            # 键盘导航、快捷键
│   └── i18n/             # 语言文件（zh、en）
├── src-tauri/
│   └── src/
│       ├── lib.rs        # 应用初始化、托盘、快捷键、剪贴板监听
│       ├── commands/     # Tauri IPC 命令（CRUD、粘贴、设置）
│       ├── db/           # SQLite 模型、查询、迁移
│       ├── clipboard/    # 哈希、缩略图、图片存储
│       └── platform/     # macOS NSPanel / Windows 兜底
└── docs/                 # PRD、技术选型、线框图
```

### 粘贴流程

1. 用户按下 Enter 选择一条剪贴板记录
2. Rust 将内容写入系统剪贴板
3. NSPanel 放弃 key window（焦点回到前台应用）
4. `osascript` 模拟 Cmd+V，延迟 50ms
5. 面板隐藏 — 内容无缝粘贴到目标应用

## 快捷键

| 按键 | 功能 |
|------|------|
| `Cmd+Shift+V` | 显示/隐藏 Recopy 面板 |
| `↑` `↓` | 上下导航 |
| `Enter` | 粘贴选中条目 |
| `Cmd+C` | 复制到剪贴板（不粘贴） |
| `Escape` | 关闭面板 |
| `Cmd+F` | 聚焦搜索框 |

## 路线图

- [ ] 来源应用检测（显示内容来自哪个应用）
- [ ] 应用排除列表（跳过密码管理器等）
- [ ] 可配置大小上限
- [ ] 托盘菜单国际化
- [ ] 自动更新

## 许可证

[MIT](LICENSE)
