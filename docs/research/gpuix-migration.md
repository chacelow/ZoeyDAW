# zoeydaw 迁移到 gpuix 的替代方案与决策

调研日期：2026-10-14。用户选择 `gpuix`，本轮只做替代方案调研。允许考虑最新主干、预发布和社区源码，不以成熟度作为否决条件。

历史范围：本文保留迁移前的选型判断，不是当前功能状态。旧 Web/Tauri 实现及共享 packages 已删除；当前原生职责与实际能力以 [gpuix 架构](../architecture/gpuix.md)、[工程 adapter](../../apps/gpuix/src/project/adapters/README.md) 为准。

## 结论

普通控件、图标、样式和部分动画有可复用方案，不需要把整个组件库从零手写。

用户已澄清一个关键点：当前 Web 版用 Canvas 2D 画时间线，是为了解决 React DOM 卡顿，不是产品必须保留 Canvas API。gpuix 官方自带的时间线示例证明，密集 Clip 场景可以用原生 `<div>` 加可见范围裁剪实现，3259 个 Clip、26 条轨道裁剪后平移一帧仅 7.7ms（作者基准，非本轮实测）。因此迁移方向改为：**优先用原生元素加裁剪重建轨道和 Clip，只为真正的连续曲线数据（waveform、automation、fade）单独评估小型绘图扩展**，不再把“让 gpuix 支持完整 Canvas2D”当作前置条件。

完整迁移剩下的主要风险是无限相对拖拽光标、复杂变换与 shader 效果、以及桌面关闭和托盘生命周期。它们没有因找到新库就自动闭合。

推荐方向是固定一个明确的 gpuix 源码提交，优先复用官方原生控件，按需引入社区原生控件源码，保留现有业务状态、编辑事务和度量数据。

这是一份选型建议，不是已实现接口或已通过运行验收的迁移。

## Workspace 与证据归属

- Orca Workspace：`GPUix Migration Research`。
- 目录：`/Users/caishilong/orca/workspaces/zoeydaw/gpuix-migration`。
- 分支：`gpuix-migration`，起始提交 `519d1c46849f7efb45963f9a910b86e6b8bea568`。
- 原目录 `/Volumes/PSSD/code/zoeydaw` 始终只读。创建时观察到的未提交变更没有移动、提交或复制。调研读取原目录当前源码，正式实现前必须重新选择包含哪些未提交工作的代码基线。
- 本轮不安装 npm 包，不更改产品源码、manifest、锁文件、原生配置或工作流，不启动原应用，不提交、推送或部署。

详细证据分为三份：

- [控件、图标、表单、样式和依赖矩阵](gpuix-controls-ecosystem.md)。
- [动画、Canvas、shader、手势与绘图矩阵](gpuix-rendering-alternatives.md)。
- [Web 预览、桌面能力与工具链](gpuix-platform-toolchain.md)。

## 最新来源与真实可用性

