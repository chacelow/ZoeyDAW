# B2 Clip Edit 验证报告

2026-10-15。实现提交 `0a6c745`、`2b39b41`、`502acb0`；独立审查修复提交 `fb91934`、`1abfaf3`、`728c0ce`、`6deb8f4`、`fffbc53`、`f7d07c7`、`f7c2ace`。共享主干变化通过 merge 引入，不是本切片重写。

## 交付范围与状态

`ClipEditor` 经 Footer 的 `renderClipEditor` 槽挂载，只选 Audio、MIDI、Pattern 中的一种。真实窗口使用 `startProjectRuntime()` 与 `readProjectPeaks`，媒体是临时生成并交给 Rust 解码的 WAV，不是 UI 合成峰值。

最终切片、模型与真实后端回归共 100 pass、0 fail，21 个测试文件；30 个变异全部被捕获。最终同步主干后的完整 `bun test` 为 951 pass、1 fail，953 tests、146 files。唯一失败仍是协调者已通知的 tracks 嵌套右键路径；协调者明确批准按外部已知失败交付，不跳过测试，也不写“全套全绿”。

Footer 的 `ClipEditorSlot` 和本切片保持同形。协调者批准在合入 Footer 时统一类型，只保留一个定义；本分支没有越界改 Footer。

## 迁入清单

源目录均相对 `apps/web/src/pages/project/sections/ArrangementPanel/Clip/Detail/`，保留只读。

| 来源 | 目标，相对本目录 | 处理 |
| --- | --- | --- |
| `index.tsx` | `ClipEditor.tsx`、`index.ts`、`environment.tsx`、`labels.ts` | Footer 槽类型、单编辑器分派、标题与注入端口 |
| `NameInput/index.tsx` | `NameInput.tsx` | 实时预览、提交、取消、文本键盘隔离 |
| `MidiEditor/index.tsx` | `midi/MidiEditor.tsx`、`NoteGrid.tsx` | 原生布局与可见音符挂载 |
| `MidiEditor/useMidiEditor.ts` | `midi/useMidiEditor.ts` | 鼠标捕获、事务、选择、剪贴板与编辑快捷键 |
| `MidiEditor/useMidiViewport.ts` | `midi/useMidiViewport.ts`、`viewport.ts` | renderer 布局测量、拟合、缩放、逻辑滚动 |
| `MidiEditor/geometry.ts`、`MidiNote/index.tsx` | `midi/geometry.ts`、`layout.ts`、`NoteGrid.tsx` | pitch 名称、几何、命中与裁剪 |
| `MidiEditor/clipboard.ts` 与测试 | `midi/clipboard.ts` 与测试 | 保留 MIME、版本、大小与几何校验 |
| `MidiEditor/MidiRuler` | `midi/MidiRuler.tsx` | 源窗口、循环边界、可见刻度 |
| `MidiEditor/PianoKeyboard` | `midi/PianoKeys.tsx` | 可见琴键、试听、松键与失活释放 |
| `MidiEditor/VelocityLane` | `midi/VelocityLane.tsx` | 力度杆、重合音符手柄命中、事务 |
| `AudioEditor/index.tsx` | `ClipEditor.tsx` 中 Audio 分支 | 参数与波形组合 |
| `AudioEditor/Parameters`、`MusicalNumber` | `audio/AudioParameters.tsx` | 复用 DragPad、Toggle、Dropdown、音乐值模型 |
| `AudioEditor/SourceMarker` | `audio/SourceMarker.tsx`、`markers.ts` | 播放、循环、淡入淡出标记，各自保持语义 |
| `AudioEditor/Waveform` | `audio/AudioWaveform.tsx`、`SourceWaveform.tsx` | 真实可见范围峰值、曲线、选择、概览与平移缩放 |
| `AudioEditor/useSourceViewport.ts` | `audio/source-view.ts` | 纯源窗口与 zoom/pan 计算 |
| `PatternEditor`、`PatternSteps` | `pattern/PatternSteps.tsx` 与根分派 | 单源周期、裁剪相位、刷步与撤销 |
| Web MIDI 交互、Detail 交互、viewport 测试 | `midi/MidiEditor.test.tsx`、`ClipEditor.test.tsx`、`pattern/PatternSteps.test.tsx`、`midi/layout.test.ts` | 使用真实 `createTestRoot` 与原生输入，不移植 DOM 机制断言 |

