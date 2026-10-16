# Clip Edit

应用组合根通过 `labels.midi.formats`、`labels.audio.formats` 注入 locale 显示策略（精度、单位、时长、音名及测宽样本），通过 `labels.creationNames` 注入未命名片段的本地化名称。编辑器消费当前 `midi`、`midiViewport`、`audio` 偏好：插入/绘制长度和力度、移动网格、量化网格、空片段音高、八度命名、fold/zoom 初态、缩放限制和 reset 都跟随各自来源。局部视图操作不写入工程历史；纯几何默认只读取纯 `PREFERENCE_DEFAULTS`，实时策略由编辑器显式传入。

独立 demo 与真实后端验证入口位于 `app/verification/clip-edit`；创建媒体/seed 或启动 runtime 前，经 `initializeVerificationProject` 配置 creation 资源并打开隔离工程，随各入口既有生命周期释放。Profiler/preload 工具不创建第二个工程 owner。

`preferences.test.tsx` 用独立临时设置 owner 覆盖插入/绘制、量化、fold/音名、独立 MIDI loop 步幅、音频 reset 和注入 formatter/测宽的实际消费者；每例恢复工程状态与 owner 并删除临时目录。C4 变异入口：在 `apps/gpuix` 执行 `bun src/project/sections/clip-edit/verification/mutations.mjs C4`，逐项打断来源并恢复原文件。

底部 Footer 的单 Clip 编辑器。公共入口为 `index.ts`。组件按 `clip.kind` 挂载 Audio、MIDI 或 Pattern 中的一种，不改变 Footer 的显示状态，也不创建弹层编辑器。

## 公共接口

| 导出 | 契约 |
| --- | --- |
| `ClipEditor(props)` | `clipId`、`trackId`、`close` 来自 Footer 的 render slot，另注入 `labels`、`readPeaks` 与 `environment`；编辑器通过 adapter selector 读取唯一工程 owner |
| `ClipEditorSlot` | `{ clipId: string; trackId: string; close(): void }`，Footer 消费此唯一类型，不通过 React props 转发包含大量 notes 的 Clip/Track 对象 |
| `ClipEditorLabels` | 所有界面文字与显示策略；应用 `app/locales/sections/clip-edit` 提供中英文资源，demo 与测试复用同一来源 |
| `ClipEditorEnvironment` | `clipboard`、`subscribeWindowActive`、`drawMode`、`onRegionKey`，均由组合根提供 |

`readPeaks` 使用 `project/model/backend` 的 `PeakReader`。组合根取得 `startProjectRuntime()` 的 lease 后注入 `readProjectPeaks`，最后释放 lease。编辑器不创建后端，不接触引擎句柄，不从 UI 计算峰值。

`environment.clipboard` 是 `platform/clipboard` 的 `NativeClipboard`。复制、剪切和粘贴同时更新 adapter 的 `clipboardMemory`，外部文本不能恢复过期的 MIDI 负载。

MIDI 剪贴板使用版本 1 的 `application/x-zoeymind-midi-notes+json` 负载。Copy 和 Cut 生成的合法选区均可完整 Paste，不设 2048 音符或 250000 字符上限。Paste 保留 pitch、lengthBeats、velocity，将每个 startBeat 增加 0.25，并生成新的音符 ID。Cut 和 Paste 各产生一条 Undo；剪切后的选区可直接粘贴恢复。解析仍校验版本、非空音符数组及每个音符的字段，任一无效音符使整份负载被拒绝，不改变工程或历史。

`midi/large-selection.test.tsx` 通过原生键盘覆盖 2049 音符、1024 音符且负载超过 250000 字符的 Copy/Cut/Paste 往返，以及无效负载的原子拒绝。恢复旧上限的突变检查为 `bun src/project/sections/clip-edit/verification/mutations.mjs SEC-01`，在 `apps/gpuix` 执行。

`environment.subscribeWindowActive` 必须来自组合根同一个原生窗口订阅，不在编辑器内创建第二个 observer。失活取消当前编辑事务和试听音符。

`environment.drawMode.markGesture` 接 timeline keyboard 的 `markDrawGesture`，`latch` 接 `latchDraw`。B 键只由 timeline 处理。编辑器不持有第二份 B-key 状态。

