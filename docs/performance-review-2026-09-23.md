# Recopy 全代码性能复盘（2026-09-23）

## 结论和验收范围

已完成当前源码的模块级审查，并实现第一批有明确因果和回归入口的优化。没有把静态审查写成原生应用 CPU/RSS 实测，也没有宣称所有风险已消除。未启动真实应用、修改用户剪贴板/数据库、迁移历史数据、提交或发布。

工作区已有 FR-077 搜索相关改动；本次保留并基于当前内容验证。审查期间其它任务仍在更新 SearchBar/SettingsPage/paste 测试等内容；不把它们计入本次交付。三个独立审查范围分别是后端、平台及交付、前端；检查为 no-write requested + audited，不是强制只读沙箱。

## 覆盖矩阵

| 范围 | 已检查内容 | 判断 |
|---|---|---|
| 剪贴板采集 | lib.rs monitor、clipboard 工具、commands 写入/去重/粘贴 | 有界 channel 32 和顺序 worker 已存在；仍有图像暂存/富文本计量风险 |
| 数据库 | models、queries、pool/cache、全部 migrations | WAL、5 连接、复合索引已存在；列表载荷已修，模糊搜索全表扫描待专项 |
| 列表与操作 | ClipboardList、各卡片、context menu、favorites、keyboard、quick-paste | 水平/垂直虚拟化有效；修复首次分页和快捷粘贴多余扫描 |
| 前端状态 | clipboard/settings/update/toast/HUD/search-history stores、paste/selection/time helpers | 修复刷新竞态和 pins 搜索 scope；保留原搜索功能 |
| 预览与图片 | PreviewPage、useThumbnail、Rust preview state/size、image/file helpers | 修复重复全文轮询、请求重叠、缩略图宽高与 id 生命周期 |
| 窗口与平台 | macOS、NSPanel、Windows、fallback、主入口和配置 | 原生线程/hook 风险见下表；没有 Windows 实机验证 |
| 设置与更新 | App、SettingsPage、SearchBar、i18n、updater | 未发现需要更换状态管理框架的证据；存在重复初始化和可拆包空间 |
| 交付 | Vite/Vitest、Tauri 配置/权限、workflows、scripts、website 静态资源引用和 functions | 构建通过；下载源超时和发布重复下载可进一步优化 |
| 测试 | 全部前端/Rust 测试、针对性竞态与大内容测试 | 前端 373、Rust 61 通过；不替代原生焦点/粘贴/滚动实测 |

二进制图片、锁文件和生成物未当作业务源码逐行审查；仅按配置与调用需要核对依赖实现。

## 本次修复

| 问题 | 修改 | 验证与限制 |
|---|---|---|
| 500 条首屏可传输所有正文，虚拟化只减少 DOM | history/search/favorites 的 SQL SELECT 仅对 plain/rich 返回前 1024 个 Unicode 字符 | 原文、rich_content 和按 ID 粘贴未改；搜索 WHERE/ranking 保持全文；链接保留完整 URL。Unicode、尾部命中、详情/粘贴、长 URL 回归通过 |
| 预览每 100ms clone/序列化同一正文 | 客户端携带 knownId，后端 clone 前比较；不变仅返回空 detail+closing | 1MiB 正文连续 100 次不变轮询均小于 64 bytes；慢 IPC 串行完成再设 timeout；关闭信号不丢。首次大内容仍需完整加载，后台仍有小状态轮询 |
| 竖长截图缩略图高度无限 | 400×400 包围盒等比缩放，小图不放大 | 100×10000、10000×100、1×1000 回归；原图不变。原始解码面积尚未限制 |
| 缩略图切换 ID 后沿用旧图；重试 timer 未释放 | 返回值按 ID 关联 cache/loaded，cleanup 清 timer | A→缓存B→null 和现有重试/卸载测试通过 |
| 初始空列表加载后 sentinel observer 不注册 | effect 依赖 hasItems，节点从无到有时重新绑定 | 新测试先 RED 后 GREEN；分组和垂直共用逻辑 |
| 旧请求覆盖 dirty；可见刷新事件丢失 | changeVersion 防止清除后到变化，refreshVersion 合并并补尾随请求 | 多次事件仅补一次当前查询；owner Symbol 防止失效/删除后的旧循环复活 |
| 删除失效请求后 loading 挂住；收藏搜索刷新退回全部收藏 | 删除清理 pending 状态并限制选择范围；query 优先于 pins/history | pending query/delete、pins refresh/reopen、旧 show→新 refresh、合并 refresh→delete 回归通过 |
| 每次选中改变扫描全部同组条目 | 找齐 9 个快捷粘贴目标即停止 | 原顺序和目标保持；较旧组仍可能扫描前缀，未宣称所有情形 O(1) |
| 启动 GC 快照可能把刚保存、未入库的图片删除 | GC、retention、文件删除依次结束后启动 monitor | 独立检查确认 early return 只结束内层清理，不跳过 monitor；Rust 回归通过。取舍：历史清理会延迟监听开始，未做原生启动竞态压力测试 |