删除已批准的旧路径：`features/waveform-automation/WaveformView.tsx`、`model/waveform.ts`，以及其 index 导出和 demo 合成波形段。LSP 与文本调用检查确认唯一消费者是同目录 demo。`AutomationCurveView` 留在原切片，不删除别人的模块。

新增 `project/model/midi-editing/quantizeNotes` 与性质测试经过协调者授权。Cmd+U 只量化选中音符的起点，长度和未选音符保留。网格从调用方传入，边界调用已有 `moveMidiNote`。

## 与 Web 的差异

| 项目 | 本实现 | 原因或范围 |
| --- | --- | --- |
| 波形来源 | 原生 backend 可见范围峰值，立体声 min/max | Web 使用 `clip.waveformPeaks` 的单幅度预览；按 C1 契约迁移 |
| MIDI 几何 | 琴键 54、标尺 34、力度通道 40 | Live 实测优先；Web 为 58、40、68，协调者已添加共享 token |
| MIDI 时间初始宽度 | zoom=1 拟合当前窗口宽度 | 原 Web 还有 `totalBeats * 96` 下界；当前初始视图接近 Live 的整循环显示。滚轮与缩放仍能访问全部源窗口 |
| MIDI 滚动 | 本地逻辑 offset，原生 wheel 输入 | 不构造超大 native scroll 内容；没有 Web 的原生滚动条 |
| 力度入口 | 一个 DragPad 代替数值 input 与 range slider | 同一参数不重复显示；仍支持输入、拖动、悬停滚轮与力度杆 |
| MIDI Loop 步长 | 1/16 小节，最低 1/16 小节 | Web 数值输入步长 1/4 小节，但最低值为 1/16；原生拖动可抵达下界 |
| Cmd+U | 选中起点量化，单次撤销 | Web 无此命令，按 Live 菜单与协调者批准增加 |
| MIDI 网格原点 | 显示、插入、刷写、擦除和量化共用源绝对 beat 0 | 原 Web 随 sourceOffset 移动格点是缺陷。协调者授权修改 A1 相关函数，sourceOffset=0.4、左右半格与极短窗口均有回归 |
| 音频概览条 | 保留 Web 的拖动、双击 fit、方向键平移，高 13 | Live 当前 Sample 视图没有独立对应物，协调者批准保留 Web 行为 |
| 静态帮助段 | 不再占用底部编辑空间 | 控件有名称，快捷键列在本报告与 README；没有声明实现通用 tooltip 系统 |
| DSP 范围 | Start/End、Loop Position/Length、Warp/Mode、Source BPM、Transpose、Detune、Reverse 都是元数据 | 协调者明确批准保持 Web 范围，C1 尚未处理这些字段的播放语义。Reverse 波形只是显示预览。规格“偏移”对应已有 Start/End 和 Loop 字段，未新增 sourceOffsetBars 编辑 |

## 与 Live 对比

只读观察，没有在 Live 中点击、拖动或输入。MIDI 与 Audio Clip 的切换由协调者代为完成。参考截图来自 1920×918 的当时桌面；原生验收时桌面为 1920×1080。`scale=0` 表示未知，不把 AX 单位擅自换算成物理像素。

