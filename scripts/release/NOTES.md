## 安装 macOS arm64 版本

此版本仅适用于 Apple Silicon，未使用 Apple Developer ID 签名，也未公证。图标是可替换的占位图标。

1. 下载 `.dmg`，打开后把 `zoeydaw.app` 拖到「应用程序」。也可以解压 `.app.zip` 后移动应用。
2. 首次打开时，右键点击 `zoeydaw.app`，选择「打开」，再确认打开。
3. 如果 macOS 仍阻止打开，只在确认下载来源可信后，对安装的这一份应用移除隔离属性：

```bash
xattr -dr com.apple.quarantine /Applications/zoeydaw.app
```

不要全局关闭 Gatekeeper。Bun 可执行文件可能含本地 ad-hoc 签名，该签名不是 Developer ID 签名。

下载资产后，在同一目录运行 `shasum -a 256 -c SHA256SUMS-macos-arm64` 校验 SHA-256。设置与工程快照保存在 `~/Library/Application Support/com.zoeydaw.desktop`，默认日志保存在 `~/Library/Logs/com.zoeydaw.desktop`，不会写入应用包。

本 release 由 CI 创建为 draft，维护者核对资产、安装与播放后手动发布。Windows 资产尚未提供；macOS 13 为可执行文件声明的最低版本，旧系统尚未实机验证。