| 候选 | 本轮观测版本或提交 | 可以解决什么 | 决策与限制 |
| --- | --- | --- | --- |
| `remorses/gpuix` | npm React/native `0.10.0`；主干 `6a5c7c142ac32f9eb0caefe0121be995cfc18631`，2026-10-11 | 原生 host、输入、Select、Combobox、Tooltip、tween、AnimatePresence、browser WASM | 官方优先。Button、Dialog、统一 dismiss 和 createPortal 等需要区分主干与发布包；不要混用类型和二进制 |
| `wdcodecn/gpuix-base-ui` | 源码 `0.1.0`，SHA `4f8cc44e2ddf20980f820107273961849f7ead7f`，2026-09-18 | Base UI anatomy 风格的原生菜单、子菜单、popover、checkbox/radio 等 | 优先评估当前 DAW 真正使用的部分。manifest 固定 gpuix 0.9.0 与 React 19.3.0，不能直接承诺对目标版本兼容 |
| `drewnekota/gpuix-ui` | 源码 `0.1.0`，SHA `33527c33b1c6f9823374eef6edd3912d5ab7a5bf`，2026-09-07 | 原生 Command/Popover 等；`sx`、`sv`、ThemeProvider | 样式层尤其贴合“不堆样式文件”的要求。peer 为 gpuix `^0.7.0`，不包含 0.10；按需接源码和审计，不全量替换现有 UI |
| `lucide-static` | `1.57.0`，2026-10-14 | 继续使用 Lucide SVG 资产 | 换 renderer wrapper，不换图标设计；不要把所有图标打入包 |
| `@phosphor-icons/core` | `2.1.1`，2024-03-29，是本轮查到的最新 core | Phosphor 对应权重的 SVG | 保留现有图标；较旧发布时间不伪装为新发布。duotone 与单色 tint 分开验收 |
| Motion | `14.2.0`，2026-10-13 | 纯数值 spring generator，可按时间采样 | 保留已有数学能力。`motion/react` 仍是 DOM renderer；自动 frame loop 不能假定在无 rAF 的 Node/Bun 前进 |
| gpuix spring PR #34 | `professorpalmer/gpuix`，`774c854794`，2026-09-29 更新，开放 | 原生 spring integrator 提案 | 可评估或选择性移植；不是已合并功能，不提供 scale/rotate，completion/presence 语义仍需验证 |
| `@react-spring/core` | `10.1.2`；`11.0.0-beta.1`，2026-10-01 | 自定义 animated host 和手动时钟接口 | 备选，仍需 gpuix host adapter，不使用 web target 冒充原生兼容 |
| `@napi-rs/canvas` | `1.0.11`，2026-10-10 | Skia Canvas2D，较易复用当前 painter 形状 | 适合评估像素桥。Node-API 包不进入浏览器，gpuix 上传仍有拷贝；未验证 Bun 与 DAW 帧率 |
| `skia-canvas` | `4.0.0`，2026-10-12 | Canvas2D 与 raw pixels，native/browser 条件入口 | 浏览器入口使用 DOM canvas，不是 GPUI 画布绑定。频繁 GPU readback 后再传 GPUI 不应宣称高性能 |
| gpuix WebGPU prototype PR #45 | `prototype/webgpu-canvas`，开放且作者要求暂不合并 | Three.js untextured cube 与 WebGPU 子集实验 | 第二个 GPU device、CPU BGRA 拷贝、无任一 OS 的零拷贝呈现；不是现成 Canvas2D 或 shader 迁移方案 |
| `longbridge/gpui-kit` 的 Rust 控件 | `v0.7.3`，2026-10-12 | resizable、dock、table、editor、chart 等 Rust 现成能力 | 窄接口 bridge 候选，不切换为 gpui-shell。必须先统一 GPUI 来源与实体类型，不引入两套不兼容 Window/Context |
| Bun | `1.4.3`，2026-10-10 | 桌面运行、浏览器 frontend HMR、compile | pnpm 仍管理 monorepo。Web Fast Refresh 与桌面 hot remount 不等价 |
| `conf` / `open` | `16.0.0`，2026-10-12 / `11.0.4`，2026-09-14 | 低频用户设置与桌面外链 | 平台候选，不让 Node 模块进入 Web bundle；不把 conf 当高频工程数据库 |

上述日期区分 npm 发布时间、GitHub release 与主干提交。详细来源与查询边界在对应专题报告，不能用 `next`、`beta` 标签名称替代版本比较。用户接受新方案，但没有要求顺带升级所有仍可用的 headless 依赖。

### 404 已按用户要求重新核实

两个社区仓库的 GitHub 源码均可正常获取。早先 GitHub 超时和 DNS 失败属于网络访问问题。

在随后的复测中，文件 reader 与独立 curl 请求均从 `registry.npmjs.org` 得到实际 `HTTP 404` 和 `{"error":"Not found"}`，包名分别为 `gpuix-base-ui`、`@gpuix-ui/core`、`@gpuix-ui/primitives`、`@gpuix-ui/react`。这只证明这些名字在当次公开查询不可取得，不证明它们从未发布、没有私有版本或不能从 Git 接入。

`gpuix-ui` 这个不带 scope 的 npm 名另有候选，不能与 drewnekota 的 `@gpuix-ui/*` 自动视为同一来源。任何安装建议先核对 manifest、repository 和发行内容。

## 不堆积 CSS 文件的样式路线

已有社区源码提供比自行设计工具更直接的参考：

- `sx(base, condition && variant, override)` 合并样式对象，接近现有 `cn()` 的调用位置。
- `sv({ base, variants, defaultVariants, compoundVariants })` 返回 style 对象，接近现有 CVA 的语义。
- `ThemeProvider` 和 `useVariants(factory)` 提供随主题变化的 token/variant。

