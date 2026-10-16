# sections 只读审查

范围：`apps/gpuix/src/project/sections/{clip-edit,footer,browser,transport}/**` 当前实现，以及确认问题所需的 model、adapter、共享控件和 app 消费点。未深审 demo / verification / evidence。已读 AGENTS、LESSONS、gpuix 架构、UI 规范、modules、stores/adapters 与各 section README，并对照已完成架构审查排除重复项。

本次仅静态调用链审查：未执行测试、构建、安装或 UI 启动；没有修改仓库。下列操作序列由代码可确定推导，不冒充桌面实测。已知 F7、metadata-only DSP/warp/pitch 和 Browser 演示目录/禁止放置不计为缺陷。

## Findings

| id | sev | location | problem | evidence | suggested fix |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | P1 | `apps/gpuix/src/project/sections/clip-edit/midi/useMidiEditor.ts:350-357`；`midi/clipboard.ts:8-29` | 大选区 Cut 会删除音符，却生成自己的 Paste 必定拒绝的负载。超过 2048 个音符时 Cmd+X 后，Cmd+V 无法恢复；Copy 同样悄悄失效。 | Copy/Cut 无条件 `serializeNotes(...)`、写剪贴板，Cut 随即 `deleteNotes(...)`；serializer 没有数量/大小限制。消费端 `parseNotes` 拒绝 `value.notes.length > 2048` 或 `text.length > 250_000`，Paste 遇 `!copied` 直接返回 false。Cmd+A 没有 2048 上限；README 明确支持 10000-note 压力工程。2049 个普通音符足以确定触发数量分支，不依赖系统剪贴板容量。 | 统一生产端与消费端契约，使合法大选区完整往返；若必须限制，在任何删除前验证负载并明确反馈失败，不能先 Cut 后拒绝自己的数据。覆盖 2049-note 和字节上限的 Copy/Cut/Paste 行为。 |
| SEC-02 | P1 | `apps/gpuix/src/project/sections/clip-edit/midi/useMidiEditor.ts:85-106`；`project/model/midi-editing/operations.ts:13-14` | 选择按数组下标存储，Undo 恢复被删除的前序音符后，选择无声转移到另一音符；后续 Delete、移动、力度修改作用于错误对象。 | selection/current 持有 indices；notes 更新时只执行 `validSelection(clip.notes, selected)`，后者仅检查下标存在。序列：`[A,B]` → 删除 A 得 `[B]` → 点击 B（选择 `[0]`）→ Cmd+Z 恢复 `[A,B]`。同一 Clip ID 的编辑器不重挂载，选择 `[0]` 现在指向 A；下一次 Delete 删除 A，不是用户刚选中的 B。Undo 分支未重映射或清理选择。 | 以稳定音符身份持有 selection/current，再为渲染和 model API 派生下标；无 ID 的旧数据在既有边界归一化。至少在结构性历史恢复时清除无法确认身份的选择，而不是把下标绑定到新对象。补上述 Undo 后继续编辑回归。 |
| SEC-03 | P1 | `apps/gpuix/src/project/sections/clip-edit/midi/useMidiEditor.ts:154-168` | 横向滚动期间移动/拉长音符仍只按窗口指针位移计算时间差，忽略视口滚动；音符脱离指针，提交位置或长度不包含已经滚过的距离。 | `content()` 计算窗口坐标减 origin 再加 scrollX/Y，`begin()` 保存 content-space `active.start`；但 move/resize 的 `beatDelta` 只用 `event.x - active.press.x`。`MidiEditor.tsx:62-64` 允许按住鼠标时 Shift+wheel 改变 scrollX，没有结束手势。例如 width=800、totalBeats=8，按下后横向滚动 100px，再仅移动指针 1px，当前逻辑时间差仍为 0 beat，而源坐标已改变约 1 beat。纵向 pitchDelta 却使用了滚动后的 content，两轴不一致。 | 从统一的 source/content 坐标计算时间差；缩放不变时应包含 `point.x - active.start.x`。同时定义拖动中缩放的重基线或取消策略，避免分母变化产生跳动。覆盖 move/resize 中 Shift+wheel，release 仍为一条 Undo。 |
| SEC-04 | P1 | `apps/gpuix/src/project/sections/browser/index.tsx:230-234`；`:338` | R1c 的 roving-focus 修复仍漏掉搜索 Escape 路径：有结果时把焦点放到 tabIndex=-1 的树容器，而非有效行，下一次 Tab 从窗口起点重新遍历。 | Escape handler 清空 query 后执行 `focusElement(tree.current.id)`；树在非空结果时为 -1。README 规定有结果时有效行是唯一 0、树为 -1；UI 规范 §9/LESSONS 已记录 GPUI 从 -1 节点 Tab 会回到窗口开头。现有测试覆盖正常结果行 Tab、筛选恢复，没有 Search Escape→Tab。这是已修入口的遗漏调用路径，不是重报原初始 Tab 问题。 | 清空查询提交后聚焦新结果集的 roving 行；只有空结果才聚焦树。也可保留搜索焦点，但不要聚焦 -1 容器。补搜索→Escape→Tab 原生键盘回归。 |
| SEC-05 | P2 | `apps/gpuix/src/project/sections/transport/PerformanceStatus/index.tsx:59`；`transport/labels.ts` | 性能弹层把 backend phase 的内部英文值直接显示给用户，绕过 Transport 注入式 i18n；中文界面仍显示“引擎: ready/failed/recovering”。 | 显示代码为 `` `${labels.engine}: ${phase}` ``，phase 来自 session.backend.phase，没有 label 映射。TransportLabels 提供 engine/unavailable 等翻译但没有 phase labels；app 的中英文 Labels 切换不能翻译此状态。违反 UI 规范 §4 中英文契约，也不是 lint 能发现的字面量问题。 | 提供完整的注入式 BackendPhase 本地化标签映射，中英文组合根覆盖所有 variant；协议值仍作为内部类型，不在共享层引入 app i18n。 |