| 产品规则 | Live 实测证据 | 本实现证据 | 结论 |
| --- | --- | --- | --- |
| 一个底部 Clip 编辑器按内容切换 | `live-midi-editor-zoom` 与 `live-audio-sample-zoom` 显示不同编辑器 | 四种组合的 `*-midi-default`、`*-audio-default`；类型分派行为测试 | 一致 |
| 编辑器在底部，不是点击弹层 | Live `Clip 细节` group，MIDI 高 229 AX 单位 | `ClipEditorSlot`、Footer render slot；本 demo 没有编辑弹层 | 挂载契约一致，完整 Footer 集成由组合根验收 |
| 紧凑控件 | Live Fold 36×14，BPM 40×14，标题行 16 | 本控件高 13，MIDI Fold 23×13，BPM 38×13 | 同量级；宽度随标签不同 |
| 琴键、标尺、力度通道 | Live 音符左缘 392 减编辑器左缘 338 得 54；ruler 34；velocity 约 40 | `midiKeyWidth/midiRulerHeight/midiVelocityHeight`，AX 与图 | 一致 |
| 音频标尺带 | Live `循环选区 e514` 高 39 | `audioRulerHeight=39`，图与 marker bounds | 一致 |
| Source Start/End、Loop 独立 | Live AX 分别列出起始点、结束点、循环位置、循环长度 | 原生标记与参数行为测试，不改 Arrangement 位置 | 语义一致；未在 Live 修改验证事务 |
| 数值居中且宽度稳定 | Live 源位置分段，每段约 25×11，BPM 40×14 | `audio-measurements.json`、各 `*-preedit`、`*-edit` 图 | 结构不同；本实现为整串 DragPad |
| 悬停滚轮、相对拖动、光标恢复 | Live 只读观察无法验证 | 本轮力度 50→60、wheel 60→59→60，Gain -3→-3.1；使用共享 nativeCursorLock | Live 动态未验证；本轮未独立测量光标恢复位置 |
| Space 只播放 | Live 没有发键输入 | 原生 grid 与聚焦 Button 的 Space 前后状态，行为测试 | Live 未验证；本实现通过 |
| 折叠、缩放、选择与命中 | Live 有 Fold 与 Notes 视图，截图 | 本轮 Fold、Draw、方向键、拖动、双击、框选与裁剪测试 | 外观有对应；Live 动态未验证 |
| 参数菜单四向定位与保持打开 | Live 未操作菜单 | Warp 模式上方菜单、共享 Dropdown；截图 `warp-menu-open` | 本菜单上方已验证，其余方向是共享控件能力，Live 未验证 |
| 主题与语言 | Live 当前深色中文 | 本实现深浅各中英四种组合 | 非一对一主题对照，四组合均取证 |
| Pattern 刷步 | Live 没有此项目的 Pattern 编辑器 | `pattern-stroke-on.ax.txt` 中 Step 1–6 均 on，undo 图恢复 | Live 无对应 |
| Header 同表面，无卡片 | Live Clip 标题与参数连续表面 | 根与 Header 均 `theme.colors.muted`，连续面板截图 | 一致；编辑网格是独立功能区色 |

关键参考图：[Live Sample](evidence/2026-10-15-live-audio-sample-zoom.png)、[Live MIDI](evidence/2026-10-15-live-midi-editor-zoom.png)、[Live 参数](evidence/2026-10-15-live-midi-params-zoom.png)、[未缩放并排图](evidence/2026-10-15-live-native-audio-comparison.png)。并排图不作尺寸换算依据，量值以 AX 原始 bounds 为准。

## UI 规范第 13 节

