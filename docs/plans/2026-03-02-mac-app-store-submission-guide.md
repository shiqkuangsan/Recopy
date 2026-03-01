# Tauri 剪贴板管理工具上架 Mac App Store 完整指南

## 全局概览

整个流程分为 7 个阶段：

```
注册开发者账号 → 创建证书和标识符 → 适配 App Sandbox → Tauri 构建配置 →
代码签名 → 打包上传 → App Store Connect 提审
```

预计时间：首次从零开始，顺利的话 2-3 天，踩坑可能一周+。
费用：Apple Developer Program $99/年（约 ¥688），这是硬性要求。

---

## 阶段一：注册 Apple Developer Program

### 1.1 前置条件

- 一台 Mac（你已有）
- 安装最新版 Xcode（App Store 免费下载，约 12GB）
- 一个 Apple ID

### 1.2 注册步骤

1. 打开 https://developer.apple.com/programs/
2. 点击 "Enroll"，用你的 Apple ID 登录
3. 选择以**个人身份**注册（Individual），填写真实姓名和地址
4. 支付 $99/年（支持信用卡，国内 Visa/Mastercard 可用）
5. 等待审核通过（通常 24-48 小时，偶尔即时通过）

> **注意**：注册时填写的姓名会显示在 App Store 上作为开发者名称，如果用公司名义需要注册为 Organization（需要 D-U-N-S 编号，流程更复杂）。个人开发者直接选 Individual 即可。

### 1.3 安装 Xcode Command Line Tools

```bash
xcode-select --install
```

即使你不用 Xcode 写代码，后续签名和打包都依赖它的命令行工具。

---

## 阶段二：创建证书、App ID 和 Provisioning Profile

登录 https://developer.apple.com/account，进入 "Certificates, Identifiers & Profiles"。

### 2.1 创建证书签名请求（CSR）

在你的 Mac 上：

1. 打开 **钥匙串访问**（Keychain Access）
2. 菜单栏 → 钥匙串访问 → 证书助理 → **从证书颁发机构请求证书**
3. 填写你的邮箱和名称，选择"存储到磁盘"
4. 保存生成的 `.certSigningRequest` 文件

### 2.2 创建两个证书

你需要**两个**证书：

#### 证书 1：Apple Distribution（签名 .app）

1. Certificates 页面点击 "+"
2. 选择 **Apple Distribution**
3. 上传刚才的 CSR 文件
4. 下载生成的 `.cer` 文件，双击安装到钥匙串

#### 证书 2：Mac Installer Distribution（签名 .pkg）

1. 再次点击 "+"
2. 选择 **Mac Installer Distribution**
3. 上传同一个 CSR 文件
4. 下载并双击安装

### 2.3 验证证书安装

```bash
# 查看 Apple Distribution 证书
security find-identity -v -p codesigning

# 查看 Installer 证书
security find-identity -v
```

你应该看到类似：

```
"Apple Distribution: Your Name (TEAMID1234)"
"3rd Party Mac Developer Installer: Your Name (TEAMID1234)"
```

记下这两个完整名称和 Team ID（括号里的 10 位字符串），后面要用。

### 2.4 创建 App ID（标识符）

1. 进入 **Identifiers** 页面，点击 "+"
2. 选择 **App IDs**，平台选 **macOS**
3. 填写：
   - Description：你的 App 名称，如 "Recopy"
   - Bundle ID：选择 Explicit，填入如 `com.yourname.recopy`
4. 在 Capabilities 列表中，**不需要**勾选特殊能力（剪贴板访问不需要额外 capability）
5. 点击 Continue → Register

> **Bundle ID 命名规范**：反向域名格式，如 `com.yourname.appname`，一旦创建不可修改，需和 Tauri 配置中的 `identifier` 一致。

### 2.5 创建 Provisioning Profile

1. 进入 **Profiles** 页面，点击 "+"
2. 选择 **Mac App Store Connect**
3. 选择刚才创建的 App ID
4. 选择你的 Apple Distribution 证书
5. 填写 Profile 名称，如 "Recopy AppStore"
6. 下载生成的 `.provisionprofile` 文件

这个文件后面打包时需要嵌入到 .app 中。

---

## 阶段三：App Sandbox 适配（最关键的一步）

### 3.1 为什么这一步最重要

Mac App Store **强制要求** App Sandbox。沙盒会限制你的 App 能做什么，对剪贴板管理工具有直接影响：