来源：[style.ts](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/core/src/style.ts)、[variants.ts](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/core/src/variants.ts)、[theme.tsx](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/core/src/theme.tsx)。

按 Laziness Protocol，优先复用这类小型、可审计的源码，而不是新造 Tailwind parser。`mergeStyle` 当前只对 hover/active 做一层嵌套合并，focus-visible 等状态还需核查。采用社区默认字体、间距或颜色会改变现有 UI，因此必须注入项目 token，继续以 `controls/metrics/control-metrics.json` 为控件与 Canvas 命中几何的同一尺寸来源。

页面默认不建独立样式文件。共享外观进入已有控件 variant，小型局部布局留在 TSX 的命名对象，只有确实影响阅读时才按职责拆分。样式仍有定义，只是不用 CSS 变量和 class 字符串充当原生执行层。

## 必须先关闭的功能缺口

| 路径 | 当前最合理方向 | 不接受的假完成 |
| --- | --- | --- |
| Settings 与嵌套弹层 | 官方主干 Dialog + 已发布 Select/Tooltip，社区 menu/Popover 补足 | 简化设置页面、丢主题语言切换、弹层无法键盘操作 |
| 主分栏与固定底部区域 | Rust resizable 窄 bridge 或经过验证的 GPUIX resize module | 改成固定尺寸；展开 Clip 挤掉 Device；收起后不能恢复原尺寸 |
| DragPad 与 MiniMap | 保留 TS gesture owner，补相对输入、隐藏、restore、cancel 的平台绑定 | 只支持有限绝对拖动；松手跳光标；失焦留下隐藏光标；事务重复提交 |
| 时间线绘图 | 轨道、Clip、Minimap 优先用原生 `<div>` 加可见范围裁剪（官方示例已验证此路径）；只为 waveform/automation/fade 等连续曲线数据单独评估小型绘图扩展 | 不经验证就假设必须新建 Canvas2D/绘图协议；也不假设“用了 GPU 就自动不卡” |
| 动画 | 原生 tween 优先，必要的 spring 用已有 sampler 或审计过的原生 PR | 把 spring 静默换成 ease；把 x/scale/rotate 全当 left/width |
| 金属 shader | 移植 shader 与同设备纹理合成，并有 browser 对等后端 | 将当前静态 Button fallback 当成 metal-fx 等价实现 |
| 关闭与托盘 | expose GPUI 关闭拦截/显隐，托盘候选只负责菜单事件 | 直接退出进程替代询问；关闭后无法恢复；依赖另一个桌面框架接管窗口 |
| 可编辑代码与复杂图表库存 | 审计真实页面与画廊消费者后选择 Rust bridge 或其他明确实现 | `<code>` 只读展示当成 Ace 编辑器；普通 textarea 冒充补全/snippet；删掉原可见功能 |

完整迁移范围不能只凭依赖表推断。正式实施前要列出实际页面、应用内组件画廊与 Storybook 库存中哪些属于必须保留的产品功能。优先迁移 DAW 不等于自动授权删除其余现有功能。

## 实施路线与门槛

以下是实施顺序建议。本轮没有开始其中任何产品代码变更。

1. **确定代码和 renderer 基线。** 核对原目录的新变更，用户决定实现基线。锁定 adapter、native、WASM 与 GPUI pin；若使用主干能力，建立明确源码构建路线，不混用 0.10 二进制。
2. **验证一条完整难路径，原生元素优先。** 同一个轨道控制列、可拖动及缩放 Clip，先用原生 `<div>` 加可见范围裁剪实现，在真实轨道/Clip 规模下测帧时间，直接对比当前 Web Canvas 版本的卡顿场景。waveform、automation/fade、popup 内 DragPad、spring 指示器分别在桌面与 Web 验收。只有原生元素路径证明不够快，才引入自定义绘图扩展。
3. **迁移共享控件与平台边界。** 保留 metrics、主题、语言、设置和图标，迁移官方与精选社区源码。UI 包公共接口、新依赖、原生配置和工作流按项目约定先确认。
4. **迁移产品所有权而非复制状态。** project model/store/runtime 保持唯一工程 owner，绘图只消费只读 scene。浏览器与桌面平台实现不同，但不建立两份可写工程。
5. **完成所有真实消费者后清理旧路径。** 迁移页面、画廊与行为测试，再移除 obsolete React DOM/Tauri/CSS 路径。当前无真实音频引擎，不能把本轮迁移扩展为插件 host、录音或工程文件系统实现。
6. **验证实际产物。** 包含中文 IME、快捷键、焦点归还、关闭/托盘、DPR、resize、主题、窗口外 release、多显示器、Web HMR、安装包资源。只报告实际运行结果。提交、远程发布或合并仍需独立授权。