`environment.onRegionKey(keystrokeId)` 只接收子元素未消费、根也未消费的键。grid 先处理编辑命令，根再处理非文本控件的 Cmd+Z、Cmd+Shift+Z。名称输入的撤销不上抛。组合根将非空 id 与随后窗口事件的 id 比较，相同才判为 `clip-editor`；缺 id 不作此判定。Space 不在编辑器内消费。

## 状态归属与交互

工程只在 adapters/stores。连续编辑使用 `useProjectEditGesture`，一笔拖动产生一条撤销记录，Escape、失活、卸载或切换 Clip 取消。选择、框选矩形、折叠、缩放和滚动只在编辑器内部，不进快照。

MIDI 音符编辑调用 `project/model/midi-editing`。grid 中方向键移动、Shift 上下跨八度、Delete、Cmd+A/C/X/V/D/U/Z。Cmd+U 只量化选中起点；长度与未选音符保留。拖动中消费并忽略 Delete、Cut、Paste、方向键、D、U，直到 release；Escape 与 Cmd+Z 仍取消手势。指针选琴键后焦点回到 grid，Enter 试听仍留琴键。力度 lane 是单 Tab 入口的复合控件：Left/Right 按源音符顺序移动当前项并单选，Up/Down 沿用选中组的力度步长及 Undo 事务；Space 仍冒到窗口播放。

钢琴卷帘绘制与命中共用可见音符几何。屏外音符不挂载，琴键、网格线与力度杆也按可见范围裁剪。滚轮调整视口，Shift 滚轮横向滚动。Cmd 或 Ctrl 滚轮改变时间缩放。显示、插入、刷写、擦除和量化使用源绝对 beat 0 的网格。首尾半格只按可见交集判断占用与擦除，不删除窗口外的保留音符。窗口 resize 和 Fold 音高集合变化重新夹取 scroll，普通音符编辑不自动重新 fit。移动和拉长音符使用 content-space 位移，包含拖动中的 Shift 滚轮横移，释放仍只产生一条 Undo。时间比例、源窗口起点或 pitch 行高改变时取消当前手势并回滚，避免缩放后用新分母解释旧起点。`midi/scroll-gesture.test.tsx` 与 `mutations.mjs SEC-03` 覆盖横移和缩放取消。

时间和音高缩放入口在排队更新视口之前同步取消事务；几何 effect 只负责外部 resize 等后提交变化。回归直接向 `midi-body` 派发 wheel、紧接 release，不经过测试 renderer 的逐事件 `flushSync`，防止快速松手先提交再取消。

视口 wheel 只有 MIDI body 一个 owner，琴键和 grid 不重复消费事件；一次 Cmd/Ctrl wheel 与工具栏一样只缩放一级。被动网格、无文字音符和力度杆经 `useQuadBatch` 命令式上传，几何与 typed array 不进入 React props；有文字的音符保留原生文字盒的边框、裁切与绘制层级。屏外音符不给几何或语义节点。可见 pitch 行的 AX 标签保留音符时间范围、力度与选择标记，当前选中音符保留 gridcell；力度只保留一个活动 slider，原生值经 `aria-valuetext` 暴露。

唯一 selection owner 原子持有稳定音符 `{ids,current}`，渲染和 model API 的下标从当前 notes 派生；Undo/Redo 插入或删除前序成员不会转移选择，消失的 ID 不会选中替代成员。旧数据缺 ID 的归一化由工程解析边界负责，UI 不写 ID。组内点击与 Shift 添加音符更新 current 而不重排成员，Cmd+A 扩展成员并保留 current，gridcell、slider 与力度数值使用同一锚点。Left/Right 导航改为单选；Up/Down 保留组成员与 Undo 事务。聚焦项滚出可见范围后同步到可见候选项，选择变化不产生工程 Undo。二维编辑面保留唯一根 Tab 入口及原箭头编辑语义（`gpuix-ui-standards.md:74`），pitch 行不进入 Tab。quad 像素对齐只有共享原生路径，UI 不做逻辑像素舍入。`midi/history-selection.test.tsx` 与 `mutations.mjs SEC-02` 覆盖历史恢复后的继续编辑。

MIDI 工具栏与音频参数使用共享 `ScrollArea`：前者将纵向滚轮转换为横向滚动，后者提供有名称的纵向滚动区域与键盘入口。钢琴卷帘、波形与 Pattern 的领域坐标、缩放和滚动仍由各自视口 owner 管理。