| 功能 | 沙盒下是否可用 | 说明 |
|------|---------------|------|
| 读取剪贴板内容 | ✅ 可用 | NSPasteboard 在沙盒中正常工作 |
| 写入/修改剪贴板 | ✅ 可用 | 可以正常操作 |
| 监控剪贴板变化 | ✅ 可用 | 轮询检测变化可以工作 |
| 模拟按键粘贴 | ❌ 不可用 | 沙盒阻止模拟键盘事件 |
| Accessibility API | ❌ 不可用 | 沙盒中不能使用辅助功能 API |
| 全局快捷键 | ⚠️ 部分可用 | 需要用户手动在系统设置中授权 |

> **重要警告**：Apple 开发者论坛的 DTS 工程师 Quinn 提到，macOS 未来可能像 iOS 一样对剪贴板添加隐私控制。现在剪贴板管理器在 Mac 上有悠久历史且可以正常运行，但这是一个需要留意的长期风险。

### 3.2 自动粘贴降级（Recopy 关键适配点）

Recopy 的 paste flow 使用 `osascript` 通过 System Events 模拟 Cmd+V 粘贴。沙盒环境下，这条路径会被阻止——需要 `com.apple.security.automation.apple-events` entitlement 且用户手动授权，而 Apple 审核对此权限非常严格。

**必须的适配**：App Store build 通过 compile-time feature flag 禁用 `simulate_paste()` 路径，改为仅写入系统剪贴板 + 提示用户手动 Cmd+V。

参考已上架 App Store 的剪贴板管理工具 SaneClip 的做法：App Store 版本不做自动粘贴，而是把内容复制到剪贴板后显示通知，用户自己按 Cmd+V 粘贴。

**实现建议**：
- 在 `src-tauri/src/commands/clipboard.rs` 的 `paste_clipboard_item` 中，用 `#[cfg(not(feature = "app-store"))]` 守卫 `simulate_paste()` 调用
- App Store build 跳过模拟粘贴步骤，仅执行"写入剪贴板 + 隐藏窗口"
- 前端根据 build 类型调整 UI 文案（如"已复制到剪贴板，请按 Cmd+V 粘贴"）
- **QA 检查项**：App Store binary 中 `grep -r "osascript" target/` 应无匹配

### 3.3 创建 Entitlements 文件

在 `src-tauri/` 目录下创建两个文件：

#### `entitlements.plist`（主 App 的权限）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- 启用 App Sandbox（必需） -->
  <key>com.apple.security.app-sandbox</key>
  <true/>

  <!-- MAS 签名必需：关联 Provisioning Profile -->
  <key>com.apple.application-identifier</key>
  <string>TEAMID1234.com.yourname.recopy</string>
  <key>com.apple.developer.team-identifier</key>
  <string>TEAMID1234</string>

  <!-- 网络客户端（Tauri IPC 通信可能需要） -->
  <key>com.apple.security.network.client</key>
  <true/>

  <!-- 按需启用：如果 App 需要读写用户选择的文件 -->
  <!-- <key>com.apple.security.files.user-selected.read-write</key> -->
  <!-- <true/> -->
</dict>
</plist>
```

> **最小权限原则**：只声明实际需要的 entitlement。`network.server` 和 `allow-jit` 在 Tauri v2 生产构建中通常不需要（WKWebView 自行管理 JIT），声明过多权限反而增加审核风险。如需本地服务器或 JIT 编译，确认有具体运行时依赖后再添加。

#### `entitlements.inherit.plist`（子进程继承的权限）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.inherit</key>
  <true/>
</dict>
</plist>
```

### 3.4 本地测试沙盒

在正式提交前，先验证你的 App 在沙盒下能否正常运行。**必须使用 App Store build flags**，而非默认的 DMG 构建——后者包含私有 API 和自更新，测试结果不可信。

```bash
# 1. 用 App Store 配置构建（排除私有 API 和自更新）
pnpm tauri build --bundles app \
  --config src-tauri/tauri.appstore.conf.json \
  -- --no-default-features --features app-store

# 2. 用 entitlements 重新签名（用你的开发者证书）
codesign --force --sign "Apple Distribution: Your Name (TEAMID)" \
  --entitlements src-tauri/entitlements.plist \
  src-tauri/target/release/bundle/macos/Recopy.app

# 3. 运行测试
open src-tauri/target/release/bundle/macos/Recopy.app
```

