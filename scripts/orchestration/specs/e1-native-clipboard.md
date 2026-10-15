# E1 native-clipboard:系统剪贴板文本读写(Rust napi)

## Target

Worktree `gpuix-e1-native-clipboard`(子 worktree,基线 `gpuix-migration`)。

## 背景

web 的 Clip/MIDI 复制剪切粘贴依赖浏览器 `ClipboardEvent`。gpuix 主干的 GPUI 内部有 `App::read_from_clipboard`/`write_to_clipboard`,但渲染器没有暴露给 JS,`@zoeydaw/native` 也没有剪贴板能力。B2 的 clip-lane、clip-editors 需要同步的系统剪贴板文本读写。能 Rust 做就 Rust 做,**不造 JS fallback**(不用 `navigator.clipboard`、不用 `pbcopy` 子进程)。

## Change

1. `crates/native/src/clipboard.rs`:`#[napi] pub fn clipboard_read_text() -> Option<String>`(TS `clipboardReadText(): string | null`)、`#[napi] pub fn clipboard_write_text(text: String) -> napi::Result<()>`(TS `clipboardWriteText(text: string): void`)。
   - macOS:`objc2-app-kit` 的 `NSPasteboard::generalPasteboard()`,`stringForType(NSPasteboardTypeString)` 与 `clearContents` + `setString_forType`。**先实测线程要求**:Bun worker 线程调用是否安全(NSPasteboard 通常线程安全,不要凭记忆下结论;参照 A7 的教训:不要在 gpuix 初始化前创建 NSApplication 对象——`NSPasteboard::generalPasteboard` 不应触发,请验证 gpuix 窗口之后/之前调用都不 panic)。写进注释。
   - Windows/Linux:返回 `None` / 返回明确错误(未实现),**不假装成功**;在文档写明平台范围。
2. 依赖:`objc2-app-kit` 只在已有 `cfg(target_os = "macos")` 段里**追加 feature**(`NSPasteboard`、`NSPasteboardItem` 视实际需要,越少越好),**批准仅限此项**;不新增其他 crate。
3. TS:`apps/gpuix/src/platform/clipboard/index.ts` 导出同步 `NativeClipboard` 端口:`{ readText(): string | null; writeText(text: string): void }`,默认实现包装 `@zoeydaw/native`;可注入(测试用内存实现)。platform 层不得 import 渲染器包。
4. 测试:Rust 纯逻辑部分 `cargo test`;TS 端口的注入语义(默认实现委托、注入覆盖)。**真实往返**:写入一串含中文、换行、emoji 的文本再读回,必须逐字节一致;测试前备份用户剪贴板内容并在结束时**恢复**(`computer.clipboard.read/write` 或同一 API),不得留下测试文本污染用户剪贴板。

## Constraints

- 拥有路径:`crates/native/src/{clipboard.rs,lib.rs(仅 mod 登记)}`、`crates/native/Cargo.toml`(仅上述 feature)、`apps/gpuix/src/platform/clipboard/**`。
- 不动 `cursor.rs`、`ui/**`、`project/**`。`Cargo.lock` 冲突由协调者重生成。不 push,不碰 `main`,不碰其他 worktree。
- 进程清理强制:任何验证进程完成即关,`worker_done` 前 `ps` 零残留。

## Observable acceptance

- `cargo test --workspace`、`cargo clippy -p zoeydaw-native --all-targets -- -D warnings`、`pnpm native:build`、`apps/gpuix` 的 `tsc --noEmit`、`bun test`、`pnpm exec eslint apps/gpuix/src/platform` 通过(贴命令与计数)。
- 真实往返输出(含中文/换行/emoji)与剪贴板恢复证明。错题/已验证做法单列,LESSONS 格式。
