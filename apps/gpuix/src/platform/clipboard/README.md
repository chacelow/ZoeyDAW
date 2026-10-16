# 系统文本剪贴板

`createNativeClipboard()` 返回同步 `NativeClipboard` 端口。默认 `readText`、`writeText` 直接绑定 `@zoeydaw/native` 的 `clipboardReadText`、`clipboardWriteText`，不导入渲染器、不启动窗口，也没有 JS fallback。`createNativeClipboard(implementation)` 使用调用方传入的端口，不修改其他实例的默认实现。

## 平台范围

| 平台 | `readText()` | `writeText(text)` |
| --- | --- | --- |
| macOS | `NSPasteboard.generalPasteboard().stringForType(NSPasteboardTypeString)`，无文本返回 `null` | 清空原有内容，写入字符串。`setString_forType` 返回 false 时抛出 napi 错误 |
| Windows | `CF_UNICODETEXT`，有界 UTF-16 解码；无文本、忙碌或无效块返回 `null` | 有效隐藏 owner HWND + `OpenClipboard`/`EmptyClipboard`/`SetClipboardData`，失败抛错；嵌入 U+0000 在清空前拒绝 |
| Linux | `null` | 抛出 `System clipboard text writing is not implemented on this platform` |

写入空字符串与无文本不同。写入替换整个剪贴板，不保留富文本、图片或文件 representation。剪贴板由操作系统持有，不缓存文本，不创建第二个状态 owner。单次同步调用不代表跨进程或跨线程的读写事务。

Rust 仅启用已有 `objc2-app-kit` 依赖的 `NSPasteboard` feature。`NSPasteboardType` 是公开的 `NSString` 类型别名，可用 `from_str` 构造文本，无需新增 Foundation 直接依赖。每次调用用独立 autorelease pool 管理临时 Objective-C 对象。

API 来源：[NSPasteboard](https://docs.rs/objc2-app-kit/0.3.2/objc2_app_kit/struct.NSPasteboard.html)、[NSPasteboardType](https://docs.rs/objc2-app-kit/0.3.2/objc2_app_kit/type.NSPasteboardType.html)。

Windows 源码使用临时隐藏 HWND；作用域析构保证 CloseClipboard/DestroyWindow、GlobalUnlock 与尚未转移的 GlobalFree。先拒绝 U+0000、编码/分配/填充 UTF-16，再打开与清空剪贴板；成功 SetClipboardData 后 HGLOBAL 交给 OS，失败仍由本模块释放。空字符串合法，读到的块只借用、不释放，GlobalSize 限定终止符搜索，缺失 NUL 或无效 UTF-16 返回 null。无重试、缓存、私有格式。macOS 的任意 NSString 行为不变，下面含 U+0000 的 macOS 实测不适用于 Windows。Windows 跨进程/Worker、忙碌与 owner 生命周期仍待 Windows 运行验收。

## 剪贴板恢复

验证前 `computer.clipboard.read()` 返回空字符串，真实 native `clipboardReadText()` 返回 `null`。临时独立 Swift/AppKit 进程在内存中备份全部 pasteboard item 及其每个 type 的原始 Data，避免把无文本状态误恢复为空文本 representation。验证结束恢复全部数据，逐 item、type、Data 比较。备份和恢复输出：

```text
E1_CLIPBOARD_BACKUP_READY items=0 types=[]
E1_CLIPBOARD_ALL_REPRESENTATIONS_RESTORED items=0
clipboardTextRestored: true
originalNoTextStateRestored: true
```

临时 Worker 已 terminate，窗口在截图后立即关闭，备份进程恢复后退出，临时 TS 与 Swift 文件已删除。永久单元测试不会写宿主剪贴板。
