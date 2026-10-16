# Windows x64 移植

2026-10-16，W1，`x86_64-pc-windows-msvc`。源实现与本地可执行验证完成；Windows vendor 构建、运行、安装仍须协调者合入后在 Actions 验收，不能称为已支持。Linux 不在范围。

## 基线和接口

派发基线 `b53cd676`，分支 `chacelow/gpuix-w1-windows`。已合入协调者主干 `60e4b97c27886d3d81ab3ae33141217c709778bb`，保留 P1 最终图标、许可证、`0.1.0-alpha.1` 版本和 engine xrun 非致命修复。后续主干 C3 等合入由协调者再次集成，不能覆盖其工作。gpuix 固定 `6a5c7c142ac32f9eb0caefe0121be995cfc18631`，Zed 固定 `c2e9f882030ca95cee55d206512a0a3ee6cd72b0`。

完整审查命令：`git diff 60e4b97c27886d3d81ab3ae33141217c709778bb...HEAD`。原实现提交为 `c1a4ee21`、`124de6d7`、`b67194a1`、`face6dae`、`9185c00d`；主干合并 `ce10c938`，测试质量修正 `c79b10e2`。返修提交包含 Unix 兼容、registry 与真实生命周期探针。

## 能力矩阵

“实现”表示源码及可检查的契约，不表示 Windows 实机验证。

| 能力 | macOS | Windows | 证据与边界 |
| --- | --- | --- | --- |
| nativeVersion | 既有实现 | 可移植 | crates Windows check 通过 |
| app_state | NSRunningApplication | foreground HWND/PID 已有实现 | Windows 运行未验证，未知仍 null |
| atomic_file | rename、目录 fsync | MoveFileExW replace/write-through 已有实现 | 不承诺 Windows 目录 fsync 或相同断电耐久性 |
| clipboard | NSPasteboard 保持 | CF_UNICODETEXT、有效隐藏 owner、HGLOBAL RAII | NUL 在修改前拒绝；跨进程实跑未验证 |
| cursor position/restore | CoreGraphics 保持 | Get/SetPhysicalCursorPos、范围与舍入校验 | Windows 锚点为虚拟桌面物理像素，可为负 |
| 持续隐藏光标 | 原 native 路径 | UI-thread ShowCursor 自有计数平衡 | 失活/退出清理；物理隐藏/归位未验证 |
| window_geometry | NSWindow 转换保持 | HWND DPI、ClientToScreen、临时 DPI context | 事件至 JS 期间窗口移动竞态未解决，不宣称跨屏精确 |
| window_diagnostics | AppKit 已有 | 明确 unsupported | CI 显式断言，不伪造 occlusion/main-window bool |
| reduced motion | NSWorkspace 保持 | SPI_GETCLIENTAREAANIMATION 取反、WM_SETTINGCHANGE 线程 | baseline/替换/注销、Env cleanup；系统实际切换未验证 |
| settings/snapshots | 原持久化 | 复用 dirs/serde/原子文件 | 不新增主题状态 owner |
| external/log | 既有实现 | ShellExecuteW/explorer、文件 sink 复用 | Windows 打开目录与文件删除语义未实跑 |
| engine/session/peaks | 真实后端 smoke 通过 | Firewheel/CPAL WASAPI、桥可交叉检查 | 无设备 fallback；真实设备未验证 |
| engine cleanup/telemetry | 既有 Env owner/单 in-flight | 同一实现 | Windows Worker teardown 待 Actions |
| file URI | 严格恢复原 Unix 解码 | Url::to_file_path 支持 drive/UNC | #、?、真实 symlink/.. 回归与平台 mutation |
| appearance | renderer observer | 复用 GPUI Windows observer | 不另建 native 外观 owner |
| frames/resume | embedded loop 保持 | bounded NonBlocking TSFN、token/ack、pre-present gate | 纯协议测试通过；Windows闭环待 Actions |
| close guard | 同步 veto 保持 | 先 veto、异步 predicate、拒绝过期响应 | confirmed closeWindow bypass |
| renderer 生命周期 | 原路径 | 每 Env 一个 registry hook、实例注销、幂等 shutdown | 5 个真实源 registry 单测通过，Windows释放待 Actions |
| offscreen scale/bounds | 原 1x/2x | requested bounds、scale、物理 target 接通 | Windows 4000×3000 默认/1/2 回归已接 CI，未本机运行 |
| WARP | 不适用 | GPUIX_FORCE_WARP=1 显式选择 | 默认生产 adapter 选择不变；实际运行待 CI |

