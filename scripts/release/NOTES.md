## 安装 macOS arm64 版本

此版本仅适用于 Apple Silicon，未使用 Apple Developer ID 签名，也未公证。图标是可替换的占位图标。

1. 下载 `.dmg`，打开后把 `zoeydaw.app` 拖到「应用程序」。也可以解压 `.app.zip` 后移动应用。
2. 首次打开会提示“无法验证开发者”。在「系统设置 → 隐私与安全性」底部点「仍要打开」，或右键点击 `zoeydaw.app` 选择「打开」后确认。
3. 如果仍被阻止，在确认下载来源可信后，只对这一份应用移除隔离属性：

```bash
xattr -dr com.apple.quarantine /Applications/zoeydaw.app
```

不要全局关闭 Gatekeeper。应用使用 ad-hoc 签名，不是 Developer ID 签名；流水线会严格校验发布包内应用的签名，提示“已损坏”说明下载不完整或资产被改动，请重新下载并核对 SHA-256。

下载资产后，在同一目录运行 `shasum -a 256 -c SHA256SUMS-macos-arm64` 校验 SHA-256。设置与最近工程列表保存在 `~/Library/Application Support/com.zoeydaw.desktop`，工程默认保存在 文稿/ZoeyDAW，默认日志保存在 `~/Library/Logs/com.zoeydaw.desktop`，不会写入应用包。

本 release 由 CI 创建为 draft，维护者核对资产、安装与播放后手动发布。macOS 13 为可执行文件声明的最低版本，旧系统尚未实机验证。

## 安装 Windows x64 版本

Windows matrix 成功后提供 NSIS `-setup.exe`。两个原生 binding 都嵌入主程序，不需要单独复制 `.node` 或 `node_modules`；安装器随附仓库与 gpuix 的许可证声明。安装器与可执行文件尚未使用代码签名，暂用默认图标。

先用 `Get-FileHash -Algorithm SHA256 .\*.exe` 对照 `SHA256SUMS-windows-x64`。确认来源与校验值后运行安装器。不要为运行它全局关闭 Windows 安全功能。

设置、日志与默认工程目录由原生 `userDirectories()` 选择，不写入安装包。Windows 实际构建结果以 Actions 为准；隐藏光标拖动、音频设备、多显示器缩放和安装器交互尚需 Windows 实机验收，见 [Windows 移植报告](https://github.com/chacelow/ZoeyDAW/blob/main/docs/research/windows-port.md)。