## 性能证据

可重跑：`python3 scripts/performance-payload.py`。脚本仅使用内存 SQLite，运行项目 migrations、抽取当前 history SQL，生成 50 条各 1MiB ASCII 文本；旧 SQL 只替换摘要投影为完整 plain_text。每组 5 次，计时包含 Python SQLite 取数和 JSON 序列化，不包含 Tauri、WebView、磁盘或渲染。

| 样本 | 改前 | 改后 |
|---|---:|---:|
| JSON bytes | 52,434,480 | 56,880 |
| 查询+Python JSON 中位数，第一次 | 180.94ms | 2.79ms |
| 重跑中位数 | 183.82ms | 8.53ms |

载荷减少约 **99.89%**；耗时有环境波动，不作为端到端加速倍数。EXPLAIN 仍使用 `idx_clipboard_items_updated_at_id`，未新增排序。SQL 截取解决返回分配和传输，不保证免除 SQLite 对原正文的读取。

独立审查另用隔离 SQLite 证实 FTS 的额外写入成本，并用真实 store 源码的内存 VM 复现 dirty/delete/pins 竞态；这些发现由主实现回归测试覆盖。未把审查者的机器微基准当成应用实际延迟。

## 尚未修复的风险与下一步

| 优先级 | 位置/事实 | 为什么没有混入本批 | 下一步验收 |
|---|---|---|---|
| P1 | platform/windows.rs install/remove hook：旧线程 cleanup 使用全局句柄，快速 hide/show 可清掉新 hook | 需要重新定义线程实例所有权，不能凭 macOS 编译宣称通过 | 实例化句柄/代次，确定性旧 cleanup 晚到测试，加 Windows 快速开合压力测试 |
| P1 | Windows mouse hook 中 Tauri window.hwnd() 可能同步等待 UI 线程 | 低级 hook 热路径需真实 Windows 验证 | 预缓存 HWND，繁忙 UI 下外部鼠标响应和关闭验证 |
| P1 | lib.rs read_image 使用 clipboard-x 默认目录；插件先落盘，本项目再保存一份 | 涉及暂存文件所有权与历史清理，不能批量删除来源不明文件 | 独立暂存目录/本次文件生命周期，覆盖成功、去重、超限、失败；历史文件另建可审阅迁移方案 |
| P1 | rich_content 没计入大小限制/hash/content_size | hash 变更涉及历史去重兼容，不宜悄悄改历史契约 | 合并字节计量，明确 type+rich hash 兼容；同文字不同格式、超大 HTML 回归 |
| P1/P2 | image original 保存失败被 .ok() 吞掉，可能入库 image_path=None | 属于错误处理/数据完整性专项 | 保存失败必须传播，缩略图允许 best effort；磁盘失败注入和孤儿文件收尾 |
| P2 | queries.rs 始终写 clipboard_fts，搜索却完全使用 LIKE | 移除废弃索引需要向前迁移与回滚验证；不能用 MATCH 直接改变任意字符模糊匹配 | 保留多 token/中文/排序语义，对大历史库做搜索与写入基准，决定废弃 FTS 或真正利用索引 |
| P2 | LIKE '%a%b%c%' 与 CASE ranking 扫正文并排序 | 本批仅优化载荷，不假装解决搜索复杂度 | 设计兼容候选集/索引方案，测试中文短词和模糊召回 |
| P2 | 文件缩略图无并发额度，初次图像解码无像素上限 | 需要 CPU/RSS 基准和解码错误策略 | semaphore 放在读取之前，限制 decoded pixels，批量大图压力测试 |
| P2 | GC/storage_size 同步目录操作在 async executor；macOS paste 同步整图读取和拷贝 | 需要拆纯文件工作和原生调用，防止误把 AppKit 搬到错误线程 | blocking pool + 慢盘/大量文件基准；保持写入→归还焦点→粘贴顺序 |
| P2 | macOS menu_bar_height 从 async preview 访问 raw AppKit | 原生线程安全问题，普通 Rust 测试无法证明 | 主线程缓存/dispatch，Main Thread Checker 与预览定位验证 |
| P2 | website download Gitee fetch/json 无 deadline，阻塞 GitHub fallback | 独立网络交付路径，不影响当前桌面热链路 | 每源完整 metadata 超时，fetch 与 body stalled 测试 |
| P3 | SettingsApp/SettingsPage 重复 loadSettings；主 bundle 约 543KB | 收益次于正文搬运；预创建 WebView 也有首开速度收益 | 合并初始化或页面拆包，量化首开延迟/RSS 后决定 |
| P3 | pasteItem 吞掉异常，调用方仍显示成功 HUD | 功能反馈正确性，已有用户 paste 改动 | 统一成功/失败传播并测试 HUD；避免覆盖并行工作 |
| P3 | Gitee 同步脚本先下载 assets 后检查已存在 | 发布效率而非常驻性能 | 跳过已存在资产前不下载，保留 release tooling 回归 |

