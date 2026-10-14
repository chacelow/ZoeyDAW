# gpuix 渲染、动画与拖拽替代方案

调研日期：2026-10-14。目标固定为 `remorses/gpuix`，不改为 gpui-shell。本文只研究渲染与交互底层，控件清单和打包方案由其他报告负责。

## 用户纠偏：Canvas 不是需求，是 Web 卡顿的权宜解法

用户明确说明：当前产品用 Canvas 2D 画时间线，原因是 Web 版本太卡，不是产品必须保留 Canvas API。这改变了本报告的默认方向。下文的绘图缺口分析仍然成立，但不再把“让 gpuix 支持等价 Canvas2D”当作首选目标。

gpuix 官方自带的时间线示例正好处理同类场景：拖动 Clip、边缘裁剪吸附、播放头拖动、框选、缩放、双轴平移、冻结表头与轨道列，全部用 **`<div>` 原生 host 元素**，不是 Canvas。官方测量在 3259 个 Clip、26 条轨道下，裁剪不可见内容后平移一帧 **7.7ms**；只做 React `memo` 不裁剪则 **92ms**。这是作者给出的基准，不是本项目实测，但证明 gpuix 的卡顿根因不是“DOM 节点太多”，而是“没有裁剪不可见图元”。[官方裁剪说明](https://github.com/remorses/gpuix#pannable-surfaces-must-cull)、[示例源码](https://github.com/remorses/gpuix/blob/main/examples/timeline.tsx)

现有 Web 版的卡顿，更可能来自 React DOM 布局、重排与大量独立 Canvas 2D `drawImage`/路径调用的组合，而不是“非用 Canvas 不可”。迁移到 gpuix 后，**应优先尝试原生 host 元素加虚拟化裁剪**作为时间线、轨道、clip 外观的首选实现，而不是先假设必须新建一套批量绘图协议。

## 结论

`@gpuix/react@0.10.0` 和当前 main 都没有 Canvas 2D API，也不需要有。原生 host 元素加裁剪已在官方示例证明可承载密集 Clip 场景；真正的缺口是连续曲线数据（waveform、automation、fade）、复杂变换与无限相对拖拽，不是整条时间线都要绘图协议。

建议优先把轨道、Clip 外观、Minimap 矩形改写为原生 host 元素加可见范围裁剪，复用现有 scene/viewport 投影计算可见集合；只为真正连续的曲线数据单独评估小型自定义绘图 host，而不是把整个时间线都搬进一套绘图协议。动画先复用 gpuix 原生 tween 与现有 Motion 的纯数值 spring generator，不把 `motion/react` 的 DOM renderer 搬过去。`@react-spring/core` 可作为需要完整自定义 animated host 时的备选，但没有现成 gpuix adapter。

需要先证明的能力：

- 原生 host 元素加裁剪能否承载 Clip、轨道、Minimap 矩形、track meter 背景在真实交互下的帧时间，覆盖拖拽、缩放、滚动与多选并发。
- 真正连续曲线数据（waveform、automation 折线、fade 的三次 Bézier）仍需要独立的小型绘图能力评估，不要求整条时间线都走同一协议。
- 捕获期间的窗口外 release、失焦取消、相对鼠标移动、全局隐藏和原位恢复。
- 自定义绘图在同一 React UI 的 native 与 browser Wasm 后端工作，而不是另开一个 DOM overlay。
- 液态金属 shader 的 native 接入。不能以现有静态 Button fallback 当作效果迁移完成。

本轮没有安装依赖、启动应用、执行候选库、运行 build、lint、test 或 benchmark。下文的“已证明 API”指发布包声明、实现源码或一手文档；不代表本机运行验收。作者测试数字和本轮证据分开标注。

## 现有产品契约

读取的是 `/Volumes/PSSD/code/zoeydaw` 当前源文件，严格只读。研究 worktree 的基线为 `519d1c46849f7efb45963f9a910b86e6b8bea568`；原目录存在其他会话修改，因此不能把下列观察冒充为该提交的精确内容。

| 当前路径与已读位置 | 消费者可见契约 | 迁移时不能丢失的行为 |
| --- | --- | --- |
| `packages/ui/src/motionTabs.tsx:48-83,122-153` | DOM ref 的 `offsetWidth/offsetLeft`、`ResizeObserver`；活动指示器 `width/x`；spring `stiffness:500,damping:30` | 测量后移动且中途重定向连续；hover 指示器 opacity；`x` 是 transform，不等价于所有布局中的 `left` |
| `packages/ui/src/DragPreviewArea/index.tsx:34-73,97-175` | `useMotionValue` 跟随指针、不通过每次 React render；`createPortal(document.body)`；`AnimatePresence` 保留退出节点 | 拖动阈值、source 命中与子控件排除、禁止落点预览、回原点退出、scale/opacity、reduced motion、Escape/blur/pointercancel 与抑制尾随 click |
| `packages/ui/src/controls/DragPad/useDragValue.ts:114-257,292-375` | 阈值后隐藏光标；pointer lock 或 native recenter；Shift 精调；释放时 restore 后两帧 reveal | pointerId 与捕获；`movementY`；屏幕边缘不中断；结束和取消不同事务；卸载清理；restore 异步期间不提前显示 |
| `packages/ui/src/metallic-button.tsx:12-53` | `metal-fx` WebGL 包裹共享 Button；`chromatic`、strength 0.7、theme、scale、paused | 金属动画与文字、圆角和按钮 hit box 合成；现有 WebGL 不存在时的静态退化不能替代完整效果 |
| `apps/web/src/pages/project/sections/ArrangementPanel/Timeline/useCanvasPainters.ts:17-147` | scene 与 playhead 两个 Canvas；同一尺寸和 DPR，独立 invalidation；resize 当次绘制；CSS token/theme 观察 | 不能每个播放帧重建静态轨道图；不能丢 DPR、resize 清屏时序、theme 更新和订阅清理 |
| `.../canvas/painters/clip-previews.ts:52-86` | 使用 `AudioClip.waveformPeaks`，仅可见 x 列绘制一条竖线 | 保留 visible range 裁剪、峰值索引与 clip 颜色；当前是预计算 peaks，不要求 gpuix 解码音频 |
| `.../canvas/painters/automation.ts:25-131` | 行 clip、4 px 采样的 segment polyline、圆形控制点、选择状态 | 同一 geometry 同时驱动 paint 和 hit test；保留曲线与采样语义，不另建一份工程状态 |
| `.../canvas/painters/clip-fades.ts:14-61` | cubic Bézier mask、fill、stroke、端点和曲线手柄 | 自动化采样线与 fade Bézier 是不同绘制需求；必须支持 path fill 和 cubic 曲线 |
| `.../canvas/painters/clip.ts:46-81` 与 `.../canvas/painters/grid.ts:45-87` | 嵌套 save/restore、矩形 clip、文字 baseline、DPR transform、选区 alpha | 纯矩形控件不足以覆盖轨道画布；文字布局与像素对齐也属于替代契约 |
| `.../MiniMap/OverviewCanvas/index.tsx:24-85` | project tracks/markers 投影，DPR 对齐的矩形与 marker 线 | 可低频刷新，不应因播放时钟而全量刷新 |
| `.../canvas/TrackMeter.tsx:34-118` 与 `.../canvas/painters/meter.ts:51-123` | telemetry revision 驱动，峰值保持/衰减有时钟，三段 stop 的渐变，独立 painter | 当前 telemetry 是原型数据；迁移绘图不等于接通音频引擎；峰值衰减期间即使 revision 不变仍需刷新 |
| `.../canvas/scene.ts:13-78` | `ArrangementScene` 具有 viewport、revision、只读工程投影与交互预览 | SceneStore 继续是唯一绘制输入 owner；不得让 Rust painter、React 和撤销各持有可写工程副本 |

上表省略号均以 `apps/web/src/pages/project/sections/ArrangementPanel` 为前缀。源文件可从[只读产品目录](file:///Volumes/PSSD/code/zoeydaw/)核对。

## gpuix 版本与源码边界

| 对象 | 本轮核实版本、时间 | 渲染相关含义 |
| --- | --- | --- |
| `@gpuix/react` 与 `@gpuix/native` | npm latest 均为 `0.10.0`，发布于 2026-09-23；GitHub React release 页面时间是 2026-09-21 | 两种时间来自不同系统，不能混为 npm 发布时间；发布包不包含所有 main 改动 [V1][V2][G1] |
| gpuix main | `6a5c7c142ac32f9eb0caefe0121be995cfc18631`；仓库 pushed_at 2026-10-11 | 本文源码链接尽量固定该 SHA；Cargo 包版本仍为 0.10.0，不代表 main 等于发布包 [G0][G2] |
| gpuix 所用 GPUI | submodule `remorses/zed`，`gpuix` 分支，gitlink `c2e9f882030ca95cee55d206512a0a3ee6cd72b0` | 上游 `docs.rs/gpui/latest` 的能力不能直接等同这个 pin，更不能等同 TS 可调用能力 [G6][G7] |
| browser renderer | 已合并的 #18，native 使用 napi-rs，browser 使用 wasm-bindgen | browser preview 是 GPUI WebGPU/WebGL2 输出，不是 React DOM；没有 HTML Canvas2D、HTMLButtonElement 或 CSS transform 的自动兼容层 [G8] |

已读取协调者提供的官方 npm tarball：`/tmp/zoeydaw-gpuix-react-0.10.0.tgz` 与 `/tmp/zoeydaw-gpuix-native-0.10.0.tgz`。发布包 `host.d.ts` 只有 tween transition；`index.d.ts` 的 `setImagePixels(elementId,width,height,pixels:Buffer)` 仅有 RGBA。main 新增的 `format` 参数支持 BGRA，但仍有 `pixels.to_vec()` 拷贝。[G2][G3][G9]

### 已实现与未实现的能力矩阵

“扩展”表示要改 gpuix 的 native/browser host，不是应用层有现成库即可解决。

| 高风险路径 | 发布 0.10.0 / 当前 main | 可用的具体闭合方式 | 明确缺口与验收 |
| --- | --- | --- | --- |
| 任意多色 path、曲线绘图 | JSX 有 `canvas` 类型，但 main 没有 canvas factory 或 JS painter；#8、#82 仍开放 [G4][G10][G11] | 在现有 Rust `CustomElement` registry 加绘图 element，以 `gpui::canvas` 和 `Window::paint_path` 画批量命令；browser 一起编译 [G5][G7] | 只为真正需要任意路径的内容（曲线、渐变）扩展，不是时间线整体默认方案。需要扩展、类型、FFI 和图层生命周期；先验证 clip、path、DPR、resize、文字 |
| waveform | 没有 JS path API；已有 `<img>` 的 binary pixels 更新 [G9] | **优先**：可见范围内用一批 host `<div>` 竖线表示峰值，复用 Clip 裁剪与缩放投影，不要求像素级曲线。仅当密度需求超出 host 元素承载时，才降级到 native Canvas 输出 RGBA 调用 `setImagePixels` | host div 方案需验证高密度下的帧时间；像素桥方案有栅格、JS buffer、N-API 拷贝和 GPU upload 成本，不可称零拷贝或承诺帧率 |
| grid、clip、Minimap | rect 可以用 host div；官方 timeline 示例已用 `<div>` 承载密集 Clip 场景，裁剪不可见内容后 3259 clip/26 轨平移一帧 7.7ms（作者基准）[G17] | **优先方案**：轨道、Clip 外观、Minimap 矩形直接用原生 host 元素，复用现有 viewport 投影计算可见范围做裁剪，不逐帧重建整个轨道 DOM 树 | 需要在真实 DAW 规模下复测裁剪后的帧时间，不能直接套用作者基准数字；Minimap 可继续低频更新 |
| automation、fade | 单色 SVG raw source 可以画图标；不提供 Canvas command API [G3][G12] | polyline、arc/circle、cubic Bézier、fill/stroke、矩形 clip 的批量绘图命令 | `<svg>` 以 `style.color` tint，是单色图像；不能用一个 SVG 无损代替多色轨道画布。字符串更新还有解析与栅格化成本 |
| meters、playhead | 原生 tween 不认识 telemetry；没有动态 path host | meter 使用批量 quad/gradient，保留 peak-decay 时间；playhead 保留独立图层 | gpuix gradient 类型仅两个 stop，而现 meter 有三个 stop；需要分段或绘图端支持更多 stop [G3] |
| duration/ease tween | `motion.div` 支持数值 width/height/opacity/四边/borderRadius、duration/delay/ease [G2][G3] | 可原样复用适配后的属性；运动发生在 native renderer，React 不逐帧 commit | 没有 keyframe arrays、repeat、stagger、`x/y` 或 transform；`transition` 只有该子集 |
| spring、tabs | main 没有 spring transition；#34 开放 [G13] | 首选复用 Motion `spring({keyframes:[a,b],stiffness,damping}).next(ms)`，统一时钟驱动适配后的数值；可评估 #34 | tabs 的 `x` 需要明确定义为绘图 transform 或布局 `left`；后者会参与布局，不能静默替换 |
| `AnimatePresence` | 已发布；main 有 `usePresence()`、`useIsPresent()` 和按 generation 的 motion completion [G14][G15] | 保留 keyed 子节点，完整退出后 `safeToRemove`；raw-value driver 可调用这个 hook | 不是 Motion 全 API；props 不含 mode、layout、variants。当前 DragPreview 的 nested exit transition 与 scale 不能直接输入 |
| `useMotionValue`、pan、drag preview | gpuix 不导出 `useMotionValue`、`onPan*`、`HTMLMotionProps` [G15] | 共享 gesture model；gpuix 事件适配 `onMouseDown/Move/Up`；main 的 gpuix `createPortal` 或 overlay host | 需要重建 source lookup 与显式几何，不依赖 `Element.closest/getBoundingClientRect`；还需主窗口失焦和 Escape 路由 |
| transforms 与 keyframes | `StyleDesc` 没有 CSS transform、scale、rotate [G3] | path 局部 transform 可由自定义 painter 执行；host subtree transform 需要 renderer 扩展 | 即使 raw engine 能产出 scale/rotate，现有 gpuix 节点也不能消费它们；图片缩放不等于 subtree transform |
| metal-fx shader | metal-fx 依赖 HTMLCanvas/WebGL/DOM 测量 [S1][S2]；gpuix main 无 shader/texture import API | 原效果要移植 shader 并增加 gpuix native/browser shader host；不是 `metal-fx` 原包直接运行 | 没有同设备 texture bridge。允许静态替代需产品明确批准，不能把已有 fallback 当作等价迁移 |
| 元素内拖拽捕获 | main 在同一 div 同时监听 mouseDown、mouseMove 时执行 `capture_pointer()` [G2] | 保持两个事件 handler 都存在，通过 `EventPayload.x/y/pressedButton` 适配 | 没有 JS `set/releasePointerCapture`、pointerId、lostpointercapture；捕获与 DOM capture 语义不可画等号 |
| 无限相对移动、隐藏、原位恢复 | 声明中没有 movementX/Y、cursor:none、hide/warp/restore cursor、pointer lock；仅绝对 x/y 与 cursor keywords [G3][G16] | 平台 adapter 增加明确的 relative-drag session，原生实现 hide、relative input/recenter、restore；browser 另用 Pointer Lock | 是阻塞项。浏览器外部 DOM 指针能力不会自动跨到 GPUI Wasm canvas；Linux Wayland 也不能假定任意 warp |
| release/cancel、越界/失焦 | 有 mouseUp、元素 onBlur、键盘 Escape；没有 window-deactivation/capture-loss 取消事件的公开契约 [G3][G16] | native session owner 发出 `end` 或 `cancel`；任何退出路径最终释放捕获、恢复位置并显示光标 | 需真实验证屏幕边缘、窗口外 release、Cmd-Tab、窗口关闭、卸载、Escape；元素 blur 不等于窗口失焦 |

## GitHub 分支、fork 与现成绘图候选

读取了 gpuix 所有可见分支、最近 100 个 issues/PR、最多 100 个 forks，以及名称含 gpuix canvas/drawing/animation/path 的 repository 搜索。没有找到可直接安装到 gpuix 的通用 path/Canvas2D renderer。这个结论仅覆盖本轮可见搜索结果，不声称 GitHub 全站不存在。[D0]

| 候选与状态 | 版本或 SHA、活跃时间 | 已证明 API 与运行时 | FFI、维护成本与判断 |
| --- | --- | --- | --- |
| gpuix `prototype/webgpu-canvas`，开放 PR #45 | `6a5500eaf321e0c64b887526a5bcc40516684b4f`，PR 最近更新 2026-09-21，未发布 [D1][D2] | `@gpuix/react/webgpu` 提供 `GPU` facade、canvas `getContext('webgpu')` 与 `<canvas source>`；作者让 Three.js untextured cube 工作 | 第二个 wgpu device，BGRA snapshot 经 `paint_image` 进入 GPUI atlas；所有 OS 均无 zero-copy，作者明确要求暂不合并。缺 MSAA、writeTexture、cube maps、stencil 等。不是 Canvas2D，不优先采用 |
| `monotykamary/gpuix` 与 `monotykamary/zed` 动态图像参考 | `reference/native-terminal-surface` tip `d2cf715a36`；issue #42 2026-09-01；#40 开放 [D3][D4] | issue 提出 `supportsNativeTerminal()`、`setTerminalFrame(elementId,metadata,cells)`，latest-frame mailbox 与一 retained node；GPUI atlas update 参考覆盖 Metal/WGPU/DirectX | 它是特化 terminal，不是通用绘图 API。可借用二进制 mailbox、same-size texture identity 和缓存呈现设计，但需要改 gpuix 与 Zed pin。作者只实测 Metal，其他平台没有运行证明 |
| `professorpalmer/gpuix` spring PR #34 | `feat/motion-springs` `774c854794`，2026-09-29 更新，未发布 [G13][D5] | transition union 增加 `{type:'spring',stiffness,damping,mass,velocity,delay}`；native integrator 与 JS frame lease | 仍无 scale/rotate；作者说明 React spring 路径由 JS 驱动且不发 native `onMotionComplete`，presence 依赖 spring rest。最新作者验证是 Windows TS/8 个 JS 测试，未跑 Rust/native。不要直接视为最新 main 可用功能 |
| `@napi-rs/canvas`，`Brooooooklyn/canvas` | `1.0.11`，2026-10-10 发布，main pushed 2026-10-14 [V3][C1] | Node-API Skia；`createCanvas(w,h).getContext('2d')`，path、arc、cubic Bézier、clip、文字、gradient；`getImageData(...).data` 是 `Uint8ClampedArray`，Canvas 有 `data():Buffer` [C1][C2] | Node 支持有一手文档。Bun 依赖 Node-API 兼容，本文未找到并执行该版本 Bun acceptance，标为待验。没有 browser export，也没有 gpuix texture handle；浏览器用原生 Canvas 或 GPUI Wasm 绘图后端，不能直接加载 `.node` |
| `skia-canvas`，`samizdatco/skia-canvas` | `4.0.0`，2026-10-12 发布；`next` 是较早 `4.0.0-rc9.3`，不应因 dist-tag 名称选旧 RC [V4][C3] | Node >=18；`new Canvas(w,h,{gpu:false})`、`getContext('2d')`、`await canvas.raw`；包有 node/browser conditional exports，browser.js 构造真正 DOM canvas [C3][C4][C5] | native GPU 输出再读 raw 会产生 GPU→CPU，再上传 GPUI；作者文档建议频繁读取 bitmap 时关闭 GPU。browser 分支是 DOM shim，不是 gpuix Wasm 内 canvas。Bun binary loading 和完整绘制需要独立验收 |
| CanvasKit，Google Skia | npm `canvaskit-wasm@0.42.0`，2026-08-18 [V5][C6] | 官方展示 WebAssembly Skia canvas/path/paint/text、custom shaders、WebGL SkSurface | 可做 browser 绘图，也可研究软件 raster buffer；不能由“Wasm 能运行”推导 Node/Bun 有 GPU context。与 gpuix 同设备 texture 互操作无现成 bridge，不作为本次默认方向 |
| React Native Skia | `@shopify/react-native-skia@2.14.0`，2026-10-01 [V6] | npm repository 是 `Shopify/react-native-skia` | React Native host/JSI 不是 Node-API host。Web 支持也不提供 gpuix 原生窗口集成。本轮不将 RN compatibility 计为 Node/Bun 能力 |
| `metal-fx`，`Jakubantalik/metal-fx` | `2.0.11`，2026-09-22 发布，main pushed 2026-09-21 [V7][S1] | React DOM wrapper，engine 创建 WebGL canvas；shader 是 GLSL，组件用 refs、ResizeObserver、rAF、matchMedia [S1][S2][S3] | 可继续服务独立 React DOM 预览，但不能在 gpuix JSX 中运行。原生效果必须移植并新增 shader host，不是替换为另一个 React WebGL 库就完成 |

其他活跃 fork 已查看分支列表，包括 `fdarian/gpuix` 的 `poc`、`Zfinix/gpuix` 的 `eleven` 和 `PhotonBrowser/gpuix`。它们也携带上游 WebGPU prototype 分支，但分支名字或更新时间不能证明 custom drawing 已完成。本轮没有把它们计为可用解决方案。gpui-shell 可以提供 path/paint 或输入设计的参考，不能作为 gpuix 的 drop-in 依赖；本文不建议替换用户已选技术。

### 像素桥能保留 Canvas 代码，但不能消除传输

目前唯一已发布、无需新增 gpuix 绘图协议的通用出口是 `<img>` 的 `setImagePixels`。最保守的 Canvas2D 适配形状如下，属于候选设计，不是已运行代码：

```ts
// native-only Canvas2D backend。浏览器不能 import 此 Node-API 包。
const canvas = createCanvas(width, height)
const ctx = canvas.getContext('2d')
paintScene(ctx, scene, tokens)
const image = ctx.getImageData(0, 0, width, height)
const bytes = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength)
imgRef.setImagePixels(width, height, bytes)
```

`Buffer.from(ArrayBuffer,offset,length)` 本身可以共享 JS 内存视图，但 gpuix main 的 N-API 实现随后 `pixels.to_vec()`。RGBA 还会逐像素换 R/B，创建新 `RenderImage`、替换旧图像并 `drop_image`。main 的 BGRA 参数只省去 swizzle，不消除 JS→Rust 拷贝或上传。[G2][G9]

不建议每帧 PNG encode 再 `setImage`，这增加编码与解码。Canvas2D 后端即便使用自己的 GPU，也没有取得 GPUI 同设备纹理的绑定；跨两个 GPU renderer 最终仍会 readback/upload。

像素桥适合验证视觉保真、低频 Minimap 和缓存 waveform tile。是否足以承载全屏高 DPR timeline、多个 meters、播放与拖拽并发，必须测量后决定。不要用作者的 PNG benchmark 推算 DAW 帧率。

## 非 DOM 动画引擎

| 候选 | 最新发布与活跃状态 | 可证明的非 DOM 形状 | Node、Bun、browser 与 gpuix 判断 |
| --- | --- | --- | --- |
| 已有 Motion raw generator | `motion@14.2.0`，2026-10-13；main pushed 2026-10-14 [V8] | `spring({keyframes:[0,100],stiffness,damping,mass,velocity}).next(elapsedMs)` → `{value,done}`；官方允许任意时刻采样 [A1][A2] | generator 不需要 DOM 或 rAF，最小接入，可由 Node/Bun `performance.now` 或 renderer clock 调用；浏览器同一采样逻辑。没有验证此版在三个 runtime 的 import 和打包，需后续 smoke。优先复用它，不引入另一个 spring 数学实现 |
| `@react-spring/core` 与 `@react-spring/animated` | latest `10.1.2`，2026-06-24；beta `11.0.0-beta.1`，2026-10-01；next 分支 pushed 2026-10-13 [V9] | `SpringValue.start/set/stop/advance(dt)`；`createHost(components,{applyAnimatedValues,createAnimatedStyle,getComponentProps})`；`raf.frameLoop='demand'`、`raf.advance()` [A3][A4][A5] | 真正的 custom renderer 入口，不要求 RN。但默认 raf 在无 window 时不自动运行，Node/Bun 必须显式调度。需实现 gpuix host adapter 与统一 frame owner，不能用 `@react-spring/web` 的 DOM updater。beta 可评估，当前不存在 gpuix ready-made host |
| `@tweenjs/tween.js` | latest `25.0.0`，2024-07-26；main pushed 2026-10-06 [V10] | `new Tween(object).to(target,duration).start(t0)`，`group.add(tween)`、`group.update(time)`；chain/repeat/yoyo 与插值 [A6][A7] | 纯 object 和手动时钟，repo 有 Node ESM/CJS 示例；Node/Bun/browser 均不需要 DOM renderer，Bun import 未在本轮执行。适合多段 tween，但无物理 spring，也不提供 transform、presence 或 gpuix integration |
| Motion `animate()`/`springValue()` 原样使用 | 同 `14.2.0` | 可 animate object 和 raw value [A8] | 源码 frame loop 在没有 `requestAnimationFrame` 时使用 noop。能 import、能 SSR、能算纯值不等于在 Node/Bun 中会自动前进；不能直接以“支持任意 object”判定 native 可用 [A9] |
| Popmotion | repo 最后 pushed 2024-03-12，无 GitHub release [A10] | 可以研究纯数值 driver，但不优先选择 | 活跃度低于现有 Motion、react-spring；没有本次 gpuix adapter 证明，不新增此依赖 |
| Anime.js | latest `4.5.0`，2026-06-22；beta `5.0.0-beta.2`，2026-08-17；repo pushed 2026-08-21 [V11] | 本轮只核对版本与活跃状态，没有核实 v5 engine driver 源码 | 不计为已证明 Node/Bun 方案，避免用浏览器 object animation 宣传代替运行证据 |

raw engine 只闭合“数值如何随时间变化”。它不让 gpuix 自动获得 CSS transform、Motion gesture、DOM 测量、layout animation 或动画节点的延迟卸载。对 gpuix 节点逐帧 `setStyle` 还会过 JS→Rust mutation 边界，不应与原生 `motion.div` 一次下发后在 Rust 插值混为一谈。

## 推荐的统一绘图与动画方向

这是后续实现设计，不是本轮新增的公共 API。原则是先用原生元素加裁剪解决交互与 Web 卡顿，只为真正的连续曲线数据扩展绘图协议。

1. `ArrangementScene`、viewport、hit-test 与编辑事务留在 TS owner。绘图后端只消费只读投影，不发明第二份权威工程数据。
2. **优先用原生 host 元素实现轨道、Clip、Minimap 矩形**，仿照官方 timeline 示例：每个可见 Clip 一个 `<div>`，由 viewport 投影计算可见范围后裁剪，不渲染屏幕外内容；缩放和平移只改变哪些 Clip 进入可见集合，不逐帧重建整棵树。[G17]
3. 用这条原生路径先做一次真实 DAW 规模（现有轨道数、Clip 数、缩放范围）的交互与帧时间验证，直接对比当前 Web Canvas 版本的卡顿场景。只有这条路径证明仍不够快，才进入第 4 步的自定义绘图扩展。
4. 对于真正连续的曲线数据（waveform 峰值、automation 折线、fade 的三次 Bézier），在 gpuix `CustomElement` registry 内实现小型批量 drawing。第一组命令来自现有 painter 实际需求：path move/line/cubic、fill/stroke、clip、多 stop gradient。不要先造完整浏览器 Canvas API，也不要把它当作轨道和 Clip 外观的默认实现。
5. transport 先选择有明确版本和生命周期的批量描述，避免每个 point 一次 N-API 调用。当前 mutation 协议是 JSON；高频 peaks 或绘图数据要单独验证 typed buffer staging，不能假称 gpuix 现成支持。
6. native 和 browser Wasm 编译同一绘图逻辑。以 GPUI `canvas`、`PathBuilder`、`paint_path` 作为底层候选。Context7 验证的是上游 Rust 能力，仍须对 gpuix 的 GPUI pin 编译验证。[G5][G7]
7. 保留 scene 与 playhead 独立 invalidation。waveform geometry 以 clip 数据和 zoom 缓存，Minimap 以文档 revision 更新，meter 以 telemetry/decay 更新。上述是现有契约的迁移要求，不是无证据性能优化承诺。
8. 普通 opacity/width/edges 动画用 gpuix native tween。需要物理 spring 的地方用现有 Motion sampler，由一个可释放的时钟 owner 驱动；保留当前速度、取消与重定向语义。复杂多段动画才评估 Tween.js 或 react-spring host，避免同时维护多个 frame loop。
9. `AnimatePresence` 负责 keyed lifetime；custom driver 完成退出后调用 `safeToRemove`。任何 cancellation/unmount 都停止 driver，不能让旧回调写入新节点。
10. 指针能力单独归平台 adapter，但共用 gesture state machine。session 应明确拥有 origin、active pointer/button、相对累计值、隐藏状态、capture、restore 和 cancel reason。末端处理必须幂等，restore 后才 reveal。
11. shader 效果单独设验收门槛。若要求保持 metal-fx 液态外观，需要同设备 shader/texture 扩展和 browser 对等实现；若用户接受静态渐变替代，属于显式产品取舍。

不推荐把 native `skia-canvas` 的独立 Window 作为 gpuix 子视图，也不推荐在 GPUI Wasm canvas 上叠一套 React DOM 控件。那会拆分坐标、焦点、命中、z-order 与无障碍树，并且不满足共享 gpuix React UI 的目标。像素桥可以作为该统一 host 的一个后端验证方案，但长期是否保留要由测量决定。

## Context7 交叉验证记录

本轮调用 Context7，不将它当作发布版本权威。以下列出返回内容与源码校验结果。

| library id 与问题 | Context7 返回 | 与本轮源码核对 |
| --- | --- | --- |
| `/remorses/gpuix` custom drawing | JSX `canvas:Props`；CustomElement plan；Canvas typed but not implemented | 与 main registry 一致。返回的 custom-elements-plan 是计划，不可标成已发布 TS plugin API [G4][G5] |
| `/remorses/gpuix` Motion subset | 原生 width/height/opacity/四边/borderRadius；duration/delay/ease | 与 main `host.ts` 和 `motion.rs` 一致。没有得到 spring/keyframe/transform 的实装证据 [G2][G3] |
| `/remorses/gpuix` pointer capabilities | 返回 automation mouse/down/move/up 与 screenshot helpers | automation `simulateMouseMove` 不等于 OS 相对输入或 warp，不能闭合 DragPad；以 host、index.d.ts 和 renderer 源码为准 [G16] |
| `/pmndrs/react-spring` custom host/manual clock | `createHost`、`applyAnimatedValues`、`SpringValue.advance`、raf demand | next 源码存在相应接口。还需 gpuix updater 和 scheduler，不能直接使用 web target [A3][A4][A5] |
| `/tweenjs/tween.js` manual Group clock | plain object、group.update、chain/repeat/yoyo | 与 repo Node 示例和 Group API 一致 [A6][A7] |
| `/samizdatco/skia-canvas` output | `{gpu:false}`、Canvas2D、raw RGBA、`willReadFrequently` | 官方文档明确 frequent bitmap readback 的开销；4.0.0 manifest/browser.js 另有 DOM shim，不能误称 native `.node` 可进浏览器 [C3][C4][C5] |
| `/websites/motion_dev` spring | 查询先返回 springValue/useSpring，未直接给出 raw sampler | 补读官方 `/docs/spring` 和当前 generator 源码，确认 `next(ms)`。未把自动调度 API 混入纯 sampler [A1][A2] |
| `/websites/rs_gpui` path drawing | `gpui::canvas`、PathBuilder fill/stroke/cubic、Window::paint_path、content_mask | 证明底层 Rust 方向可行，不证明 gpuix JS 已暴露或其 pin 已完全兼容 [G7] |

## 登录态 X 实查补充

2026-10-14 使用真实 Ego 浏览器 `ego-browser nodejs -e`，恢复共享 `taskSpace(24)`，全程只操作分配的 `task.page("p2")`。读取公开搜索、具体 status 页面和帖子中的公开仓库链接，未发帖、互动、改登录状态或操作其他 Page。下列时间来自原帖 DOM `time.datetime`，统一记 UTC；X 本地显示日期可能晚一天。本节是对前述 GitHub/Context7 调研的补充，不是全站搜索结论。

### 实际执行的聚焦搜索

| 方向 | X 查询与结果边界 |
| --- | --- |
| GPUI 路径与 Canvas | [`GPUI (canvas OR drawing OR paths)`，最新](https://x.com/search?q=GPUI%20%28canvas%20OR%20drawing%20OR%20paths%29&src=typed_query&f=live)；发现 `oppi.li/gpui-canvas` 的公开源码线索。更严格的 `GPUI canvas path` 返回无结果，不能据此判断生态不存在绘图实现 |
| Rust/Vello 与浏览器 | [`Vello (WASM OR Rust OR browser)`，最新](https://x.com/search?q=Vello%20%28WASM%20OR%20Rust%20OR%20browser%29&src=typed_query&f=live)；读到 Solid/Rust/Vello 与 ProGPU 作者的技术讨论，原帖未给出可安装的 gpuix bridge |
| 原生 spring | [`(GPUI OR gpuix) spring`，最新](https://x.com/search?q=%28GPUI%20OR%20gpuix%29%20spring&src=typed_query&f=live)；发现 2026-10 发布的 `gpui-m3` 和较早的 `Respring` 原始算法库 |
| 相对指针集成 | [`(GPUI OR Rust OR winit) ("relative pointer" OR "pointer lock" OR "cursor grab")`，最新](https://x.com/search?q=%28GPUI%20OR%20Rust%20OR%20winit%29%20%28%22relative%20pointer%22%20OR%20%22pointer%20lock%22%20OR%20%22cursor%20grab%22%29&src=typed_query&f=live)；结果有 Rust/Wasm 游戏，但没有读到可复用的 gpuix 隐藏、相对移动、原位恢复实现 |
| Vello 作者复查 | [`from:SunDoge_ (vello OR renderer OR github)`，最新](https://x.com/search?q=from%3ASunDoge_%20%28vello%20OR%20renderer%20OR%20github%29&src=typed_query&f=live)；具体帖子提及 QuickJS/Vello，不能把这种 JS runtime 描述认作 Node/Bun 兼容证明 |

另外试过含 Rust 与 spring 的宽查询，以及 Vello/github 的热门查询。它们返回大量词义不相关内容，未作为候选能力证据，也没有用点赞、浏览量或排名筛选技术结论。

### 原帖、项目与源码能证明什么

| 已打开原帖、作者、UTC 日期 | 链接项目与实查版本 | 源码证据及对 gpuix 的判断 | 仍只是社交陈述或未验证项 |
| --- | --- | --- | --- |
| [akshay oppiliappan `@oppili`](https://x.com/oppili/status/2108818783066337461)，2026-10-10 07:15:52Z | 从帖子 `t.co/M4guRvpCxa` 实际跳转到 [oppi.li/gpui-canvas](https://tangled.org/oppi.li/gpui-canvas/)；main `3f9335d43edf7bab58ade08238793f64a16683c9`，页面无 tag；Cargo 标 `0.1.0`、`publish=false` | [Cargo](https://tangled.org/oppi.li/gpui-canvas/blob/3f9335d43edf7bab58ade08238793f64a16683c9/Cargo.toml) 依赖 `gpui-unofficial 1.23.2`；[lib.rs](https://tangled.org/oppi.li/gpui-canvas/blob/3f9335d43edf7bab58ade08238793f64a16683c9/src/lib.rs) 导出 `InfiniteCanvas/CanvasItem/CanvasLayout`；[canvas.rs](https://tangled.org/oppi.li/gpui-canvas/blob/3f9335d43edf7bab58ade08238793f64a16683c9/src/canvas.rs) 的 content 是返回 `gpui::AnyElement` 的 Rust closure。这是可平移缩放的 item 容器，不是 TS Canvas2D/path command API；不能直接装进 gpuix | 原帖称 macOS 上复用多个 embedded Alacritty，这是应用能力陈述，不证明该仓库有 Node/Bun/browser 后端。看到的 drag 使用绝对 GPUI mouse position 和 pressed button，未得到 hidden-cursor/warp/restore 证明；也未运行其测试 |
| [Chrsx3 `@Chrsx33`](https://x.com/Chrsx33/status/2108971528889024607)，2026-10-10 17:22:49Z | 从 `t.co/2PGmzmPmP3` 跳转到 [chrx3/gpui-m3](https://github.com/chrx3/gpui-m3)；[v0.1.0](https://github.com/chrx3/gpui-m3/releases/tag/v0.1.0) 发布于 2026-10-10 17:10:22Z，SHA `50d4193e3924b81a7b26f62da1f5a6878c7b51a9` | [Cargo](https://github.com/chrx3/gpui-m3/blob/v0.1.0/Cargo.toml) 依赖 crates.io `gpui 0.2.2`；[motion.rs](https://github.com/chrx3/gpui-m3/blob/v0.1.0/src/motion.rs) 实装 `Spring::solve(x0,v0,t)`、`SpringValue<N>::update` 的 value/velocity 重定向及 `Window::request_animation_frame`。可参考原生 spring、presence 的状态设计，但不是 gpuix TS adapter，不能与 gpuix 自有 GPUI fork 类型直接混用 | “100% native Rust”有代码支持，但不证明 Node/Bun 或 browser Wasm 可调用。[README](https://github.com/chrx3/gpui-m3/blob/v0.1.0/README.md) 明说无法任意 scale 节点、只做矩形 clip，并列平台使用限制；作者的 CPU 和性能数字不是本轮测量 |
| [Cyandev `@unixzii`](https://x.com/unixzii/status/1948782201359008072)，2025-07-25 16:27:38Z；其[前一条 GPUI 演示](https://x.com/unixzii/status/1948781829680758910)也已读 | 从 `t.co/zlLGqFiCtZ` 跳转到 [ktiays/Respring](https://github.com/ktiays/Respring)；Rust Cargo `0.1.1`，本轮 main SHA `2148e8fce312b4dcf76b8f909226b19f3ae38186` | [Cargo](https://github.com/ktiays/Respring/blob/2148e8fce312b4dcf76b8f909226b19f3ae38186/Cargo.toml) 无 GPUI 依赖；[README](https://github.com/ktiays/Respring/blob/2148e8fce312b4dcf76b8f909226b19f3ae38186/README.md) 给出 `Spring::with_duration_bounce` 和 `spring.value(target,initial_velocity,time)`；[lib.rs](https://github.com/ktiays/Respring/blob/2148e8fce312b4dcf76b8f909226b19f3ae38186/src/lib.rs) 仅导出 Rust 算法类型。适合 Rust 侧算法参考，不是现成 JS/React host | 原帖明确“GPUI 扩展库晚点再开源”，不能把算法库视为已发布扩展，也不能把 2025 原帖当作最新活跃版本证明。没有 N-API/wasm-bindgen 包或时钟整合的本轮证据 |
| [八级大狂风 `@SunDoge_`](https://x.com/SunDoge_/status/2091936078810980564)，2026-08-24 17:10:02Z；[WGSL 回复](https://x.com/SunDoge_/status/2097268411323834379)，2026-09-08 10:18:49Z | 作者描述 Solid 模型、Rust/Vello native renderer 与 custom WGSL shader；这两条原帖没有公开 repo URL | 原帖全文证明作者正在研究非 DOM renderer，提供可继续联系的技术方向；没有可定位版本或源码，不能据此闭合 gpuix 的 Canvas、shader 或 React renderer 缺口 | Solid 并非当前共享 React UI；QuickJS/Vello、WGSL 演示不能证明 Node/Bun、GPUI 同设备 texture import 或 browser Wasm 对等能力 |
| [Wiesław Šoltés `@wieslawsoltes`](https://x.com/wieslawsoltes/status/2107854408042365258)，2026-10-07 15:23:47Z | 原帖提到 `wgpu + Vello` 和其 `ProGPU`，没有链接到 repo 或版本 | 只能证明作者给出了 native 与 browser 分别选后端的经验建议；没有 gpuix adapter API 证据 | “browser WebGPU way faster”是作者意见，本文不采纳为 benchmark，不据此更换 gpuix 或承诺性能 |
| [CxMx `@c_x_m_x`](https://x.com/c_x_m_x/status/2078324777802969473)，2026-07-18 03:43:35Z，X 标记已编辑 | `Shooting Range` 原帖全文列 Rust、wgpu、wasm-bindgen、Trunk 和 browser Pointer Lock；没有源码 URL/版本 | 说明 browser Pointer Lock 可作为另一个项目的输入方案，但不提供 gpuix `EventPayload` 的 relative delta、窗口失焦取消或原位恢复绑定 [G3][G16] | 97% Rust、双目标移植和性能描述均是作者自述；不能用它证明 GPUI/gpuix 有相同能力，也未运行游戏或请求 Pointer Lock 权限 |

实查新增了两个有源码的 Rust 参考方向，但没有发现可直接安装的 gpuix path/Canvas、native spring 或 relative-pointer 完整 bridge。`gpui-canvas` 这个名字尤其容易误判，它解决 item 的无限画布布局，并不解决 zoeydaw 的 waveform、automation、fade 绘图协议。已有 GPUI dependency pin、N-API/browser Wasm 接入和动画时钟的缺口仍成立。[G3][G5][G6]

### Motion 14.2.0 的新增 `motion/vgpu` 分类

协调者补充的新入口已单独核对。[npm 14.2.0 manifest](https://registry.npmjs.org/motion/14.2.0) 确有 `./vgpu` export，`gitHead` 为 `790a654dfef305307c566cf4e94d67a9f7a403c8`。对应[固定发布 revision 源码](https://github.com/motiondivision/motion/blob/790a654dfef305307c566cf4e94d67a9f7a403c8/packages/motion/src/vgpu.ts) 通过 `createEffect` 把 `MotionValue` 绑定到 vgpu uniforms、scene node、material 或 control，对象变化在 `frame.preRender` 合并，再调用 `subject.set(bag)`。可使用 `animate.addEffect(vgpuEffect)` 或 `vgpuEffect(subject,values)`。

这是数值到 vgpu 对象的 updater，不是 GPUI canvas/texture import，也不识别 gpuix `PublicInstance`。源码仍从 `framer-motion/dom` 取得 `frame`，因此没有自动补齐 Node/Bun 的 rAF 调度。它支持 vgpu 的 scale/rotate，也不意味着 gpuix `StyleDesc` 支持对应 transform。可以参考“同一帧一次 set”的批量更新方式，不能将该入口标为本次迁移的 ready-made bridge。[A9][G3]

### 只读配置观察

本次分别读取 `cfg://providers/streamFirstEventTimeoutSeconds` 与 `cfg://providers/streamIdleTimeoutSeconds`，当前有效值为 **60 秒**和 **15 秒**，两项 `source` 均为 `global config`，默认值均为 `-1`。这与用户已设置的值一致；没有写配置，也没有调试 OMP。该观察仅记录会话工具配置，不涉及 gpuix 渲染能力。

## 仍需真实验证的阻塞与决策门槛

- 在不启动用户原应用的独立授权环境，分别验证 Node 和 Bun 加载 gpuix 及候选数值 engine。所有非 DOM imports 必须在没有 `window/document/requestAnimationFrame` 的进程成立；自动前进和手动采样分开测试。
- 用同一 React timeline 场景验证 native 与 browser GPUI Wasm，不以 React DOM Demo 替代。覆盖高 DPR、resize、theme、scroll/zoom、automation/fade 与 clip hit geometry。
- 测量 scene/playhead、waveform 高密度、多个 meter、拖拽 overlay 并发的 JS、FFI、layout、paint、upload 与 input-to-display。gpuix #91 报告 main 与发布版有 vsync/polling 延迟问题，尚未合并的提案不能当现成修复。[P1]
- 若采用像素桥，记录尺寸、DPR、更新区域、每秒 bytes、copy/readback、atlas churn 与内存回收，比较 CPU Canvas 和 native path host。BGRA 或作者 benchmark 均不足以证明 DAW 达标。
- pointer adapter 验证鼠标越出 element、窗口、屏幕边缘，多显示器与缩放；release、lost capture、Cmd-Tab、Escape、关闭窗口和卸载均要确保事务取消/结束正确且光标可见。
- Linux X11、Wayland、Windows 和 macOS 分开核实 relative/lock/warp 可用性。浏览器 Pointer Lock 受用户手势和权限约束；不能许诺在所有环境原位 warp。
- metal-fx 完整效果属于独立 blocker。保持原效果需要 custom shader host，静态替代需要明确批准。

作者数字仅作风险线索：#42 声称 Apple Silicon/Bun 的 terminal 路径约 59 Hz，#40 说 Metal 运行而 WGPU/DirectX 未实测；#91 作者记录 main 默认 tick 下 scrolling 的 median frame interval 约 21 ms，提案修改后约 11 ms。这些不是本轮测试，也不是 waveform、DAW 或其他硬件的性能保证。[D3][D4][P1]

## 一手来源

### gpuix 与 GPUI

- [G0] [gpuix repository metadata](https://api.github.com/repos/remorses/gpuix)。default branch、pushed_at、非 archived 状态。
- [G1] [gpuix releases](https://github.com/remorses/gpuix/releases)，[React 0.10.0 release](https://github.com/remorses/gpuix/releases/tag/%40gpuix/react%400.10.0)。
- [G2] [固定 main renderer.rs](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/src/renderer.rs)，关注 2207-2244、3833-3874、5572-5625、5743-5745；[motion.rs](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/src/motion.rs)。
- [G3] [main native host types](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/js/host.ts)。
- [G4] [main tree](https://api.github.com/repos/remorses/gpuix/git/trees/6a5c7c142ac32f9eb0caefe0121be995cfc18631?recursive=1)。
- [G5] [custom element registry/traits](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/src/custom_elements/mod.rs)。
- [G6] [gitmodules](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/.gitmodules)，[Cargo.toml](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/Cargo.toml)。
- [G7] [GPUI canvas source](https://docs.rs/gpui/latest/src/gpui/elements/canvas.rs.html)，[PathBuilder source](https://docs.rs/gpui/latest/src/gpui/path_builder.rs.html)，[Window source](https://docs.rs/gpui/latest/src/gpui/window.rs.html)。这是 upstream latest，不是 gpuix pin 的运行验收。
- [G8] [Browser GPUI renderer PR #18](https://github.com/remorses/gpuix/pull/18)。
- [G9] [main image pixel conversion/RenderImage](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/src/custom_elements/img.rs#L294-L347)，[React image ref methods](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/react/src/reconciler/host-config.ts#L55-L75)。发布差异另以 npm tarball 声明核实。
- [G10] [Canvas/timeline/motion discussion #8](https://github.com/remorses/gpuix/issues/8)。
- [G11] [Canvas/shape painter request #82](https://github.com/remorses/gpuix/issues/82)。issue 对 SVG 的描述早于本轮源码，本文以 `source` 实装为准。
- [G12] [SVG tint/source implementation](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/src/custom_elements/img.rs#L462-L516)。
- [G13] [Spring PR #34 与最新作者验证](https://github.com/remorses/gpuix/pull/34)。
- [G14] [AnimatePresence implementation](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/react/src/components/animate-presence.ts)。
- [G15] [motion wrapper](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/react/src/components/index.ts)，[package exports](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/react/src/index.ts)。
- [G16] [main generated native API/EventPayload](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/index.d.ts)。
- [G17] [Pannable surfaces must cull](https://github.com/remorses/gpuix#pannable-surfaces-must-cull)，[官方 timeline 示例源码](https://github.com/remorses/gpuix/blob/main/examples/timeline.tsx)。3259 clip/26 轨道裁剪前后帧时间为作者基准，本轮未重测。
- [P1] [macOS frame pacing issue #91](https://github.com/remorses/gpuix/issues/91)，作者观察，不是本轮 benchmark。

### 分支与参考实现

- [D0] [Upstream branches](https://api.github.com/repos/remorses/gpuix/branches?per_page=100)，[all issues](https://api.github.com/repos/remorses/gpuix/issues?state=all&per_page=100)，[forks](https://api.github.com/repos/remorses/gpuix/forks?sort=newest&per_page=100)，[gpuix canvas repository search](https://github.com/search?q=gpuix+canvas&type=repositories)。
- [D1] [Parked WebGPU PR #45](https://github.com/remorses/gpuix/pull/45)。
- [D2] [Prototype canvas native implementation](https://github.com/remorses/gpuix/blob/6a5500eaf321e0c64b887526a5bcc40516684b4f/packages/native/src/custom_elements/canvas.rs)，[JS WebGPU facade](https://github.com/remorses/gpuix/blob/6a5500eaf321e0c64b887526a5bcc40516684b4f/packages/react/src/webgpu.ts)。
- [D3] [Fixed-cell terminal proposal #42](https://github.com/remorses/gpuix/issues/42)，[reference branch](https://github.com/monotykamary/gpuix/tree/reference/native-terminal-surface)。API 与数字是提案和作者报告。
- [D4] [Same-size atlas update proposal #40](https://github.com/remorses/gpuix/issues/40)，[GPUI reference commit](https://github.com/monotykamary/zed/commit/b1090df3fe87cfc7e005ecb8275ccc91c04ee641)。
- [D5] [Spring fork transition types](https://github.com/professorpalmer/gpuix/blob/774c854794/packages/native/js/host.ts)。

### 绘图库与 shader

- [C1] [napi-rs Canvas 1.0.11 README](https://github.com/Brooooooklyn/canvas/blob/v1.0.11/README.md)。
- [C2] [napi-rs Canvas 1.0.11 API declarations](https://github.com/Brooooooklyn/canvas/blob/v1.0.11/index.d.ts)。
- [C3] [Skia Canvas 4.0.0 manifest](https://github.com/samizdatco/skia-canvas/blob/v4.0.0/package.json)，[README](https://github.com/samizdatco/skia-canvas/blob/v4.0.0/README.md)。
- [C4] [Skia Canvas Canvas API](https://skia-canvas.org/api/canvas)，[docs source](https://github.com/samizdatco/skia-canvas/blob/main/docs/api/canvas.md)。
- [C5] [Skia Canvas 4.0.0 browser shim](https://github.com/samizdatco/skia-canvas/blob/v4.0.0/lib/browser.js)。
- [C6] [Google CanvasKit overview](https://skia.org/docs/user/modules/canvaskit/)。
- [S1] [metal-fx repository](https://github.com/Jakubantalik/metal-fx)。
- [S2] [metal-fx renderer core](https://github.com/Jakubantalik/metal-fx/blob/be1bf89c63056521a4e8224f368768314c9006f7/src/engine/renderer/core.ts)，[React DOM component](https://github.com/Jakubantalik/metal-fx/blob/be1bf89c63056521a4e8224f368768314c9006f7/src/MetalFx.tsx)。
- [S3] [metal-fx shaders](https://github.com/Jakubantalik/metal-fx/blob/be1bf89c63056521a4e8224f368768314c9006f7/src/engine/shaders.ts)。

### 动画库

- [A1] [Motion spring generator official docs](https://motion.dev/docs/spring)。时间单位与两数值 keyframes 限制见此页。
- [A2] [Motion current spring generator source](https://github.com/motiondivision/motion/blob/2b68ca99c8cc12fb95554c293253dc154267f728/packages/motion-dom/src/animation/generators/spring.ts)。
- [A3] [react-spring createHost](https://github.com/pmndrs/react-spring/blob/ea91c9d3415b519e085a0bf39b7d0bb6492e1929/packages/animated/src/createHost.ts)。
- [A4] [react-spring rafz default/manual clock](https://github.com/pmndrs/react-spring/blob/ea91c9d3415b519e085a0bf39b7d0bb6492e1929/packages/rafz/src/index.ts)。
- [A5] [SpringValue API](https://www.react-spring.dev/docs/advanced/spring-value)。
- [A6] [Tween.js Group implementation](https://github.com/tweenjs/tween.js/blob/84a27a74febbda783eebb7ee3e7d7c7abfd25009/src/Group.ts)，[user guide](https://github.com/tweenjs/tween.js/blob/main/docs/user_guide.md)。
- [A7] [Tween.js Node ESM example](https://github.com/tweenjs/tween.js/tree/main/examples/example-projects/nodejs-esmodules)，[Node CJS example](https://github.com/tweenjs/tween.js/tree/main/examples/example-projects/nodejs-commonjs)。
- [A8] [Motion animate overloads](https://github.com/motiondivision/motion/blob/2b68ca99c8cc12fb95554c293253dc154267f728/packages/framer-motion/src/animation/animate/index.ts)。
- [A9] [Motion rAF/noop frame source](https://github.com/motiondivision/motion/blob/2b68ca99c8cc12fb95554c293253dc154267f728/packages/motion-dom/src/frameloop/frame.ts)。
- [A10] [Popmotion repository metadata](https://api.github.com/repos/Popmotion/popmotion)。

### 发布版本与日期来源

以下 npm registry 响应的 `dist-tags`、`versions` 与 `time` 均于本轮读取，不从 README 的版本 badge 推断。

- [V1] [@gpuix/react registry](https://registry.npmjs.org/@gpuix%2Freact)。
- [V2] [@gpuix/native registry](https://registry.npmjs.org/@gpuix%2Fnative)。
- [V3] [@napi-rs/canvas registry](https://registry.npmjs.org/@napi-rs%2Fcanvas)，[GitHub releases](https://github.com/Brooooooklyn/canvas/releases)。
- [V4] [skia-canvas registry](https://registry.npmjs.org/skia-canvas)，[GitHub releases](https://github.com/samizdatco/skia-canvas/releases)。
- [V5] [canvaskit-wasm registry](https://registry.npmjs.org/canvaskit-wasm)。
- [V6] [React Native Skia registry](https://registry.npmjs.org/@shopify%2Freact-native-skia)。
- [V7] [metal-fx registry](https://registry.npmjs.org/metal-fx)。
- [V8] [motion registry](https://registry.npmjs.org/motion)。
- [V9] [react-spring core registry](https://registry.npmjs.org/@react-spring%2Fcore)，[animated registry](https://registry.npmjs.org/@react-spring%2Fanimated)，[prereleases](https://github.com/pmndrs/react-spring/releases)。
- [V10] [Tween.js registry](https://registry.npmjs.org/@tweenjs%2Ftween.js)。
- [V11] [Anime.js registry](https://registry.npmjs.org/animejs)，[repository](https://github.com/juliangarnier/anime)。