| 检查 | 观察结果与证据 |
| --- | --- |
| 每个控件每个状态放大图 | `*-default` 覆盖三编辑器的默认状态；音频 10 个数值字段分别有 `*-hover`、`*-preedit`、`*-edit`；MIDI 工具栏逐按钮有 `control-*-hover/focus`；Fold/Draw active、notes-selected、velocity-edit/committed、warp-menu-open/disabled、pattern on/undone。每个状态文件均有同名前缀 `-zoom.png`。拖动按下态没有对每一个同族实例分别截图，不声称这项穷尽了所有瞬时状态 |
| 间距同 token | MIDI Zoom out x=508,w=13，Zoom in x=523，gap=2，等于 control-gap。音频 Source BPM y=452,h=13，Gain y=469，gap=4，等于 track-gap。原始数据在两份 `*-measurements.json` |
| 居中 | 数值用共享 NumericPad 文本居中；`velocity-preedit/edit` 与每个音频字段放大图中字号、图标隐藏策略不变。名称与文本边界见 AX |
| 同组等高，图标正方形 | Zoom/Close 都 13×13；Loop 数值 54×13、Velocity 22×13；音频数值高均 13，符合 `--spacing-control-track=13` |
| 紧凑感 | Live 常见控件高 14，本实现 13；参数无卡片 padding，字段 gap=2 或4；源标尺带 39。比较图保留两边原始截图，不靠拉伸制造一致 |
| 深浅、中英 | `dark-en-*`、`dark-zh-*`、`light-en-*`、`light-zh-*`，每组都包含 MIDI、Audio、Pattern 完整与放大图 |
| Tab、焦点、Space | 本轮 grid→Velocity→demo选择按钮，AX focused 可见；工具栏逐控件 focus 图；Space 在 grid 与 Button 聚焦时只切换 transport；Name Input Space 只输入文字的永久测试 |
| 拖动、滚轮、菜单 | MIDI move/resize、Draw stroke、marquee、velocity DragPad/杆；Audio marker 与 gain；Pattern brush。Warp 菜单截图证明打开与禁用。含可调控件 popup 不在本切片，没有冒称验证 |
| 可见范围裁剪与性能 | 固定种子布局性质测试、真实 TestRoot 音符 culling，128-pitch 工程只挂载可见行的音符；真实窗口 frame stats 见下表。无 JS 动画或走带定时器 |

真实窗口发现后修复：深色琴键反色、note ink 在明暗主题下的对比、展示子节点拦截 mouseDown、Pattern AX 开关态、音频标记方旗改为三角。修复后重拍四组合并再次验证命中。MIDI blur 在原生预览重绘中暂时为 null 的回归由行为测试捕获；只在焦点明确移至另一元素时取消，窗口失活仍走注入订阅。

### Pressed 状态替代验收矩阵

协调者明确批准工具限制例外。真实窗口 pressed 帧全部标为未验证，不能把 selected、active 或松开后的图替代。以下测试通过真实 TestRoot 的 mouseDown、move、mouseUp 保持输入阶段并读取工程状态、保留样式与布局；Button 的 native active refinement 是样式声明断言，不是 GPU 像素取样。

| 族 | 代表实例 | 按下、释放断言与证据 |
| --- | --- | --- |
| Button | MIDI Fold | 13 高、按下期间尺寸不变、native active refinement 与默认不同，松开才 latch；`pressed-families.test.tsx` |
| DragPad | MIDI Velocity | 拖动态 fill 改变、尺寸不变、松开恢复非拖动 fill；共享 G1 的释放坐标读回见 [G1 AX](../../../ui/controls/DragPad/evidence/press-anchor-restored-2026-10-15.ax.txt)，按下和读回均 `(412,293)`，0pt；不是本轮测量 |
| 菜单项 | Warp 的 Tones | 原生高亮状态和按下尺寸保留，松开选择后菜单关闭；`pressed-families.test.tsx` |
| 琴键 | E3 | mouseDown 的 sounding fill 与默认不同，松开恢复，宽高保持；`pressed-families.test.tsx` |
| 标记 | Audio Start | 按住移动时位置改变、宽高保持，松开提交，undo 恢复位置；无独立 pressed 颜色，不伪造颜色变化 |
| Pattern | Step 1 | mouseDown 即产生 on 填色，宽高保持，松开后 on 持续，undo 恢复；它是持久选择态而非瞬时按钮 |

族内其他实例由交互、禁用、参数与几何回归覆盖。此矩阵未逐实例穷尽，也没有取得真实窗口按住帧。

## 实际运行与门禁

