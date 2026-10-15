# Clip Edit

底部 Footer 的单 Clip 编辑器。公共入口为 `index.ts`。组件按 `clip.kind` 挂载 Audio、MIDI 或 Pattern 中的一种，不改变 Footer 的显示状态，也不创建弹层编辑器。

## 公共接口

| 导出 | 契约 |
| --- | --- |
| `ClipEditor(props)` | `clipId`、`trackId`、`close` 来自 Footer 的 render slot，另注入 `labels`、`readPeaks` 与 `environment`；编辑器通过 adapter selector 读取唯一工程 owner |
| `ClipEditorSlot` | `{ clipId: string; trackId: string; close(): void }`，Footer 消费此唯一类型，不通过 React props 转发包含大量 notes 的 Clip/Track 对象 |
| `ClipEditorLabels` | 所有界面文字。英文与中文示例只在 `demo/labels.ts`，应用组合根提供实际翻译 |
| `ClipEditorEnvironment` | `clipboard`、`subscribeWindowActive`、`drawMode`、`onRegionKey`，均由组合根提供 |

`readPeaks` 使用 `project/model/backend` 的 `PeakReader`。组合根取得 `startProjectRuntime()` 的 lease 后注入 `readProjectPeaks`，最后释放 lease。编辑器不创建后端，不接触引擎句柄，不从 UI 计算峰值。

`environment.clipboard` 是 `platform/clipboard` 的 `NativeClipboard`。复制、剪切和粘贴同时更新 adapter 的 `clipboardMemory`，外部文本不能恢复过期的 MIDI 负载。

`environment.subscribeWindowActive` 必须来自组合根同一个原生窗口订阅，不在编辑器内创建第二个 observer。失活取消当前编辑事务和试听音符。

`environment.drawMode.markGesture` 接 timeline keyboard 的 `markDrawGesture`，`latch` 接 `latchDraw`。B 键只由 timeline 处理。编辑器不持有第二份 B-key 状态。

`environment.onRegionKey(keystrokeId)` 只接收子元素未消费、根也未消费的键。grid 先处理编辑命令，根再处理非文本控件的 Cmd+Z、Cmd+Shift+Z。名称输入的撤销不上抛。组合根将非空 id 与随后窗口事件的 id 比较，相同才判为 `clip-editor`；缺 id 不作此判定。Space 不在编辑器内消费。

## 状态归属与交互

工程只在 adapters/stores。连续编辑使用 `useProjectEditGesture`，一笔拖动产生一条撤销记录，Escape、失活、卸载或切换 Clip 取消。选择、框选矩形、折叠、缩放和滚动只在编辑器内部，不进快照。

MIDI 音符编辑调用 `project/model/midi-editing`。grid 中方向键移动、Shift 上下跨八度、Delete、Cmd+A/C/X/V/D/U/Z。Cmd+U 只量化选中起点；长度与未选音符保留。拖动中消费并忽略 Delete、Cut、Paste、方向键、D、U，直到 release；Escape 与 Cmd+Z 仍取消手势。指针选琴键后焦点回到 grid，Enter 试听仍留琴键。力度 lane 是单 Tab 入口的复合控件：Left/Right 按源音符顺序移动当前项并单选，Up/Down 沿用选中组的力度步长及 Undo 事务；Space 仍冒到窗口播放。

钢琴卷帘绘制与命中共用可见音符几何。屏外音符不挂载，琴键、网格线与力度杆也按可见范围裁剪。滚轮调整视口，Shift 滚轮横向滚动。Cmd 或 Ctrl 滚轮改变时间缩放。显示、插入、刷写、擦除和量化使用源绝对 beat 0 的网格。首尾半格只按可见交集判断占用与擦除，不删除窗口外的保留音符。窗口 resize 和 Fold 音高集合变化重新夹取 scroll，普通音符编辑不自动重新 fit。

视口 wheel 只有 MIDI body 一个 owner，琴键和 grid 不重复消费事件；一次 Cmd/Ctrl wheel 与工具栏一样只缩放一级。被动网格、无文字音符和力度杆经 `useQuadBatch` 命令式上传，几何与 typed array 不进入 React props；有文字的音符保留原生文字盒的边框、裁切与绘制层级。屏外音符不给几何或语义节点。可见 pitch 行的 AX 标签保留音符时间范围、力度与选择标记，当前选中音符保留 gridcell；力度只保留一个活动 slider，原生值经 `aria-valuetext` 暴露。