**测试检查项**：
- 剪贴板监控正常工作（复制文本/图片/文件后出现在列表中）
- 点击条目后内容写入系统剪贴板（不触发自动粘贴）
- 全局快捷键能唤起面板
- 主题切换正常（无毛玻璃，使用纯色背景）
- Console.app 中无 `sandboxd` 拒绝日志

---

## 阶段四：Tauri 构建配置

### 4.1 App Store 专用配置

项目已有 `src-tauri/tauri.appstore.conf.json`，覆盖基础配置中与 App Store 不兼容的选项。参见 `docs/plans/2026-03-02-app-store-compat.md` 了解 feature flag 和双轨构建架构的完整设计。

### 4.2 确认主配置 `tauri.conf.json`

确保以下字段正确：

```json
{
  "productName": "Recopy",
  "version": "1.0.0",
  "identifier": "com.yourname.recopy",
  "bundle": {
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns"
    ],
    "copyright": "Copyright © 2026 Your Name"
  }
}
```

> **identifier 必须和 Apple Developer 后台创建的 Bundle ID 完全一致。**

### 4.3 创建 Info.plist 补充文件

在 `src-tauri/` 下创建 `Info.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- 声明不使用非豁免加密（避免出口合规问题） -->
  <key>ITSAppUsesNonExemptEncryption</key>
  <false/>
</dict>
</plist>
```

### 4.4 准备 App 图标

App Store 要求完整的图标集。使用 Tauri 的图标生成工具：

```bash
npx tauri icon path/to/your-icon-1024x1024.png
```

这会自动生成所有尺寸的图标文件到 `src-tauri/icons/` 目录。

---

## 阶段五：构建和代码签名

### 5.1 构建 Universal Binary

为了兼容 Intel 和 Apple Silicon 用户，推荐构建 Universal Binary（Apple 不强制要求，但能覆盖更广的用户群）：

```bash
# 添加两个架构的编译目标
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin

# 构建 Universal Binary（App Store 版，排除私有 API 和自更新）
pnpm tauri build --bundles app \
  --target universal-apple-darwin \
  --config src-tauri/tauri.appstore.conf.json \
  -- --no-default-features --features app-store
```

构建产物在：
`src-tauri/target/universal-apple-darwin/release/bundle/macos/Recopy.app`

### 5.2 嵌入 Provisioning Profile

```bash
# 将 provisioning profile 复制到 .app 内部
cp ~/Downloads/Recopy_AppStore.provisionprofile \
  "src-tauri/target/universal-apple-darwin/release/bundle/macos/Recopy.app/Contents/embedded.provisionprofile"
```

### 5.3 代码签名

签名顺序很重要：**从内到外**，先签内部框架/库，最后签 .app 本身。

> **注意**：WKWebView/WebKit 的 helper 进程（如 `com.apple.WebKit.WebContent`）是 macOS 系统管理的，不会打包到你的 .app 中，无需手动签名。只需签名你自己 bundle 内的代码。

```bash
APP_PATH="src-tauri/target/universal-apple-darwin/release/bundle/macos/Recopy.app"
CERT_NAME="Apple Distribution: Your Name (TEAMID1234)"

# 1. 签名 Frameworks 目录下所有嵌套代码（dylib、framework、可执行文件等）
find "$APP_PATH/Contents/Frameworks" -type f \( -name "*.dylib" -o -name "*.so" -o -perm +111 \) -exec \
  codesign --force --sign "$CERT_NAME" \
  --entitlements src-tauri/entitlements.inherit.plist \
  --timestamp {} \;

# 如果有嵌套的 .framework bundle，单独签名
find "$APP_PATH/Contents/Frameworks" -name "*.framework" -exec \
  codesign --force --sign "$CERT_NAME" \
  --entitlements src-tauri/entitlements.inherit.plist \
  --timestamp {} \;

# 2. 签名主 App
codesign --force --sign "$CERT_NAME" \
  --entitlements src-tauri/entitlements.plist \
  --timestamp \
  "$APP_PATH"
```

### 5.4 验证签名

```bash
# 验证代码签名
codesign --verify --deep --strict "$APP_PATH"

# 验证沙盒已启用
codesign -d --entitlements - "$APP_PATH" | grep app-sandbox

# 用 Apple 的工具检查
spctl --assess --type execute "$APP_PATH"
```

---

## 阶段六：打包并上传

### 6.1 打包为 .pkg

App Store 提交需要 `.pkg` 格式，不是 `.app` 或 `.dmg`：