现有手势使用按下点与绝对事件位移，GPUI 已 SetCapture/ReleaseCapture。本次不增加 ClipCursor、raw input、AttachThreadInput，也不宣称无限拖动。所有旧 nativeCursorLock 调用方已迁移到 renderer 作用域 factory，不保留 alias。业务没有新增 process.platform；Windows effect 方法缺失时 hide/restore 明确抛错，离屏 capture 仍调用真实 native geometry。

## 全部补丁盘点

| 原补丁                                | Windows 处理                                            |
| ------------------------------------- | ------------------------------------------------------- |
| close-guard.patch                     | 原 Mac 同步实现；windows-ui-bridge 补异步 veto/response |
| frame-callback.patch                  | 原 Mac API；Windows bounded TSFN 单 in-flight           |
| input-select-all-on-focus.patch       | 平台无关，复用；Windows IME 未验证                      |
| anchored-center.patch                 | 平台无关，复用；混合 DPI 未验证                         |
| select-trigger-space.patch            | React 逻辑复用；Windows键盘实机未验证                   |
| window-active-change.patch            | 已有 UI command/TSFN，复用                              |
| window-appearance-close.patch         | 已有 appearance/bypass close，复用                      |
| context-menu.patch                    | 平台无关；Windows native right click 复用               |
| quad-batch.patch                      | owned buffer 复用；DirectX像素等价未验证                |
| autofocus-focus-event.patch           | UI FocusHandle owner 复用                               |
| resume-frame.patch                    | 原 Mac prepaint；Windows gate 单独追加                  |
| aria-toggled.patch                    | AccessKit映射复用；Windows UIA 未实机验证               |
| test-window-scale-factor.patch        | 边界校验复用，Windows平台消费新增                       |
| zed-production-no-sync-draw.patch     | 平台无关 Production 语义保留                            |
| zed-offscreen-window-bounds.patch     | Mac专用实现保留，Windows另补                            |
| zed-test-window-scale-factor.patch    | 通用参数链保留，Windows另补                             |
| windows-ui-bridge.patch               | 帧、resume、close、cursor、Windows scale 回归           |
| zed-windows-resume-offscreen.patch    | GPUI gate、restore generation、offscreen、WARP          |
| windows-renderer-cleanup.patch        | 每 Env registry、显式终止 receiver、幂等注销            |
| zed-windows-successful-presents.patch | 只在 DXGI Present 成功后计数，非物理可见性证明          |

隔离 vendor 为 `/Volumes/PSSD/code/_vendor/w1-gpuix/6a5c7c142ac32f9eb0caefe0121be995cfc18631`。有序源身份检查通过 15 renderer、5 Zed 补丁。没有覆盖共享 vendor，没有改旧补丁，没有新增锁定 crate。

## 线程与资源决策

UI 不阻塞等待 JS。普通帧和 resume 使用 generation/token/ack；resume 在提交确认前延后 present，但继续处理输入与 commands。JS trampoline 拒绝过期回调。关闭请求先 veto，重复请求合并，旧 handler 的 true 不关闭新状态。

初版逐实例 Env hook 被独立审查退回。锁定 napi 3.12.7 的 remove_env_cleanup_hook 不回收 Box::leak 包装，不能用“移除了 handle”冒充释放。最终每 Env 仅注册一个 hook，registry 只持有活跃实例；close、Drop、tick 退出均移除 registration 并主动 shutdown。receiver 收到终止命令即 break/cx.quit，不等待所有 TSFN sender 断开。Env teardown 只清理剩余实例。

## CI 与 P1 release

Windows Node driver 复用 config、完整补丁身份和 manifest，使用 junction、MSVC ABI 文件名、显式 Git executable。macOS shell 构建路径保持。Windows checkout 前配置 LF。Git 默认 Windows ProgramFiles/Git/cmd/git.exe，允许绝对 GPUIX_GIT_EXECUTABLE；不忽略安全 lint。