| 工作目录 | 命令 | 结果 |
| --- | --- | --- |
| 根 | `pnpm install --frozen-lockfile` | 通过，使用固定 gpuix vendor |
| 根 | `node scripts/gpuix-main/check.mjs` | 通过，最终包含 H1 window-appearance-close 和 F2 context-menu 补丁；同步后 `pnpm install --offline` 通过 |
| 根 | `pnpm native:build` | 通过，最终 H1 主干依赖重建通过 |
| 根 | `cargo check` | 通过，只有 workspace profile 基线提示 |
| 根 | `cargo test` | 49 passed，4 suites |
| `apps/gpuix` | `pnpm exec tsc --noEmit` | 通过。根目录另一 TypeScript 6 的 `tsc --project` 曾报 baseUrl 弃用；正确入口是应用锁定的 TypeScript 5.9 工具链，不改配置消警告 |
| `apps/gpuix` | `bun test src/project/sections/clip-edit src/project/model/midi-editing src/project/model/midi-notes.test.ts --randomize --seed 20261015` | 100 pass，0 fail，157440 assertions，21 files |
| `apps/gpuix` | `bun test` | 951 pass，1 fail，953 tests，146 files。唯一失败 `secondary click on an interactive title opens its track context menu`，报 `Missing track-color-2-3-audio`。协调者批准按外部已知失败报告，不跳过测试 |
| 根 | `pnpm exec eslint apps/gpuix/src/project/sections/clip-edit apps/gpuix/src/project/model/midi-editing` | 通过 |
| 根 | `node scripts/gpuix-review-scan.mjs` | 6678d64 后 0 HARD、2 WARN。误报 process.exit 的 xit 正则由协调者修，未在本切片绕过 |
| `apps/gpuix` | `bun src/project/sections/clip-edit/verification/mutations.mjs` | baseline 0 fail；30 项全部 KILLED，源文件恢复校验通过 |
| `apps/gpuix` | `bun --hot src/project/sections/clip-edit/demo/index.tsx` | 真实窗口与真实后端，深色英文完整交互。其他三组合通过环境变量另开命名 service，截图后即关闭 |
| 根 | commit hook `ultracite fix` | 实现与删除提交均通过，没有 `--no-verify` |

### 真实 renderer frame stats

从 Demo 的 `renderer.getDebugFrameOverlayStats()` 取得，不是 JS timer 计数。窗口 1100×420 内容区，原生标题栏使 AX 窗口外包框高 448。

| 阶段                      | frames/samples | current ms | p90 ms | p99 ms | max ms |
| ------------------------- | -------------: | ---------: | -----: | -----: | -----: |
| 默认 MIDI                 |              9 |      8.996 |  8.996 |  8.996 | 26.527 |
| MIDI 选择、模式与数值交互 |             34 |      1.308 |  4.513 |  8.996 | 26.527 |
| Audio 数值与菜单截图后    |            158 |     10.472 | 14.375 | 32.774 | 41.792 |
| Pattern 刷步后            |            178 |      0.604 | 14.375 | 32.774 | 41.792 |

这些是交互期间累计统计，不是大量轨道压力测试，也不证明最坏情况下恒定帧率。

### 变异检查

`bun src/project/sections/clip-edit/verification/mutations.mjs` 先跑基线，逐项修改、运行、恢复源文件，并校验 SHA-256 恢复一致。

| 变异                                | 失败用例数 |
| ----------------------------------- | ---------: |
| 量化忽略选择集合                    |          2 |
| 量化用 floor 代替 nearest           |          1 |
| 量化不移动音符                      |          2 |
| 移除音符纵向视口裁剪                |          1 |
| MIDI 已消费键泄漏到 region          |          1 |
| 名称字段把快捷键路由到 project undo |          2 |
| 稳定峰值忽略后端 generation         |          1 |
| viewport 忽略 Fold 收缩             |          1 |
| 指针选琴键仍留琴键焦点              |          2 |
| 力度杆键盘调整失效                  |          2 |
| 破坏性命令中断 move                 |          9 |
| Marker nudge 提交当前 drag          |          1 |
| 插入用窗口相对网格                  |          1 |
| 刷写网格随裁剪窗口移动              |          2 |
| 擦除网格随裁剪窗口移动              |          2 |
| 量化目标随裁剪窗口移动              |          1 |
| cell 命中用窗口相对原点             |          1 |
| 显示网格随裁剪窗口移动              |          1 |
| 刷写丢弃左侧半格                    |          2 |
| 极短窗口插入越过右边界              |          1 |
| 擦除删除左侧隐藏音符                |          1 |
| 擦除删除右侧隐藏音符                |          1 |
| 绘制只检测格点起点占用              |          2 |
| 绘制被左侧隐藏音符阻挡              |          1 |
| Button 松开后 latch 不反映          |          1 |
| DragPad 拖动态填色被覆盖            |          1 |
| 按住琴键保持 idle 填色              |          1 |
| 按住 Pattern 保持 idle 填色         |          1 |
| 按住标记位置不动                    |          1 |
| 菜单松开时丢弃选择                  |          1 |