```bash
INSTALLER_CERT="3rd Party Mac Developer Installer: Your Name (TEAMID1234)"

xcrun productbuild \
  --sign "$INSTALLER_CERT" \
  --component "$APP_PATH" /Applications/ \
  "Recopy-Signed.pkg"
```

### 6.2 验证 .pkg

```bash
# 检查 pkg 是否可以提交
xcrun altool --validate-app \
  --file "Recopy-Signed.pkg" \
  --type macos \
  --apiKey YOUR_API_KEY \
  --apiIssuer YOUR_API_ISSUER
```

如果你没有配置 API Key，也可以用 Apple ID 方式验证（但推荐用 API Key，更方便自动化）。

### 6.3 上传到 App Store Connect

**方法一：使用 Transporter App（最简单，推荐新手用）**

1. 从 Mac App Store 下载 **Transporter**（免费）
2. 用你的 Apple Developer 账号登录
3. 将 `Recopy-Signed.pkg` 拖入窗口
4. 点击 "Deliver"（交付）
5. 等待上传完成和 Apple 的自动验证（约 5-15 分钟）

**方法二：使用命令行**

```bash
xcrun altool --upload-app \
  --file "Recopy-Signed.pkg" \
  --type macos \
  --apiKey YOUR_API_KEY \
  --apiIssuer YOUR_API_ISSUER
```

> 上传成功后，Apple 会对你的 build 做自动化检查（约 15-30 分钟）。如果有问题，你会收到邮件通知。没收到邮件说明自动检查通过了。

---

## 阶段七：App Store Connect 配置和提审

### 7.1 创建 App

1. 登录 https://appstoreconnect.apple.com
2. "My Apps" → "+"→ "New App"
3. 填写：
   - **Platform**：macOS
   - **Name**：App Store 上显示的名称（全球唯一）
   - **Primary Language**：简体中文 或 English
   - **Bundle ID**：选择你创建的那个
   - **SKU**：自定义标识，如 `recopy001`

### 7.2 填写 App 信息

需要准备的素材：

| 素材 | 要求 |
|------|------|
| App 截图 | 至少 1 张，尺寸 1280×800 或 1440×900 或 2560×1600 或 2880×1800 |
| App 描述 | 最多 4000 字符，描述功能和特色 |
| 关键词 | 最多 100 字符，用逗号分隔 |
| 技术支持 URL | 必填，可以放 GitHub repo 地址 |
| 隐私政策 URL | 必填，需要一个网页说明你的隐私实践 |
| App 类别 | 选择 "Utilities"（工具类） |
| App 图标 | 1024×1024，会自动从你的 build 中提取 |

> **隐私政策**：即使你的 App 不收集任何数据，也需要一个隐私政策页面。最简单的办法是在 GitHub 仓库里放一个 PRIVACY.md，或者用 GitHub Pages 托管。内容说明"本 App 不收集、不传输、不存储任何用户数据，所有剪贴板历史仅保存在用户本地设备上"即可。

### 7.3 App 隐私（App Privacy）

App Store Connect 会要求你填写 App 隐私问卷。对于本地运行的剪贴板管理器：

1. "Does your app collect any data?" → 如果所有数据都在本地 → **No**
2. 如果有任何网络请求（比如检查更新）→ 需要如实声明

### 7.4 选择 Build 并提审

1. 上传的 Build 通过自动检查后，会出现在 App Store Connect 的 "Build" 区域
2. 选择这个 Build
3. 填写"Review Notes"（审核备注）：
   - 简述 App 功能
   - 如果 App 需要特殊操作才能体验完整功能，告诉审核员怎么测试
4. 点击 **Submit for Review**

### 7.5 审核等待

- 首次提审通常 24-48 小时
- 可能被拒（Rejection），Apple 会告诉你原因，修改后重新提交
- 通过后状态变为 "Ready for Distribution"

---

## 常见被拒原因及应对

### 1. Sandbox 违规

**症状**：审核员发现 App 试图访问沙盒外的资源。
**解决**：严格测试沙盒环境下的所有功能，确保不依赖 Accessibility API。

### 2. 功能不完整

**症状**：审核员认为 App 过于简单或功能不完整。
**解决**：确保 App 有完整的使用流程，UI 不是半成品。

### 3. 缺少隐私政策

**症状**：隐私政策链接无效或内容不符。
**解决**：提前准备好隐私政策页面，确保链接可访问。

### 4. 加密声明问题