以上风险已给出可执行入口；本轮完成的是全面审查与第一批验证优化，不是 Windows 原生验收、完整数据迁移或所有后续风险的完成声明。

## 验证

- 基线：前端 26 文件/359 tests；Rust 58 tests 通过。
- 最终：前端 26 文件/373 tests；Rust 61 tests 通过（最终 store owner 改动不影响 Rust）。部分测试增长来自并行 FR-077，不全归本次。
- `pnpm build` 通过（含 TypeScript）；`pnpm lint` 通过；`git diff --check` 通过。
- 构建仍提示主 chunk >500KB，以及 Tauri window 同时静态/动态 import 无法拆 chunk；未掩盖警告。
- 后端与前端关键候选经过独立复核；未运行原生焦点/粘贴、真实 RSS/CPU、Windows 编译/交互、浏览器视觉验收。
- 不改变持久化 schema，恢复本批实现无需数据回滚；不要用整文件 checkout 覆盖共享文件里的 FR-077 改动。

## 修改文件与行数

以下为本次触及路径相对 HEAD 的 `git diff --numstat`。带 * 的共享文件包含进入任务前已有的改动，不能把整行数归为本次；其它 FR-077 文件未列入。代码格式化包含在统计内。

| 文件 | + | - |
|---|---:|---:|
| src-tauri/src/clipboard/mod.rs | 20 | 11 |
| src-tauri/src/commands/clipboard.rs | 5 | 4 |
| src-tauri/src/db/models.rs | 37 | 0 |
| src-tauri/src/db/queries.rs | 72 | 9 |
| src-tauri/src/lib.rs * | 48 | 48 |
| src/components/ClipboardList.tsx | 2 | 1 |
| src/components/PreviewPage.tsx | 25 | 29 |
| src/components/__tests__/ClipboardList.test.tsx | 8 | 0 |
| src/components/__tests__/PreviewPage.test.tsx | 39 | 0 |
| src/hooks/useThumbnail.ts | 6 | 3 |
| src/hooks/__tests__/useThumbnail.test.ts | 14 | 0 |
| src/lib/quick-paste.ts | 5 | 3 |
| src/lib/types.ts | 2 | 0 |
| src/stores/clipboard-store.ts * | 77 | 31 |
| src/stores/__tests__/clipboard-store.test.ts | 77 | 0 |
| scripts/performance-payload.py（新增） | 43 | 0 |
| docs/performance-review-2026-09-23.md（新增） | 107 | 0 |

新增 `scripts/performance-payload.py` 和本报告；CatPaw FR-078 记录范围、候选与证据。未提交、推送或发布。
