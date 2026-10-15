# G1:DragPad 锚点取按下时刻的原生光标位置

## 问题(已实测)

`ui/controls/DragPad` 在 JS 收到 `mouseDown` 时调用 `cursorLock.capture()`(`@zoeydaw/native` 的 `cursorPosition`)读当前屏幕坐标。若 OS 在 JS 处理 mouseDown 前已处理过一个 move,读到的是移动后的位置:合成输入每步 10pt 时,按下 `(805,364)`,捕获并还原到 `(805,354)`。见 `apps/gpuix/src/ui/controls/DragPad/README.md` 第 17–30 行与 `ui/controls/README.md`「明确保留的限制」。产品规则:松手后光标回到**原始按下的屏幕坐标**,不得出现最后一帧跳动。

## 目标

锚点取**按下事件本身**携带的位置,不取"JS 处理时的当前位置"。不加补偿、不猜、不轮询、不加 CGEventTap(需要辅助功能权限,用户未批准)。

## 先调查,再动手(停点)

1. 读 vendor `packages/native/src`(构建根见 `scripts/gpuix-main/build.sh`,只读)与 GPUI macOS 事件代码:mouseDown 事件里有没有窗口坐标(`locationInWindow`),gpuix 的 `EventPayload` 有没有把它传到 JS(`x`/`y` 字段已存在,确认它们是**事件时刻**的窗口坐标还是处理时读取的)。
2. 确认把窗口坐标换算成屏幕坐标需要什么:窗口 content 原点的屏幕坐标、坐标系(AppKit 左下原点 vs CG 左上原点)、Retina 缩放。查 gpuix/GPUI 是否已暴露窗口屏幕原点;没有的话,`crates/native` 能否不经 vendor 补丁拿到(例如 `NSApp.keyWindow` 的 frame 与 `contentRectForFrameRect`)。
3. **停下来**用 `orca orchestration ask` 汇报:可行方案(优先不改 vendor;必须改 vendor 就给补丁草案与理由)、新 napi 签名草案、坐标换算公式、风险(多显示器、全屏、窗口拖动中)。等协调者 reply 后再实现。

## 实现(批准后)

- Rust:`crates/native`(你拥有 `crates/native/src/cursor.rs` 与新增的窗口坐标模块),必要时新增 vendor 补丁进 `scripts/gpuix-main/patches/` 并登记 `config.json`(这一步改动共享构建,批准后才做;做了要跑 `build.sh` 并通知协调者重建共享 vendor 的时机)。
- TS:`platform/cursor` 的 `nativeCursorLock.capture` 改为接收按下事件(或新增 `captureAt(event)`),`ui/controls/DragPad` 的调用点随之改;`CursorLockPort` 是 `ui` 的公共端口,签名变更要在 ask 里写明并获批。
- 单一 owner:锚点只在一个地方计算,删除旧的"当前位置"路径,不留两套。

## 验收

- Rust 单测覆盖坐标换算(左下/左上原点、2x 缩放、多显示器负坐标)。
- TS 行为测试:按下事件坐标 → 锚点;中间插入 move 不改变锚点。变异:改回读当前位置应失败。
- 真实窗口:画廊 DragPad 用合成"按下即移动"(无停留)路径复测,还原点等于按下点(误差报告到 pt),同时复跑有停留路径。桌面时段先 ask,等 reply;不碰 Live。
- 更新 DragPad README 与 `ui/controls/README.md` 的限制条目(修好就删除限制,保留证据链接)、LESSONS 里光标锁定一节。
- 交付按 `common.md` 自审,`merge_ready`。