## 自审结果

独立 Standards 与 Spec 审查使用两个只读 `pstack-reviewer`，修复后由原审查代理复核。完整 diff 命令是 `git diff gpuix-migration...HEAD -- apps/gpuix/src/project/sections/clip-edit apps/gpuix/src/project/model/midi-editing apps/gpuix/src/project/model/midi-notes.ts apps/gpuix/src/project/model/midi-notes.test.ts apps/gpuix/src/features/waveform-automation`。原始提交与修复提交见本文开头；以下表保留发现、分类、处置与证据。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| 速度杆手柄、Pattern 步、标记旗、文字遮挡输入 host | 必修 | 每层纯展示明确 pointerEvents none；真实输入与永久回归通过 | `MidiEditor.test.tsx`、Pattern/Audio behavior tests、`pattern-stroke-on.ax.txt` |
| 原生预览重绘 blur 暂时报告 null，误取消新拖动 | 必修 | 只取消明确转移至别处的焦点，失活走原生订阅 | move、undo-during-drag、switch-clip 回归重新通过 |
| 稳定 peak reader 不随后端会话、速度和拍号失效 | 必修 | generation 同时包含 session、phase、pending、acceptedRevision、tempo/meter；已修复 | `SourceWaveform-runtime.test.tsx` 使用真实 native 后端、真实 WAV 与稳定 reader，测量峰值列高度；对应变异 |
| MIDI resize 与 Fold 音高收缩后 scroll 超界 | 必修 | 保留水平音乐位置并重新 clamp；已修复 | `viewport-behavior.test.tsx`，64 行实际溢出后缩成一行，移除 clamp 变异失败 |
| 琴键指针选行后编辑快捷键失效、逐杆力度键盘丢失 | 必修 | 指针路径恢复 grid 焦点，键盘 Enter 保留琴键焦点；可见力度杆可 Tab、上下键调整 | `keyboard-reachability.test.tsx` 与 2 项对应变异 |
| MIDI drag 中破坏性命令混入当前事务 | 汇报仲裁后必修 | 协调者选择消费并忽略 Delete/Cut/Paste/方向键/D/U，松手才提交当前 move；已修复 | `gesture-shortcuts.test.tsx` 的 10 个命令及 Escape 回归，移除保护变异 9 fail |
| Marker drag 中方向键提前提交并遗留 active pointer | 必修 | 先取消 pointer，读还原后的权威 clip，再独立执行 key nudge；已修复 | `marker-shortcuts.test.tsx`，移除 cancel 变异 1 fail |
| 非对齐 sourceOffset 的插入、刷写与显示格点原点不同 | 汇报仲裁后必修 | 协调者授权以源绝对 0 对齐模型与 UI，窗口仅裁剪；已修复 | `grid-phase.test.ts`、`grid-phase-interaction.test.tsx`，含短窗口与半格变异 |
| 首尾半格误删不可见保留音符或错误阻挡绘制 | 必修 | 擦除先筛源窗口交集，绘制占用按 cell 的可见交集；已修复 | `visible-cells.test.ts` 5 个回归，4 项左右边界变异 |
| 严格逐实例 pressed 帧缺失 | 汇报仲裁 | 经过工具失败与释放后图复核，协调者明确接受真实窗口 pressed 未验证，改用测试与变异；不冒充已取证 | `pressed-families.test.tsx`，6 个族、6 个变异；下方矩阵；共享 G1 光标读回 |
| DSP 与规格“偏移”边界不明确 | 汇报仲裁 | 协调者批准所有 audioSettings 只迁元数据，“偏移”对应原有字段，不加 SourceOffset | 本文 DSP 行与未实现表，未修改 C1/backend 契约 |
| 跨切片 B-key owner、clipboard、active observer、region key | 汇报仲裁 | 环境全部由组合根提供，onRegionKey 根事件方案获批准 | README 公共契约，键盘隔离测试及两个对应变异 |
| PeakColumns 与 lane 重复风险 | 汇报仲裁 | 协调者添加 shared/waveform；两边只用同一 renderer | SourceWaveform 只查询与变换，复用 PeakColumns |
| scanner 将 process.exit 误判为 xit | 汇报仲裁 | 协调者主干 6678d64 修正，scan HARD 归零 | 最终扫描 0 HARD |
| WARN 旧 waveform demo 的 5 个裸尺寸 | 记录 | 仅删除其波形段，不顺手重写仍属其他切片的 Automation demo | scan 与 coordinator 接受 |
| WARN 新 demo 的 1100×420 | 记录 | 测试窗口尺寸，不是产品控件度量；保留 | scan 与 coordinator 接受 |
| tracks 嵌套右键基线失败 | 汇报仲裁 | 不越界改，不 skip；协调者批准外部已知失败交付 | 最终完整 bun test 951/1 |

