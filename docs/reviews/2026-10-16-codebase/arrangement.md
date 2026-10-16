# Arrangement 只读审查

审查当前 `apps/gpuix/src/project/sections/arrangement/{core,tracks,lane,timeline}`，并追踪 app composition、ClipEditor 和 runtime 的直接调用链。已读取根 AGENTS、LESSONS、gpuix 架构、UI 规范、modules、Arrangement 组合契约和旧审查记录。没有修改仓库、执行测试或构建、启动窗口。`git diff --stat -- apps/gpuix/src/project/sections/arrangement docs/architecture/gpuix-arrangement-composition.md` 无输出。

以下为源码确认的缺陷或具体性能成本。复现步骤是可运行的验证建议，不代表本次实际执行过。未重新报告已经修好的摘要宽度、双摘要路径、网格打包、edge-scroll、timeSelection preview 覆盖，也不报告已知 F7。

## Findings

下表位置均相对仓库根，`arrangement/` 指 `apps/gpuix/src/project/sections/arrangement/`。

| id | sev | location | problem | evidence | suggested fix |
| --- | --- | --- | --- | --- | --- |
| ARR-01 | P1 | `arrangement/lane/interactions/controller.ts:71-79` | epoch 改变后跳过整个 gesture.finish，遗留 `clipDrag` / `clipResize`。R1b 对时间选区的清理修复没有覆盖另外两类 lane 暂态。 | `if (current.epoch === ...editEpoch) current.gesture.finish(cancelled)` 后仅无条件执行 `setTimeSelectionPreview(null)`。但 `setClipDrag(null)` 只在 `clip/move.ts:93-97` 的 finish，`setClipResize(null)` 只在 `clip/resize.ts:53` 的 finish。timeline 的 epoch 分支 `timeline/controller.ts:130-137` 不清这些字段。消费者 `lane/render-projection.ts:93-104` 在 `clipDrag` 非空时优先渲染保留的旧 `source` 并禁用普通选择/hover。具体轨迹：开始 Clip 移动并形成 Ghost → hydrate/reset 导致 editEpoch 改变 → 下一次 step / pointerUp / interrupt 跳过 gesture.finish → `clipDrag` 永远非空。保留相同 track ID 的新工程会继续显示旧 source clips；其他工程也会失去普通卡片选择/hover。 | 将不写工程的暂态清理移到 LaneController 的共同 finish 路径，无论 epoch 是否相同都清除 `clipDrag`、`clipResize` 和时间选区预览。旧 token 提交及插入点/选择命令仍受 epoch guard 保护。扩展已有 epoch 回归，覆盖移动与 resize，检查渲染投影而不只检查 session。 |
| ARR-02 | P1 | `arrangement/core/automation/drawing.ts:86-93` | freehand 绘制不覆盖经过区间内的原有自动化点，旧值会在新线条中形成尖峰。回头重画也保留上一遍的非重合采样点。 | freehand 合并仅通过 `cells.every(cell => !(Math.abs(point.bar - cell.bar) < 0.000001))` 删除与新采样时间几乎完全相等的原点，而不是删除绘制区间内的原点。`drawing.ts:54-65` 每约 3px 采样。例如 pxPerBar=24，从 bar 1 到 bar 2 画恒定 value=0.2，采样时刻为 1、1.125、1.25…2；原有 `{bar:1.1,value:0.9}` 不会被过滤。`lane/interactions/automation/preview.ts:11-24` 直接将该合并后的 points 写入 lane，故保存后的曲线仍经过 0.9。 | 用当前笔划覆盖的时间区间替换 original 和先前 painted 中的点，保留区间外的点，再合并新样本。记录覆盖区间或逐段覆盖，避免 exact-time equality 作为擦除规则。回归覆盖不对齐旧点和往返重画。 |
| ARR-03 | P1 | `arrangement/lane/interactions/clip/move.ts:93-97` | 在禁止放置的位置释放仍提交最后一次有效移动/复制。 | `move.ts:48-50,77-79` 在不存在目标、Group/Return/Main 或不兼容 Clip 类型时只设 `valid=false` 后返回，没有清掉 `lastPlan`。cursor getter 在 `:42-44` 返回 `not-allowed`。finish 却只执行 `preview.finish(cancelled |  | plan === null)`，没有检查 valid。`project/model/clip-edits.ts:89-93` 确认不兼容轨道会返回 null。轨迹：将 MIDI Clip 拖到另一个有效 MIDI 位置，再拖到 Audio 或 Group 上释放，旧有效位置的 plan 仍被提交，尽管释放时显示禁止光标。 | 将当前目标无效纳入取消条件，并禁止该次 finish 更新 selectedIds / insertionPoint。最后有效预览可以保留用于视觉反馈，但不能在 invalid release 时提交。测试跨轨 move 和 Alt-copy 的有效→无效→release。 |
| ARR-04 | P1 | `arrangement/timeline/keyboard/controller.ts:98-104` | Clip 编辑区聚焦时 Cmd/Ctrl+S 被直接丢弃，唯一窗口保存 owner 没有处理它。 | `if (target === "clip-editor") return false` 在 `key === "s"` 的保存分支之前。消费路由已经追踪：`app/project/composition.ts:62-68` 通过本次 keystrokeId 将 ClipEditor 的键判为 clip-editor；`project/sections/clip-edit/ClipEditor.tsx:67-80` 只在根处理 Cmd/Ctrl+Z，其余调用 `environment.onRegionKey`，没有保存处理。`ArrangementTimeline/index.tsx:47-49` 收到 false 后也不处理。故在 MIDI grid、音频视图或 Clip 编辑区非文本控件按 Cmd+S，不会调用 saveSnapshot。组合契约 §4 将 Cmd/Ctrl+S 指定给 timeline。 | 在 clip-editor 的局部编辑快捷键隔离之前处理保存等明确的全局命令，仍保留文本输入和菜单边界。用真实 ClipEditor + composition 的 native key 回归断言 saveSnapshot 引起实际保存状态转换，不只测试 keyboard 方法返回值。 |
| ARR-05 | P1 | `arrangement/lane/ClipCard.tsx:33-42`；`arrangement/lane/LaneRow/index.tsx:71-74`；`arrangement/tracks/Row/index.tsx:112-116` | 同一个二维编辑面建立了 viewport、每行 slot、每行 lane host 和每个 Clip 的 Tab 入口，违反唯一编辑面 owner 契约。 | UI 规范 §9 明确规定二维编辑面只有一个 `tabIndex=0` owner，行/音符只提供 AX 描述。实际 `ArrangementTimeline/index.tsx:149-152` 的 viewport 已为 0，TrackRow lane slot 又为 0，LaneRow 又为 0，每个非 Ghost Clip 仍是 `tabIndex={card.ghost ? -1 : 0}`。Tab 次数因此随可见轨道/Clip 数量增长；屏外卸载会移除正在聚焦的 Clip，而 `TrackRows/index.tsx:99-124` 只为轨道名称表头保留 focusedTrackId，不保留 Clip 焦点。 | 保留一个稳定的编辑面焦点 owner，行与 Clip 不进入 Tab 顺序，使用该 owner 的编辑命令/选择状态管理活动目标。保留 Clip AX 描述，不再通过每个 Clip 的 Enter 宿主充当额外焦点入口。覆盖多轨多 Clip Tab 退出、滚动后的焦点稳定性。 |
| ARR-06 | P1 | `arrangement/lane/LaneRow/index.tsx:86-115` | Lane 手势没有元素失焦取消入口，焦点离开车道后仍能继续预览并在释放时提交。 | host 有 keyDown/down/move/up/leave，但没有 onBlur。`lane/interactions/controller.ts:168-174` 的 pointerLeave 在 active 时也不取消。已追踪组合根，`app/project/composition.ts:89-91` 只在整个应用失活时调用 lane.interrupt；`ArrangementTimeline` 的 cancelGestures 只取消 rulers/minimap，不取消 lane。具体触发为拖动 Clip / Automation 时按 Tab，将焦点移到另一个原生控件再释放鼠标，pointerUp 仍走 `finish(false)`。UI 规范 §7 要求失焦取消并回滚；相邻 ruler 和 minimap 已实现 onBlur 取消。 | 由稳定的 lane 编辑面 owner 监听失焦并调用 interrupt。跨行移动不要靠卸载某个 source row 来保持输入生命周期；把跨行捕获与取消放在持续挂载的 owner 上。增加拖动中焦点转移后的 preview、document、history 回归。 |
| ARR-07 | P2 | `arrangement/timeline/minimap/index.tsx:53-55,135-168` | 每次播放位置更新都会重新构造整个 minimap 的轨道和 Clip 子树，静态内容的工作量随全工程 Clip 总数增长。 | MiniMap 自己订阅 `session.position`，且同一组件无 memo 的 `rows.map(... track.clips.map(... clipRect ... sx ...))` 每次 render 都执行。轨道与 Clip 数据完全没变的播放位置更新仍遍历全工程、分配全部矩形/style/React elements，随后才更新一个播放头 div。lane 的 memo/cache 无法保护这条独立路径。确认的是 O(total clips) 的重复 React 投影成本，本次没有测量帧耗时，因此不声称已观察到卡顿。 | 将不变的轨道/Clip/marker overview 与位置/viewport/hover 叠加层分开，使静态内容只随 tracks、markers、width、height、bars 变化。可复用 QuadBatch 打包概要，但不为此增加第二套几何模型。用生产组合的 render-cost 路径比较播放头更新前后，记录总 Clip 数和投影次数/耗时。 |