**症状**：未正确声明加密使用情况。
**解决**：在 Info.plist 中添加 `ITSAppUsesNonExemptEncryption` 为 `false`（如果你只用 HTTPS 不用自定义加密）。

### 5. 自动粘贴 / Apple Events 权限

**症状**：App 使用 `osascript` 或 Accessibility API 模拟键盘事件，触发沙盒违规或权限拒绝。
**解决**：App Store 版本必须通过 compile-time feature flag 完全禁用 `simulate_paste()` 路径。不要申请 `com.apple.security.automation.apple-events`，Apple 对剪贴板管理器授予此权限极为严格。改为仅写入剪贴板 + 提示用户手动粘贴。

### 6. 与系统功能重复

**症状**：Apple 认为你的 App 只是复制了系统自带功能。
**解决**：确保你的剪贴板管理器有明显差异化功能（如搜索历史、分类、固定、iCloud 同步等），不只是简单的"最近复制列表"。

---

## 完整目录结构参考

```
Recopy/
├── src/                          # 前端代码
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json           # 主配置
│   ├── tauri.appstore.conf.json  # App Store 专用配置
│   ├── entitlements.plist        # 主 App 权限
│   ├── entitlements.inherit.plist # 子进程继承权限
│   ├── Info.plist                # 额外的 plist 配置
│   ├── icons/
│   │   ├── icon.icns
│   │   ├── 32x32.png
│   │   ├── 128x128.png
│   │   └── 128x128@2x.png
│   └── src/
│       └── main.rs
└── package.json
```

---

## 提交后的流程（自动化建议）

首次手动走通全流程后，强烈建议后续版本用脚本自动化。创建一个 `scripts/build-appstore.sh`：

```bash
#!/bin/bash
set -e

APP_NAME="Recopy"
BUNDLE_TARGET="universal-apple-darwin"
DIST_CERT="Apple Distribution: Your Name (TEAMID)"
INST_CERT="3rd Party Mac Developer Installer: Your Name (TEAMID)"
PROFILE_PATH="path/to/your.provisionprofile"

echo "=== 1. Building Universal Binary ==="
pnpm tauri build --bundles app \
  --target $BUNDLE_TARGET \
  --config src-tauri/tauri.appstore.conf.json \
  -- --no-default-features --features app-store

APP_PATH="src-tauri/target/$BUNDLE_TARGET/release/bundle/macos/$APP_NAME.app"

echo "=== 2. Embedding Provisioning Profile ==="
cp "$PROFILE_PATH" "$APP_PATH/Contents/embedded.provisionprofile"

echo "=== 3. Signing ==="
# 签名 Frameworks 下所有嵌套代码
find "$APP_PATH/Contents/Frameworks" -type f \( -name "*.dylib" -o -name "*.so" -o -perm +111 \) -exec \
  codesign --force --sign "$DIST_CERT" \
  --entitlements src-tauri/entitlements.inherit.plist \
  --timestamp {} \;

find "$APP_PATH/Contents/Frameworks" -name "*.framework" -exec \
  codesign --force --sign "$DIST_CERT" \
  --entitlements src-tauri/entitlements.inherit.plist \
  --timestamp {} \;

# 签名主 App
codesign --force --sign "$DIST_CERT" \
  --entitlements src-tauri/entitlements.plist \
  --timestamp "$APP_PATH"

echo "=== 4. Verifying ==="
codesign --verify --deep --strict "$APP_PATH"

echo "=== 5. Packaging ==="
xcrun productbuild --sign "$INST_CERT" \
  --component "$APP_PATH" /Applications/ \
  "${APP_NAME}-Signed.pkg"

echo "=== Done! Upload ${APP_NAME}-Signed.pkg via Transporter ==="
```

---

## 费用总结

| 项目 | 费用 | 频率 |
|------|------|------|
| Apple Developer Program | $99 (约 ¥688) | 每年 |
| Mac 硬件 | 你已有 | - |
| Xcode | 免费 | - |
| App 上架 | 免费 | - |
| 若 App 收费，Apple 抽成 | 30%（小企业 15%） | 每笔交易 |

---

## 与本项目其他文档的关系

- **私有 API 兼容架构**：参见 `2026-03-02-app-store-compat.md`，详述了 feature flag 双轨构建、NSPanel 内置模块、CSS 视觉降级等技术方案
- **自动更新**：App Store 版通过 `self-update` feature flag 排除 `tauri-plugin-updater`，由 App Store 原生处理更新