音频视图请求当前可见的保留源窗口部分及其实际像素宽度。音乐位置到采样帧、带符号的偏移和回绕由 Rust 处理。共享 `PeakColumns` 直接画 channel-major 的 min/max；UI 只在增益或反向预览需要时产生变换数组。Overview 使用同一 reader，宽度来自 renderer 布局。reader 身份稳定时，session、backend phase/pending/acceptedRevision 与 tempo/meter 仍构成查询 generation，后端就绪和音乐到帧的映射变化会使峰值缓存失效。

Start/End、Loop Position/Length 和 Arrangement 位置互不替代。标记键盘步长是一音乐十六分音符，Shift 为其四分之一。键盘微调先取消仍在进行的 pointer 事务，读取还原后的权威 Clip，再单独提交 nudge。Start/End、Loop Position/Length、Warp/Mode、Source BPM、Transpose、Detune、Reverse 目前只编辑元数据，C1 播放尚未响应这些设置；这与 Web 范围一致并获协调者批准。琴键使用 held-note 端口，不代表已接通 MIDI synthesis。

Pattern 只编辑一个源周期，保留裁剪首步与负偏移相位。`pattern/geometry.ts` 统一绘制、命中、裁剪和键盘reveal。步骤保持control-track最小宽度，长周期通过共享ControlledScrollbar横向滚动，屏外步不挂载。根是唯一Tab入口，Left/Right、Home/End移动当前步并揭示它，Enter切换当前步，Space留给播放。brush跨滚动仍为单一Undo，Escape、失活与拖动中Undo取消当前笔刷。

## 文件职责

- `ClipEditor.tsx`、`NameInput.tsx`：类型分派、标题与命名事务。
- `midi/layout.ts`、`viewport.ts`：可见几何、命中、框选、拟合和缩放位置。
- `midi/useMidiEditor.ts`：手势、选择、剪贴板与编辑命令；工程操作复用 model。
- `midi/NoteGrid.tsx`、`PianoKeys.tsx`、`MidiRuler.tsx`、`VelocityLane.tsx`：渲染与输入 host。
- `midi/note-paint.ts`、`paint-layers.ts`：纯可见矩形、重叠层与不可变上传快照；`QuadPaint.tsx`：host 注册及命令式上传生命周期，不持有工程或选择状态。
- `audio/source-view.ts`、`markers.ts`：源视口与标记计算。
- `audio/AudioParameters.tsx`：复用 DragPad、Toggle 与 Dropdown 的参数面板。
- `audio/AudioWaveform.tsx`、`SourceWaveform.tsx`、`SourceMarker.tsx`：源视图组合、真实峰值查询、标记事务。
- `pattern/PatternSteps.tsx`、`geometry.ts`：源周期刷步、可见viewport与统一命中几何。

## 验证入口

根目录先执行 `pnpm native:build`。在 `apps/gpuix` 执行：

```sh
pnpm exec tsc --noEmit
bun test src/project/sections/clip-edit src/project/model/midi-editing
bun src/project/sections/clip-edit/verification/mutations.mjs
bun --hot src/app/verification/clip-edit/demo/index.tsx
bun src/app/verification/clip-edit/consumer-probe.tsx current dense
NODE_ENV=production bun src/app/verification/clip-edit/consumer-probe.tsx current-production dense
```

R2 的真实后端离屏回归不改宿主剪贴板，输出在仓库外。先创建目录，再用 app 的 native fixture preload 配置真实引擎，section 不反向依赖 app：

```sh
mkdir -p /tmp/zoeydaw-r2-sections
B2_EVIDENCE_DIR=/tmp/zoeydaw-r2-sections bun --preload ./src/app/verification/native-fixture.ts src/app/verification/clip-edit/r2-smoke.tsx
```

Demo 使用真实 runtime 与临时生成的立体声 WAV。`CLIP_EDIT_THEME=light`、`CLIP_EDIT_LOCALE=zh` 切换外观和语言，`CLIP_EDIT_STRESS=1` 使用与 headless probe 相同的完整 10000 notes / 1024 steps 工程；结束时删除临时媒体。以命名 service 启动，验证后立即结束。
