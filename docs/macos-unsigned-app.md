# macOS Unsigned App Guide

Recopy is not yet signed with an Apple Developer certificate. macOS Gatekeeper will block it on first launch. Here's how to open it.

## Method 1: Right-click Open (Recommended)

1. Open the `.dmg` file and drag **Recopy** to the Applications folder
2. **Right-click** (or Control+click) on Recopy in Applications
3. Select **Open** from the context menu
4. In the dialog, click **Open** to confirm

You only need to do this once. After that, Recopy will open normally.

## Method 2: System Settings

If you double-clicked Recopy and saw the "cannot be opened" dialog:

1. Open **System Settings** → **Privacy & Security**
2. Scroll down to the **Security** section
3. You'll see a message: *"Recopy" was blocked from use because it is not from an identified developer*
4. Click **Open Anyway**
5. Enter your password if prompted

## Method 3: Terminal (Advanced)

Remove the quarantine attribute:

```bash
xattr -d com.apple.quarantine /Applications/Recopy.app
```

## Why is this necessary?

macOS Gatekeeper requires apps to be signed with an Apple Developer certificate. Recopy is a free project and does not yet have code signing configured. The app is safe to use — you can review the full source code on [GitHub](https://github.com/shiqkuangsan/Recopy).

We plan to add code signing and notarization in the future.

---

# macOS 未签名应用安装指南

Recopy 尚未使用 Apple 开发者证书签名，macOS Gatekeeper 会在首次启动时阻止运行。以下是解决方法。

## 方法一：右键打开（推荐）

1. 打开 `.dmg` 文件，将 **Recopy** 拖入"应用程序"文件夹
2. 在"应用程序"中**右键点击**（或 Control+点击）Recopy
3. 在弹出菜单中选择**打开**
4. 在弹出的对话框中点击**打开**确认

只需操作一次，之后即可正常打开。

## 方法二：系统设置

如果你双击 Recopy 后看到"无法打开"的提示：

1. 打开 **系统设置** → **隐私与安全性**
2. 向下滚动到**安全性**部分
3. 你会看到提示：*"Recopy"已被阻止使用，因为它并非来自已识别的开发者*
4. 点击**仍然打开**
5. 根据提示输入密码

## 方法三：终端命令（高级）

移除隔离属性：

```bash
xattr -d com.apple.quarantine /Applications/Recopy.app
```

## 为什么需要这样做？

macOS Gatekeeper 要求应用使用 Apple 开发者证书签名。Recopy 是免费项目，尚未配置代码签名。应用本身是安全的——你可以在 [GitHub](https://github.com/shiqkuangsan/Recopy) 上查看完整源代码。

我们计划后续添加代码签名和公证。
