# H1 merge_ready

## 交付

- `Settings.themeMode`: 可选 `light | dark | system`，缺省由端口 `DEFAULT_THEME_MODE` 表达为 system；与 themePreset 分开，旧文件兼容，未知值明确报错，原子写保持原实现。
- renderer 补丁 `window-appearance-close.patch`: `onWindowAppearanceChange(callback|null)`、`getWindowAppearance()`、`closeWindow()`；弱非阻塞 TSFN，null 释放 observer，Vibrant* 归并。closeWindow 绕过 veto，沿 LastWindowClosed 退出规则。
- platform/window: `getSystemAppearance`、`subscribeSystemAppearance`，activation/appearance/reduced motion 共用唯一 `createNativeValueSubscription`；首值只建基线；失败注册回滚 session，之后仍明确失败而非静默。
- 关闭守卫单 owner：`supported` 仅表示 veto 能力(macOS)，`close()` 只依赖 closeWindow。同步 shouldClose 中 close() 被 TS 抛错拦截。
- 追加 reduced motion: native NSWorkspace getter + display-options notification observer，platform `getReducedMotion/subscribeReducedMotion`，macOS 实现，其它平台明确报错。

## 实跑验证

| 命令/场景 | 结果 |
| --- | --- |
| `GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/h1-gpuix bash scripts/gpuix-main/build.sh runtime` | 通过；隔离 checkout，未改共享 vendor |
| `node scripts/gpuix-main/check.mjs` | 七补丁源码、native/host/React 产物验证通过 |
| vendor `cargo test --release --manifest-path packages/native/Cargo.toml --lib --features test-support,gpui_platform/runtime_shaders` | 274 pass |
| `pnpm install --frozen-lockfile`、`pnpm native:build` | 通过 |
| 根目录 `cargo check`、`cargo test` | 通过；49 tests，native 17、engine 32 |
| `pnpm --dir apps/gpuix exec tsc --noEmit` | 通过 |
| `bun test --cwd apps/gpuix` | 825 pass、1 fail、827 tests；唯一 fail 是协调者已知主干问题 `secondary click on an interactive title opens its track context menu`。H1 之前在干净 gpuix-migration worktree 同样复现，未改轨道代码或断言 |
| `node scripts/gpuix-review-scan.mjs` | 5 source、4 test；0 HARD、0 WARN |
| `pnpm exec eslint apps/gpuix/src/platform` | 通过 |
| 原生真实窗口，协调者代切 Dark→Light→Dark | 原生基线 dark；平台只通知 light/dark 两个变化，截图与日志已归档 |
| AXCloseButton dirty veto，随后 Don't save and close | 一次 closeRequest=false 后窗口保留；选择后关闭且 exit 0，没有再问 veto |
| 最终 `bun --hot /tmp/h1-final-smoke.mjs`，命名 service `h1-final-smoke` | `getSystemAppearance=dark`、`getReducedMotion=false`；AX statictext 对应当前值。取证后 13.6 秒即 kill，临时入口删除 |

截图及完整原始行为记录见同目录 `appearance-*-2026-10-15.png`、`h1-demo-log-2026-10-15.txt`。最终 smoke 截图早于文本重绘，文本值以 AX 为证，不把空白截图当视觉验证。

## 自审结果