ci.yml 的 Windows job 只在 main push 运行，首轮 continue-on-error。缓存由 RUNNER_WORKSPACE 写入 GITHUB_ENV，再用 env.GPUIX_VENDOR_ROOT/env.CARGO_TARGET_DIR，vendor/target 分层。`verify-windows.mjs` 构建 native、执行 Rust/类型/Bun/架构、URI mutation、GPUI gate、离屏 scale、真实后端与 Gallery。独立检查失败后仍保留截图和故障证据，不假通过。

std-only User32 driver 按准确 PID/title 定位自有窗口，操作前重新核对归属，真实 minimize/restore/WM_CLOSE。runtime 验证无提前成功 Present、JS提交后继续 Present、veto/allow/陈旧响应和 bypass；successfulPresents 不等同 frames，也不等同物理屏幕可见。Windows探针只在 Actions 编译运行。

P1 接口为 `bun scripts/release/package.mjs <version> [output-directory]`，Bun plugin 将包名及真实 loader 路径都变为静态 .node require，不改 vendor loader。Windows binding 后缀 win32-x64-msvc；Bun exe → cargo-packager 0.11.8 nsis。只分发含五份许可证资源的安装器与 SHA256SUMS-windows-x64，不发布裸 exe。release matrix 加 windows-latest，draft聚合未改；evidence-release-* 不匹配资产下载 release-*。尚未生成/安装 Windows包，未push、未打tag。

## 已执行验证

| 检查 | 结果 |
| --- | --- |
| 改动 crates cargo check/test，合入主干后重跑 | 64 passed；保留既有非根 profile 告警 |
| cargo check --target x86_64-pc-windows-msvc | libs 通过 |
| cargo check --tests --target x86_64-pc-windows-msvc | Windows-only测试类型通过 |
| vendor Windows cargo check | ring C build 缺 assert.h/Windows SDK，未到 renderer源码或链接 |
| vendor固定工具链 target add | missing manifest；同版本stable重试后到上述SDK边界 |
| Unix兼容 path_tests | 5 passed，含真实临时 symlink读取 |
| W1 URI mutation | 被真实 unix_file_uris_decode_escaped_local_paths 失败杀死，非编译失败 |
| 实际 windows_protocol.rs rustc独立测试 | 5 passed；仅纯状态，不是Win32集成 |
| 实际 windows_lifecycle.rs 外部Cargo harness | 5 passed；仅复用已锁 parking_lot 0.12.5，临时目录已删除 |
| app、Windows smoke、release smoke tsc | 通过 |
| scoped platform/frame Bun | 41 passed；后续 cursor 1 passed、reduced-motion 2 passed |
| Node source/build身份 | 7 passed；Windows ABI fixture修复TEMP后1 passed |
| ultracite与各本地commit hook | 通过，无no-verify |
| actionlint | 通过 |
| review scan | 0 HARD / 4 WARN，见自审表 |
| 全仓绝对路径scan | 835 tracked源码，0 HARD / 0 WARN |
| Mac真实后端离屏应用 | playingBar=2.0349620625，停止后released=true，进程退出0 |
| Mac完整Gallery | 深浅、中英四个完整组合图，进程退出0 |
| 自有后台真实窗口 | created native window/mount complete；33.6秒后关闭；AX因computer session closed不可用 |

按较新指令未在本机跑完整 pnpm verify:gpuix、vendor整库重建或打包；这些交给 Actions。Mac smoke 使用既有已验证 renderer 与本轮 native debug binding，不冒充新 Windows renderer二进制证据。

证据目录 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/w1-windows-port-evidence-HB9Xh5`：home.png、arrangement-playing.png、arrangement-stopped.png、smoke.json，gallery/{en,zh}-{dark,light}.png 与原生 a11y/stats JSON。所有临时入口和测试harness已删除。命名 service w1-background-window、w1-offscreen-smoke、w1-gallery-proof 均已关闭。

进程清理命令：`ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"`。实际输出为空，grep退出1表示无匹配；没有停止用户或其他worker服务。

## UI 规范第13节

