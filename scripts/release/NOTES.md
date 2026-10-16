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

本 release 由 CI 创建为 draft，维护者核对资产、安装与播放后手动发布。macOS 13 为可执行文件声明的最低版本，旧系统尚未实机验证。

## 安装 Windows x64 版本

Windows matrix 成功后提供 NSIS `-setup.exe`。两个原生 binding 都嵌入主程序，不需要单独复制 `.node` 或 `node_modules`；安装器随附仓库与 gpuix 的许可证声明。安装器与可执行文件尚未使用代码签名，暂用默认图标。

先用 `Get-FileHash -Algorithm SHA256 .\*.exe` 对照 `SHA256SUMS-windows-x64`。确认来源与校验值后运行安装器。不要为运行它全局关闭 Windows 安全功能。

设置、快照与日志由原生 `userDirectories()` 选择用户目录，不写入安装包。Windows 实际构建结果以 Actions 为准；隐藏光标拖动、音频设备、多显示器缩放和安装器交互尚需 Windows 实机验收，见 [Windows 移植报告](https://github.com/chacelow/ZoeyDAW/blob/main/docs/research/windows-port.md)。
