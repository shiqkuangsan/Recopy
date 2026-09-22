# 图片生命周期与按类型去重复盘（FR-080）

## 已实施

- 每次图片采集使用 `capture-staging/<uuid>` 私有目录，读取完成或 producer/读取/超限失败后清理本次目录。插件读取、PNG 编码、暂存读写放在 blocking worker。
- 启动监听之前回收上次异常退出遗留的规范 UUID 采集目录；未知条目及符号链接保持不动。旧 `tauri-plugin-clipboard-x/images` 不做历史清理。
- 新原图必须成功保存后才进入数据库；保存失败向上传播。部分写入失败只删除本次通过 create_new 创建的文件。缩略图仍 best effort。
- 数据库插入失败后，仅在 DB 确认原图没有任何已提交引用时删除；DB 状态未知或存在引用时保留，由下次启动 GC 处理未引用文件。避免把模糊的 commit 错误误当作肯定回滚。
- 消除原图保存前的完整 content.clone；缺失 image_path 的粘贴返回错误。
- 新条目 hash 使用 v2 域标识、类型、正文及 rich bytes，长度分帧避免拼接歧义。纯文本/富文本以及相同文字不同 HTML 分别保留。
- v2 未命中时进行旧 hash + 类型 + rich bytes 的精确兼容查询；只执行原有的更新时间行为，保留 hash、收藏、备注及原件引用。不会批量重算历史记录，也不会仅凭旧正文 hash 把不同格式合并。
- 大小限制和 content_size 同时计入正文及 HTML。文件继续沿用路径身份和实际文件大小；图片以采集字节为身份。没有把文件内容读取哈希悄悄混入本次规则。

## 验证

- 隔离工作树 Rust 71 tests passed；集成备注功能后 Rust 77 tests passed。
- 集成前端 27 files / 381 tests passed；pnpm build（含 TypeScript）、pnpm lint、git diff --check passed。
- 测试覆盖暂存成功、超限、producer 失败、缺失文件、panic、外部路径/符号链接保护、启动残留回收和幂等、保存失败、插入失败事务回滚与原图回收、DB closed 和仍被引用时保留、不同类型和格式区分、精确 legacy 兼容、历史 hash 不变。
- capture_review 独立复核发现异常退出清理缺口；补上启动恢复及测试后通过复核。检查方式为 no-write requested + audited。
- 所有测试仅使用测试临时目录和内存 SQLite。没有操作真实剪贴板或生产数据库，没有历史数据迁移。

## 限制

原生插件实际采集、磁盘耗尽故障、进程强杀没有做系统级复现；测试验证可注入的 producer/存储边界。硬退出和 future 取消可能暂留文件，依赖下次启动恢复。历史 image_path 非空但原文件已丢失时仍可能匹配旧记录，这是既有损坏数据修复范围。旧插件目录积累的文件本轮没有删除。

Windows 生命周期修复设计已完成独立检查，尚未修改 Windows 原生 hook 实现。建议使用独立 session 持有 hooks/线程ID/修饰键状态，退出只回收自己的资源；preview HWND 提前缓存，回调内不调用同步 Tauri getter。仍需确定性交错测试及 Windows 实机快速开合/输入/鼠标验收。

构建仍有现存主 chunk >500KB 警告。未提交、推送、发布。

## 本次文件变化

与集成前保存的工作区快照比较，排除并行备注功能：

| 文件 | + | - |
|---|---:|---:|
| src-tauri/src/clipboard/mod.rs | 74 | 3 |
| src-tauri/src/clipboard/storage.rs（新） | 354 | 0 |
| src-tauri/src/commands/clipboard.rs | 27 | 16 |
| src-tauri/src/db/mod.rs | 1 | 1 |
| src-tauri/src/db/queries.rs | 23 | 0 |
| src-tauri/src/lib.rs | 42 | 10 |

后端总计 +521/-30。本报告及 CatPaw Work/Evidence 单独记录。独立工作树保留以供核对，不自动删除。