按 Experience First，选型的判断标准是能否保留当前交互并加快 UI 修改，而不是库的星数或“用了 GPU”。普通界面有新源码可复用；绘图、指针和 shader 的完整闭合仍可能要求我们维护 gpuix 扩展。

## 验证与研究边界

已执行 GitHub API 与 npm registry 查询、官方包 tarball 声明检查、Context7 文档交叉核对，以及已登录 Ego 的公开 X 页面阅读。没有安装依赖，没有执行第三方候选代码，没有编译 gpuix，没有启动用户应用或进行 DAW 性能测量。

平台报告已记录 GPUix 作者的 WASM/Solid 公告与 Jamon Holmgren 的有限桌面体验帖。社交内容作为发现入口；兼容性结论仍回到源码与发行内容。各专题报告记录完整来源、精确版本与后续必须运行的场景。

## Ego 与 X 搜索带来的新增候选

两位原研究 Agent 在同一个已登录 Ego TaskSpace 中使用不同 Page 完成公开 X 搜索，随后跟随帖子链接核对仓库。精确查询、原帖作者、UTC 日期、源码与未验证项保存在两份专题报告中。以下只列对决策有新增价值的结果。

| 新线索 | 实查状态与来源 | 对本项目的价值和限制 |
| --- | --- | --- |
| `oppi.li/gpui-canvas` | [2026-10-10 作者帖](https://x.com/oppili/status/2108818783066337461)；[源码](https://tangled.org/oppi.li/gpui-canvas/) main `3f9335d43edf7bab58ade08238793f64a16683c9`，Cargo `0.1.0`、`publish=false` | 可借鉴无限画布的 camera、平移、缩放、snapping 与 item 布局。它依赖 `gpui-unofficial 1.23.2`，不是 Canvas2D/path 命令 API，也没有现成 gpuix JS bridge。不能因名字含 canvas 就视为 waveform 和 fade 绘图已解决 |
| `chrx3/gpui-m3` | [作者帖](https://x.com/Chrsx33/status/2108971528889024607)；[v0.1.0](https://github.com/chrx3/gpui-m3/releases/tag/v0.1.0)，2026-10-10 | 有 Rust 原生 Spring、value/velocity 连续重定向和 request-animation-frame。依赖 crates.io `gpui 0.2.2`，仍需统一来源和 TS/WASM 绑定；README 也有节点 scale 与 clip 限制，不是完整 Motion 替代 |
| `ktiays/Respring` | [Cyandev 原帖](https://x.com/unixzii/status/1948782201359008072)；[算法源码](https://github.com/ktiays/Respring)，Cargo `0.1.1` | 纯 Rust spring 算法可作原生实现参考。帖子来自 2025，作者当时说 GPUI 扩展稍后开源；没有据此认定扩展现已发布，也不为已有 Motion sampler 再增加一个引擎 |
| Motion `14.2.0` 的 `motion/vgpu` | [固定发行 revision 源码](https://github.com/motiondivision/motion/blob/790a654dfef305307c566cf4e94d67a9f7a403c8/packages/motion/src/vgpu.ts) | 新入口通过 `createEffect` 合并 MotionValue，并每帧调用 vgpu 对象的 `set`。可参考批量 updater，但不是 GPUI texture/canvas host，也未解决无 rAF 的 Node/Bun 时钟。它支持 vgpu transform 不代表 GPUIX 节点支持同样属性 |

Vello、Solid/Rust、WGSL 与 browser Pointer Lock 的作者讨论也已读到。若原帖没有可定位源码或版本，就只记录技术方向，不把作者演示、浏览量或性能形容词当成我们的兼容性和帧率证明。此次浏览器搜索增加了可审计的 Rust 参考实现，但没有发现可直接安装、同时闭合绘图与相对光标恢复的 gpuix 完整 bridge。
