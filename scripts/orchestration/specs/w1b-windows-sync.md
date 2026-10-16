# W1b：Windows 移植同步主干后重新交付（返工，同一 lane）

你上一轮交付的 `927a876e` 复核通过（依赖：`url 2.5.8` 已在锁文件里，`windows-sys` 只加 feature，没问题），但合进当前主干时有 5 处冲突。主干在你的基线之后又合入了 C2、C3、U1，以及发布签名修复。

本任务在你原来的分支 `chacelow/gpuix-w1-windows` 上继续（这是未合入的返工，不切新分支）。

## 要做

1. `git merge gpuix-migration`，按下面的规则解决冲突：
   - `apps/gpuix/src/app/project/ArrangementPanel.tsx`，以及 `verification/clip-edit/demo/index.tsx`、`verification/footer/demo.tsx`、`verification/tracks/demo.tsx`：以主干的结构为准，只把你的 cursor port 那几行接进去。
   - `scripts/release/package.mjs`：保留主干的签名流程（`a39d3284`）。主干的顺序是：cargo-packager 只生成 `.app`，然后 `codesign --force --deep --sign -` 重签并 `--verify --strict`，再用 `hdiutil` 从签好的 app 生成 DMG。你的 Windows/NSIS 分支放在 macOS 分支之外；macOS 路径不能退回用 cargo-packager 生成 DMG 的旧做法。`release.yml` 里的 “Verify shipped signatures” 步骤只在 macOS 上运行。
2. 合并后只跑轻量检查：tsc、改动范围的 bun test 和 eslint、actionlint、两个 crate 的 `cargo test`、`cargo check --target x86_64-pc-windows-msvc`。
3. 发 `merge_ready`，写明新 SHA。合入后由协调者推 main，用 Actions 的 Windows job 结果作为 Windows 的验收证据。

worktree 和终端保留（长期 lane）。
