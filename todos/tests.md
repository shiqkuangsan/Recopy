# EasyCV 测试列表

> 最后更新：2026-02-23

## 测试状态说明

| 状态 | 含义 |
|------|------|
| 已通过 | 自动化测试或手动验证通过 |
| 待验证 | 需手动验证 |
| 跳过 | 暂不测试，已记录原因 |

---

## 自动化测试（Rust - cargo test）

共 19 个测试，全部通过。

| ID | 测试项 | 状态 | 模块 |
|----|--------|------|------|
| T-R01 | SQLite 数据库初始化 + 建表 | 已通过 | db::mod |
| T-R02 | 剪贴板条目 CRUD | 已通过 | db::queries |
| T-R03 | FTS5 全文搜索 | 已通过 | db::queries |
| T-R04 | 内容哈希去重 | 已通过 | db::queries |
| T-R05 | 收藏/取消收藏 | 已通过 | db::queries |
| T-R06 | 设置 CRUD | 已通过 | db::queries |
| T-R07 | 清空历史（保留收藏） | 已通过 | db::queries |
| T-R08 | 保留策略清理（按天数） | 已通过 | db::queries |
| T-R09 | 保留策略清理（按条数） | 已通过 | db::queries |
| T-R10 | 无限制策略不清理 | 已通过 | db::queries |
| T-R11 | 删除条目 | 已通过 | db::queries |
| T-R12 | 内容哈希计算（SHA-256） | 已通过 | clipboard::mod |
| T-R13 | 缩略图生成（400px） | 已通过 | clipboard::mod |
| T-R14 | 小图片缩略图不放大 | 已通过 | clipboard::mod |
| T-R15 | 大小限制检查 | 已通过 | clipboard::mod |
| T-R16 | FTS5 like 搜索 | 已通过 | db::queries |
| T-R17 | 收藏条目查询 | 已通过 | db::queries |
| T-R18 | 收藏条目类型筛选 | 已通过 | db::queries |
| T-R19 | 按 ID 查询条目 | 已通过 | db::queries |

## 自动化测试（前端 - vitest）

共 17 个测试，全部通过。

| ID | 测试项 | 状态 | 模块 |
|----|--------|------|------|
| T-F01 | TextCard 渲染纯文本 | 已通过 | components/TextCard |
| T-F02 | TextCard 长文本截断 | 已通过 | components/TextCard |
| T-F03 | TextCard 显示来源和时间 | 已通过 | components/TextCard |
| T-F04 | TextCard 选中状态高亮 | 已通过 | components/TextCard |
| T-F05 | ImageCard 渲染缩略图 | 已通过 | components/ImageCard |
| T-F06 | ImageCard 无缩略图占位 | 已通过 | components/ImageCard |
| T-F07 | ImageCard 显示来源和时间 | 已通过 | components/ImageCard |
| T-F08 | FileCard 渲染文件名 | 已通过 | components/FileCard |
| T-F09 | FileCard 文件图标匹配 | 已通过 | components/FileCard |
| T-F10 | FileCard 未知文件处理 | 已通过 | components/FileCard |
| T-F11 | Store fetchItems 调用 | 已通过 | stores/clipboard-store |
| T-F12 | Store searchItems 调用 | 已通过 | stores/clipboard-store |
| T-F13 | Store deleteItem 调用 | 已通过 | stores/clipboard-store |
| T-F14 | Store setFilterType 触发刷新 | 已通过 | stores/clipboard-store |
| T-F15 | Store setViewMode 切换 | 已通过 | stores/clipboard-store |
| T-F16 | Store selectedIndex 管理 | 已通过 | stores/clipboard-store |
| T-F17 | Store searchQuery 更新 | 已通过 | stores/clipboard-store |

## 手动验证

| ID | 测试项 | 状态 | 说明 |
|----|--------|------|------|
| T-M01 | 托盘图标显示 + 菜单交互 | 待验证 | 左键打开、右键菜单 |
| T-M02 | 开机自启动生效 | 待验证 | 需重启系统 |
| T-M03 | 单实例运行 | 待验证 | 重复启动聚焦已有窗口 |
| T-M04 | macOS .dmg 安装运行 | 待验证 | pnpm tauri build |
| T-M05 | Windows .msi 安装运行 | 待验证 | 需 Windows 环境 |
| T-M06 | CI 双平台构建 | 待验证 | 需 push GitHub |
| T-M07 | 主题切换视觉正确 | 待验证 | 暗色/亮色/跟随系统 |
| T-M08 | 剪贴板端到端：复制文本 → DB 记录 | 待验证 | 手动复制后查看历史 |
| T-M09 | 焦点回退 + 模拟粘贴 | 待验证 | 依赖 FR-001 完成 |

## 运行方式

```bash
# Rust 测试
cd src-tauri && cargo test

# 前端测试
cd /Users/zhuguidong/WorkSpace/PrivateSpace/EasyCV && npx vitest run

# 全部测试
cd src-tauri && cargo test && cd .. && npx vitest run
```