## 未实现或未验证

- C1 尚无 MIDI synthesis；琴键调用的是共享 held-note 端口，不代表已有 MIDI 音频合成。Start/End、Loop Position/Length、Warp/Mode、Source BPM、Transpose、Detune、Reverse 仅编辑元数据，播放尚未响应。这一范围获协调者明确批准。Gain、淡入淡出、Arrangement 位置和保留源偏移使用 C1 已有播放路径。
- 所有组件族的真实窗口 pressed 帧均未验证。`computer` 的 display 截图报 `InvalidCoordinateFrame`，外层并行调用报 `Computer worker is busy`，单个 run 的拖动阻塞截图；一次看似 pressed 的 Button 图经状态复核实际为释放后，已改名 `button-hold-attempt-after-release`。协调者裁定接受工具限制，改用原生测试断言按住状态、样式声明、尺寸及释放行为，并做变异。未逐实例穷尽。
- 没有在 Live 发动态输入。因此 Live 的滚轮、拖动、Space、菜单保持打开行为仍列未验证，只有只读截图和 AX 对照。
- Footer、App-shell 组合与 `ClipEditorSlot` 最终统一由协调者合入时完成，本切片没有第二个应用组合根。

## 错题与已验证做法

- 错：把 `pointerEvents: none` 当成对子节点的递归保证。对：绝对定位的每层展示元素明确不命中。因：带填色的子 hitbox 能阻断父 host。证据：力度杆与刷步真实命中回归。
- 错：在每次 blur 通知无条件回滚。对：用 renderer 的明确焦点转移判定元素离焦，窗口失活用唯一原生订阅。因：预览重绘会短暂报告空焦点。证据：原生拖动回归先红后绿。
- 对：绘制和命中共用 `visibleNoteRects`，框选保存内容坐标原点，不随逻辑滚动改变。
- 对：用 native TestRoot 抓到 DOM 迁移后的事件差异，再用真实窗口确认；不把纯逻辑测试或 AX 存在当成完整视觉验收。

## 进程清理

每个验证窗口都用带名称的 service 启动。03:55 到期窗口于 03:52 提前关闭。补 pressed 时段遇到工具阻塞，唯一按住尝试返回于 04:48:30，超过 04:48 期限 30 秒，窗口随即关闭并如实报告；设置的异步到期清理在工具忙时没有严格执行。没有继续发送输入，也没有把释放后的图冒称 pressed。

实际执行：

```sh
ps -axo pid,etime,command | grep -E 'bun .*--hot|cargo run|gallery|demo' | grep -v grep
```

输出为空，管道退出码 1，表示没有匹配残留进程。没有停止用户既有应用或 Live。