## Checked, no issue

以下是已读代码内未再发现可确认缺陷，不表示执行过测试或视觉验收。

- **ClipEditor/生命周期**：audio/MIDI/pattern 三种分派互斥；Footer 消费唯一 ID-only ClipEditorSlot。Clip ID key 切换卸载旧编辑器，useProjectEditGesture 的清理取消未完成事务，没有第二份工程 owner。
- **MIDI 命令与 held-note**：读取 useMidiEditor、MidiEditor、NoteGrid、VelocityLane、PianoKeys、viewport/layout/clipboard，以及相关 keyboard tests。笔画中 Delete/Cut/Paste/Duplicate/Quantize/方向键被阻断；grid 的 Escape/Cmd+Z 取消手势；draw/erase 使用源绝对网格。力度 numeric/pointer 复用事务。琴键具备 noteOff、失活和卸载清理，既有测试覆盖指针在琴键外 release，不把该已覆盖路径重报为泄漏。
- **MIDI 绘制**：可见 note rect 共用于命中和绘制；QuadPaint/usePaintLayers 经唯一 QuadBatch 上传，子视图卸载解除 controller 绑定。未重报已知 F7。
- **Audio**：读取 AudioParameters、SourceMarker/markers、source-view、AudioWaveform、view owner、rulers/layer/overview、SourceWaveform。Start/End、source 裁剪、loop、Arrangement placement 分离；marker 键盘 nudge 先取消 pointer 事务并读取还原后的权威 Clip。峰值缓存随 session/phase/pending/revision/tempo/meter generation 失效，主波形和 overview 共用 reader/PeakColumns，无第二套波形实现。metadata-only 能力按已批准限制处理。
- **Pattern**：源周期及负偏移 phase、sourceIndex 模运算一致；geometry 共用于命中、裁剪、键盘 reveal；brush 读取当前权威 steps、单笔事务；Escape/失活/拖动中 Undo 取消。未发现额外崩溃或监听泄漏。
- **Browser 其它路径**：focus 与 selected resource 独立；方向键只移 focus，Enter/click 选择；筛选按上下文保存展开，来源历史保留 query、重置 kind。有效行和空结果分别拥有 Tab 入口，favorite/展开按钮不进入 Tab 链。演示 catalog/禁止放置不列问题。
- **Footer/设备**：view/collapsed 受 shell 控制；Device 与 Clip 内容互斥，收起卸载。设备 collapsed/enabled/参数走工程命令，参数采用注入 locale；读取 EffectChain、DeviceCard、ParameterControl、DeviceDisplay、editDevices。重排 release 提交，Escape/blur/失活取消。app 保持 Browser/Arrangement 树位置，未发现切页丢失 Browser 局部状态的新回归。
- **Transport**：数值用共享 DragPad 事务；BPM/meter 命令校验 finite、取整/夹取；位置、play/record/loop 使用唯一 adapter state。metronome 从 position 派生，Tap Tempo 无 timer；PerformanceStatus 读接受的 telemetry/sample clock/latency，无假 CPU 值或 JS 定时链。未将非 2 次幂 denominator 当作未经产品契约证明的缺陷。
- **主题/i18n/职责**：检查四区实际布局的 theme token 与 labels 路径。未重复报告 lint 已强制的问题，未仅凭文件行数要求拆分。AudioWaveform 的 S1 controller/rulers/layer/overview 拆分已在当前代码生效。

## 建议后续验证（本次未运行）

在现有 section 行为测试中补 SEC-01～04 的操作序列；SEC-05 覆盖中文性能弹层各 phase。由主协调者在修改全部落地后统一运行针对性 Bun 测试，再按原生键盘和真实窗口要求验证滚动拖动及 Escape→Tab；无需为本次静态可证问题启动额外 vendor/native 构建。