## Checked, no issue

- 组合根只创建一份 TimelineController 和 keyboard；LaneController 消费同一个 SceneStore，窗口键盘在元素之后处理。元素消费时 stopPropagation，未发现本切片新增的重复窗口键盘订阅。
- 时间选区 committed/preview 已分离。setTimeSelection 保留 lane 预览，finish 提交后清预览；已修好的 R1b 行为没有重新报告。ARR-01 是同一清理模型中未覆盖的 clipDrag/clipResize。
- Ctrl/Cmd+1、+2、+4 与组合契约一致；+3/+5 的未实现已在权威契约声明，不作为缺陷。B 的 held override、used 标记、窗口失活释放和电脑 MIDI noteOff 路径已读。
- zoomAtAnchor、wheel/step zoom、minimap body/edge 缩放和 clampScrollX 共享 core 纯函数；滚轮符号在输入边界转换。timeline.setScroll 同步写 scene 后返回接受值，lane / ruler 自动滚动随后才重算手势。
- 垂直轨道几何、ruler/body 边界、Return/Main pinned 行、maxTrackScrollY 与 revealTrackScrollY 使用共享 layout。tracks 与 lane 均使用不含 controlsWidth 的时间宽度，未见旧的重复减宽。
- 折叠 Group 现在始终通过 renderLane 槽挂载，后代 Clip 概要归 LaneContents；没有旧 GroupOverview 第二条渲染路径。
- GridLine→quads 打包与 minor opacity 已统一到 core/rulers/grid-quads；edge-scroll 也已统一到 core/viewport/edge-scroll。网格/ruler tick/pattern region 循环按可见范围限制，而非整首歌的小节范围。
- Lane clip-card 缓存每次清除不再可见的条目，不随历史滚动无限增长。垂直行使用局部内容坐标，ClipContents memo 和局部 grid/content identity 复用仍在。
- WaveformPreview 只请求已裁剪可见范围的原生 peaks，委托唯一 shared PeakColumns/QuadBatch；未复制声道布局、未在 lane 假设采样率、未保留 DOM/Canvas 波形路径。局部坐标在上传 Float32Array 前已经减去 scroll，没有发现由远端世界坐标直接转 f32 引起的精度缺陷。
- Minimap gesture 保存事件按下点的 cursor.capture，越过阈值才 hide，up/cancel/dispose 恢复。ruler/minimap 的 Escape、blur、窗口失活和 epoch 清理入口已读。
- Track resize 使用现有 edit gesture，具备 Escape、blur、窗口失活、卸载取消。Track reorder 具备阈值、释放提交、Escape、窗口失活、epoch 和卸载清理，没有发现第二套轨道重排几何模型。
- Meter provider 共享一个 decay driver；可见 meter 注册和退订 listener，帧源仅在活动时启用。未发现产品 JS timer、遗漏 unsubscribe 或本切片新增的 native handle owner。
- Clip/automation inline editor 的输入键隔离与 epoch guard 已读；没有把文本输入中的 Space 当成播放。此次只确认静态生命周期与路由，不声称通过真实桌面输入或视觉验收。

## 验证边界

这是一份当前代码只读审查，不是历史 diff 审查。没有执行 Bun 测试、renderer 构建、native 构建或真实窗口。全部结论来自上述生产代码与消费端的直接调用链；动态耗时与桌面焦点表现需要主协调者统一验证。未深读 verification/demo/evidence，也未将它们的历史成功记录当成本次测试结果。