唯一 selection owner 原子持有 `{indices,current}`。组内点击与 Shift 添加音符更新 current 而不重排成员，Cmd+A 扩展成员并保留 current，gridcell、slider 与力度数值使用同一锚点。Left/Right 导航改为单选；Up/Down 保留组成员与 Undo 事务。聚焦项滚出可见范围后同步到可见候选项，选择变化不产生工程 Undo。二维编辑面保留唯一根 Tab 入口及原箭头编辑语义（`gpuix-ui-standards.md:74`），pitch 行不进入 Tab。quad 像素对齐只有共享原生路径，UI 不做逻辑像素舍入。

音频视图请求当前可见的保留源窗口部分及其实际像素宽度。音乐位置到采样帧、带符号的偏移和回绕由 Rust 处理。共享 `PeakColumns` 直接画 channel-major 的 min/max；UI 只在增益或反向预览需要时产生变换数组。Overview 使用同一 reader，宽度来自 renderer 布局。reader 身份稳定时，session、backend phase/pending/acceptedRevision 与 tempo/meter 仍构成查询 generation，后端就绪和音乐到帧的映射变化会使峰值缓存失效。

Start/End、Loop Position/Length 和 Arrangement 位置互不替代。标记键盘步长是一音乐十六分音符，Shift 为其四分之一。键盘微调先取消仍在进行的 pointer 事务，读取还原后的权威 Clip，再单独提交 nudge。Start/End、Loop Position/Length、Warp/Mode、Source BPM、Transpose、Detune、Reverse 目前只编辑元数据，C1 播放尚未响应这些设置；这与 Web 范围一致并获协调者批准。琴键使用 held-note 端口，不代表已接通 MIDI synthesis。

Pattern 只编辑一个源周期。裁剪后的首步保留其源相位。鼠标刷过的步统一写入同一事务，Enter 切换单步，Space 留给播放。

## 文件职责

- `ClipEditor.tsx`、`NameInput.tsx`：类型分派、标题与命名事务。
- `midi/layout.ts`、`viewport.ts`：可见几何、命中、框选、拟合和缩放位置。
- `midi/useMidiEditor.ts`：手势、选择、剪贴板与编辑命令；工程操作复用 model。
- `midi/NoteGrid.tsx`、`PianoKeys.tsx`、`MidiRuler.tsx`、`VelocityLane.tsx`：渲染与输入 host。
- `midi/note-paint.ts`、`paint-layers.ts`：纯可见矩形、重叠层与不可变上传快照；`QuadPaint.tsx`：host 注册及命令式上传生命周期，不持有工程或选择状态。
- `audio/source-view.ts`、`markers.ts`：源视口与标记计算。
- `audio/AudioParameters.tsx`：复用 DragPad、Toggle 与 Dropdown 的参数面板。
- `audio/AudioWaveform.tsx`、`SourceWaveform.tsx`、`SourceMarker.tsx`：源视图组合、真实峰值查询、标记事务。
- `pattern/PatternSteps.tsx`：源周期刷步。

## 验证入口

根目录先执行 `pnpm native:build`。在 `apps/gpuix` 执行：

```sh
pnpm exec tsc --noEmit
bun test src/project/sections/clip-edit src/project/model/midi-editing
bun src/project/sections/clip-edit/verification/mutations.mjs
bun --hot src/project/sections/clip-edit/demo/index.tsx
bun src/project/sections/clip-edit/verification/consumer-probe.tsx current dense
NODE_ENV=production bun src/project/sections/clip-edit/verification/consumer-probe.tsx current-production dense
```

Demo 使用真实 runtime 与临时生成的立体声 WAV。`CLIP_EDIT_THEME=light`、`CLIP_EDIT_LOCALE=zh` 切换外观和语言，`CLIP_EDIT_STRESS=1` 使用与 headless probe 相同的完整 10000 notes / 1024 steps 工程；结束时删除临时媒体。窗口先申请桌面时段，以命名 service 启动，验证后立即结束。生成 PNG 在 ignored evidence 中，不批量提交；JSON 记录解码元数据、真实 peak 请求、节点、单帧/编辑计时及输入序列。

迁移清单、差异、Live 对照、截图、测量、完整命令与自审结论见 [验证报告](VERIFICATION.md)。
