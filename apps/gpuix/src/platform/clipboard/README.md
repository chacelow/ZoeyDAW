# 系统文本剪贴板

`createNativeClipboard()` 返回同步 `NativeClipboard` 端口。默认 `readText`、`writeText` 直接绑定 `@zoeydaw/native` 的 `clipboardReadText`、`clipboardWriteText`，不导入渲染器、不启动窗口，也没有 JS fallback。`createNativeClipboard(implementation)` 使用调用方传入的端口，不修改其他实例的默认实现。

## 平台范围

| 平台 | `readText()` | `writeText(text)` |
| --- | --- | --- |
| macOS | `NSPasteboard.generalPasteboard().stringForType(NSPasteboardTypeString)`，无文本返回 `null` | 清空原有内容，写入字符串。`setString_forType` 返回 false 时抛出 napi 错误 |
| Windows、Linux | `null` | 抛出 `System clipboard text writing is not implemented on this platform` |

写入空字符串与无文本不同。写入替换整个剪贴板，不保留富文本、图片或文件 representation。剪贴板由操作系统持有，不缓存文本，不创建第二个状态 owner。单次同步调用不代表跨进程或跨线程的读写事务。

Rust 仅启用已有 `objc2-app-kit` 依赖的 `NSPasteboard` feature。`NSPasteboardType` 是公开的 `NSString` 类型别名，可用 `from_str` 构造文本，无需新增 Foundation 直接依赖。每次调用用独立 autorelease pool 管理临时 Objective-C 对象。

API 来源：[NSPasteboard](https://docs.rs/objc2-app-kit/0.3.2/objc2_app_kit/struct.NSPasteboard.html)、[NSPasteboardType](https://docs.rs/objc2-app-kit/0.3.2/objc2_app_kit/type.NSPasteboardType.html)。

## 线程及初始化顺序实测

2026-10-15，macOS arm64、Bun 1.3.14、gpuix 0.10.0、真实 release napi 二进制。临时入口先调用剪贴板，再加载现有 `src/main.tsx` 创建窗口，最后再次调用剪贴板。四条路径均写入并逐字节读回以下 59 字节文本，另外验证空字符串往返。

```text
E1 原生剪贴板\n中文往返 🎹🎵\r\n组合 e\u0301\u0000末尾
```

| 路径                   | `isMainThread` | `threadId` | 结果                               |
| ---------------------- | -------------- | ---------- | ---------------------------------- |
| 窗口创建前，主线程     | true           | 0          | `byteExact=true`，`emptyText=true` |
| 窗口创建前，Bun Worker | false          | 1          | `byteExact=true`，`emptyText=true` |
| 窗口创建后，主线程     | true           | 0          | `byteExact=true`，`emptyText=true` |
| 窗口创建后，Bun Worker | false          | 2          | `byteExact=true`，`emptyText=true` |

UTF-8 十六进制结果：

```text
453120e58e9fe7949fe589aae8b4b4e69dbf0ae4b8ade69687e5be80e8bf9420f09f8eb9f09f8eb50d0ae7bb84e590882065cc8100e69cabe5b0be
```

这四次调用没有 panic，GPUI 随后成功创建窗口，未复现 A7 的 `Ivar platform not found`。这是本机上述版本的实测，不是对所有 macOS 版本或同时竞争写入的保证。实现不调用 `NSApplication.sharedApplication`。

窗口 AX 证据：

```text
window "gpuix foundation check", pid=27004, bounds=480×268
  statictext "gpuix foundation: tokens + style helpers booted"
```

截图见 [窗口初始化成功](evidence/2026-10-15-window-after-clipboard.png)。本切片未改任何可见控件或布局，UI 规范第 13 节的视觉改动验收不适用。

## 剪贴板恢复

验证前 `computer.clipboard.read()` 返回空字符串，真实 native `clipboardReadText()` 返回 `null`。临时独立 Swift/AppKit 进程在内存中备份全部 pasteboard item 及其每个 type 的原始 Data，避免把无文本状态误恢复为空文本 representation。验证结束恢复全部数据，逐 item、type、Data 比较。备份和恢复输出：

```text
E1_CLIPBOARD_BACKUP_READY items=0 types=[]
E1_CLIPBOARD_ALL_REPRESENTATIONS_RESTORED items=0
clipboardTextRestored: true
originalNoTextStateRestored: true
```

临时 Worker 已 terminate，窗口在截图后立即关闭，备份进程恢复后退出，临时 TS 与 Swift 文件已删除。永久单元测试不会写宿主剪贴板。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `pnpm native:build`，仓库根 | 通过，release napi 二进制生成成功 |
| `cargo check --workspace` | 通过 |
| `cargo test --workspace` | 29 通过，0 失败，engine 21、native 8 |
| `cargo clippy -p zoeydaw-native --all-targets -- -D warnings` | 通过 |
| `pnpm exec tsc --noEmit`，`apps/gpuix` | 通过 |
| `bun test`，`apps/gpuix` | 472 通过，2 个已有 todo，0 失败，86 文件，94059 个断言 |
| `bun test src/platform/clipboard/clipboard.test.ts`，`apps/gpuix` | 3 通过，0 失败，8 个断言 |
| `pnpm exec eslint apps/gpuix/src/platform`，仓库根 | 通过，无输出 |
| `bun --hot src/platform/clipboard/smoke.tmp.ts`，临时入口 | 四条真实 native 路径通过，窗口截图及 AX 已观察 |
| `pnpm exec ultracite check apps/gpuix/src/platform/clipboard/index.ts apps/gpuix/src/platform/clipboard/clipboard.test.ts` | 通过 |

macOS 实现没有需要单独提取的纯 Rust 业务逻辑，不为 AppKit 转发添加无效单元测试。非 macOS 分支保留拒绝写入的条件测试，但本机未运行 Windows 或 Linux 目标。Cargo 输出既有非根 package profile 警告。Bun 全套输出 `Context leak detected, CoreAnalytics returned false`，测试退出码为 0。

## 进程清理证据

`e1-clipboard-smoke`、`e1-clipboard-smoke-run`、`e1-clipboard-backup` 均已关闭，E1 自启进程零残留。规定命令 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"` 的检查输出：

```text
33614 03:48       bun --hot src/gallery/controls.tsx
```

这是其他切片的 gallery，不是 E1 启动的进程。已告知协调者，未越权停止。此输出不表示全局零进程，只证明 E1 的三个命名进程均不在其中。

## LESSONS 格式条目

### 空剪贴板不能用写入空文本恢复

- 错：把 `computer.clipboard.read()` 的空字符串当成已有空文本 representation，或在 native 读到 `null` 后写入 `""` 并声称原状态已恢复。
- 对：真实写入测试前备份全部 pasteboard item/type/Data，结束后恢复并比较。原本 0 个 item 的剪贴板恢复后仍为 0 个 item。
- 因：文本抽象隐藏了无文本与空文本的区别，单独恢复字符串会改变剪贴板类型信息。
- 见：本切片实测 `items=0` 的备份与恢复输出。

### NSPasteboard 可以在本机 Bun Worker 与 gpuix 初始化前使用

- 对：直接使用 `NSPasteboard.generalPasteboard`，不要为剪贴板创建 `NSApplication.sharedApplication`。调用内使用 autorelease pool。
- 验证：macOS arm64、Bun 1.3.14、gpuix 0.10.0，窗口前后各一次主线程及 Worker 调用，59 字节 UTF-8 与空字符串往返均通过，随后原生窗口正常创建。
- 范围：其他平台没有实现，不承诺并发读写事务，不把本机版本实测推广到所有系统。