独立只读 pstack-reviewer：H1Standards、H1Spec，以及新增 getter/reduced-motion 后的 H1FollowupReview。审查命令 `git diff gpuix-migration...HEAD`；初审覆盖 54aacfc 起 H1 提交，复审逐一 `git show 73d00c7 4816f51 f852e59 1b424ef 1f356cf ef2a8de 13e53da`。全部提交列表可用 `git log --oneline gpuix-migration..HEAD` 复查。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| LESSONS 仍称关闭守卫是 stub | 必修 | 改为 D1/H1 接通现状 | LESSONS 关闭拦截条目 |
| 首值仅基线导致启动时拿不到外观 | 汇报仲裁 | 批准增加同步 getter，保持基线规则 | renderer getWindowAppearance、platform getSystemAppearance；真实 smoke |
| Win/Linux 有 closeWindow 但无 veto | 汇报仲裁 | supported 仅表 veto，close 独立可用 | close-guard.ts；无 veto renderer 行为测试 |
| 直接同步 renderer.closeWindow 会重入 AppKit | 汇报仲裁 | 保留禁止调用契约，文档准确写 panic/可能 abort；guard 抛错 | patch d.ts/Rust doc、close-guard.test.ts |
| 高对比度外观可能映射成 light | 汇报仲裁 | 按协调者决定只记录推断，不改 zed，不切辅助设置；移出 LESSONS | window README、研究文档限制 |
| 提交标题含并列词 | 必修 | 本地重写标题；无 push | 最终 git log |
| vendor 测试只能测基线/归并/释放，不能模拟变化 | 记录 | GPUI test_window 私有；真实系统切换补证；不声称测试了 napi close 接线 | 文档、日志、原生窗口退出 |
| 只测 stub getter 转发 | 必修 | 删除，保留缺能力错误测试，真实 smoke 覆盖 getter | system-appearance.test.ts |
| 原生 register 抛错后遗留 session | 必修 | catch 回滚 session；连续两次失败测试 | native-value-subscription.ts/test.ts |
| 多余 unsafe Send/newtype | 必修 | 删除，使用 objc2 自动 Send/Sync | reduced_motion.rs；cargo check/test |
| observer 先读后注册有丢失窗口 | 必修 | 先 addObserver 再回报基线 | reduced_motion.rs |
| ObjC 类名、初始化说明 | 记录 | 前缀 Zoeydaw，补 init SAFETY 注释 | reduced_motion.rs |
| napi 测试另注册 observer 是否算第二 owner | 汇报仲裁 | 协调者批准保留真实异步基线测试；不是产品 owner；不加接线测试 | reduced-motion.test.ts |
| NSObject feature 多余 | 汇报仲裁 | 已移除；保留显式 std/NSNotification/NSString | Cargo.toml |
| baseline/active 单用常量 | 记录 | 留下以满足 n/no-callback-literal lint | system-appearance.test.ts |
| native getter/observer API 不支持非 macOS | 记录 | 明确抛错，无猜测回退 | reduced-motion.ts/rs、README |

变异：Rust settings lenient alias 1 fail；VibrantDark 错误归并+删原生基线 2 fail；TS deciding/恒 true veto/空 close/误接 activation/删基线判断/删 null 注销依次 1/2/1/1/6/5 fail。getter 恒 dark、supported 错绑 closeWindow、closeWindow 缺失时静默返回均各 1 fail。reduced motion 删基线 1 fail，TS getter 恒 true 1 fail。所有变异已恢复。删 removeObserver 的 mutation 仍通过(释放 Retained 后 NotificationCenter 弱引用不回调)，已诚实记在研究文档，不声称覆盖了其调用本身。

## 依赖 diff

`objc2-app-kit` 原版本 0.3.2 保持，只追加 `NSWorkspace`、`NSAccessibility` feature；直接增加 `objc2-foundation = { version = "0.3.2", default-features = false, features = ["std", "NSNotification", "NSString"] }`，版本已有于锁文件。`Cargo.lock` 仅 zoeydaw-native dependencies 多 `"objc2-foundation"` 一行，无新增版本。已获协调者批准。

## 未验证/限制

- Windows/Linux/FreeBSD 路径源码已实现外观及 closeWindow，但未跨平台编译/运行。
- 减少动态效果真实切换未做，按协调者决定不改用户辅助设置；真实 getter/baseline 为 false；Rust 合成通知覆盖回报、替换和注销。
- 辅助功能高对比度问题是未实测推断，非修复承诺。
- 原生 appearance 是 effectiveAppearance，不能同时用 NSApp.appearance 覆盖后仍称跟随系统。
- 产品控件、布局、UI token 未改。UI 第13节的间距、居中、尺寸、密度、Live对照、焦点/拖动/弹层等不适用本能力切片；明暗事件及关闭生命周期以上述实际窗口/AX证据验收，不声称全应用视觉完成。

## 进程清理

最终实际运行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空。h1-demo exit 0；h1-final-smoke 取证后立即 kill；本切片临时脚本均删除。中途观察到 clip-editors 的 bun --hot，已用 lsof 确认属于另一 worktree，未停止用户/其他 worker 进程。未 push，未启动 tauri。