| 项目                    | 证据与结论                                                     |
| ----------------------- | -------------------------------------------------------------- |
| Gallery/业务整体        | 上述完整Gallery与真实后端Arrangement，Mac离屏，不是Windows桌面 |
| 对齐居中                | 组合图可观察标题、数值和折叠按钮；未改布局，Windows DPI未验证  |
| gap/padding/尺寸/紧凑感 | 复用原组件/token；四处既有fixture初始窗口bounds不变            |
| 排版、裁切与中英文      | 四组合图已观察；Windows字体fallback未验证                      |
| 深浅颜色层级            | 深浅图已观察，未新增颜色或设计变量                             |
| 状态与键盘焦点          | 原生语义树保留；未执行Windows鼠标/键盘动作，不声称完成         |
| 拖动/滚轮/弹层/性能     | Windows物理拖动与性能未验证；Present计数不冒充显示器帧或性能   |

## 产品规则 → Live观察 → 实现 → 差异

| 产品规则 | Live只读观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 数值控件可访问 | AX速度slider 140、音量/声像slider存在 | 保留控件规则，只移植native port | 未操作Live拖动；Windows隐藏与归位未验证 |
| 播放/停止与录制分开 | AX播放0、Arrangement录制0 | 真实fixture play/stop与session释放 | 未修改用户Live工程，不以Mac代替WASAPI |

## 自审结果

独立 pstack-reviewer Standards 与 Spec 分开执行，随后对返修源码复审；原3项P2均关闭，未报告新的确定性阻塞。Windows运行仍待CI，不作为成功证据。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| Unix URI裸#/?和symlink/..变化 | 汇报仲裁→必修 | 协调者批准恢复原Unix解码，仅Windows标准转换 | 5 path tests + mutation；Spec复审关闭 |
| 每实例Env hook强sender保留 | 汇报仲裁→必修 | 改每Env registry、幂等注销和terminal命令 | 5 lifecycle tests；Standards复审关闭 |
| 原smoke未触发恢复/guarded close | 汇报仲裁→必修 | User32真实驱动与成功Present计数 | types/lint通过；Spec源码复审关闭，运行待Actions |
| gallery/controls.tsx 2个fixture尺寸WARN | 记录 | 原值未改；配置契约§29允许fixture viewport | scan 0 HARD |
| tracks/demo.tsx 2个fixture尺寸WARN | 记录 | 同上，仅改cursor注入 | scan |
| clip-edit/demo/index.tsx 2个fixture尺寸WARN | 记录 | 同上，仅改cursor注入 | scan |
| footer/demo.tsx 2个fixture尺寸WARN | 记录 | 同上，仅改cursor注入 | scan |
| Windows diagnostics不等价 | 汇报仲裁 | 批准明确unsupported，不伪造bool | CI显式断言 |
| Windows剪贴板NUL差异 | 汇报仲裁 | 批准修改前拒绝，Mac保持 | Rust边界与文档 |

## 错题

- 全局rustup target不代表vendor override toolchain也装了target；失败阶段要区分core、C SDK和链接。
- 原来“注册handler+局部状态测试”不能证明原生恢复/关闭闭环，必须驱动自有HWND。
- napi cleanup hook移除不等于捕获数据释放，锁定实现必须实读；不能照API名字推断。
- 标准URL解析会改变旧Unix路径语义；跨平台移植不能顺带统一历史媒体路径。
- LSP调用链盘点仍需完整tsc兜底，本轮由tsc发现五个旧cursor调用方。

## 已验证做法

- 追加隔离补丁并验证完整源身份，不改共享vendor或旧补丁。
- 真实后端离屏像素与行为优先，后台窗口只证启动；拿到结果立即关闭。
- 用真实源文件的轻量纯Rust harness验证协议/registry，不重建整库，也不造替代实现。
- 源码复审、运行证据、物理桌面能力分别报告；Windows CI未运行就明确写未验证。

## 来源

- [gpuix固定SHA Windows CI](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/.github/workflows/ci.yml)
- [gpuix Windows Bun编译示例](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/examples/compile-chat.ts)
- [gpuix打包指南](https://github.com/remorses/gpuix/blob/main/website/src/guides/hermes.mdx)，Context7 /remorses/gpuix。
- [cargo-packager NSIS实现](https://github.com/crabnebula-dev/cargo-packager/blob/cargo-packager-v0.11.8/crates/packager/src/package/nsis/mod.rs)，Context7 /crabnebula-dev/cargo-packager。
- [Zed Windows平台](https://github.com/zed-industries/zed/blob/main/crates/gpui_windows/src/platform.rs)
- [ShowCursor计数契约](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showcursor)
