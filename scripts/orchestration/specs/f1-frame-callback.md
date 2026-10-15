# F1 renderer-patches:给固定主干打补丁(窗口帧回调、输入框聚焦全选)

## Target

Worktree `gpuix-f1-frame-callback`(子 worktree)。**基线必须含 D1**:D1 还没合入,所以本切片**等 D1 合入后再开工**(协调者在 D1 合入后派发,届时基线 = 含 D1 的 gpuix-migration)。

## 背景

gpuix 的 React/native 层没有帧回调。需要逐帧推进的地方有:拖动到边缘时的自动滚动(web 用 `requestAnimationFrame` 重算 preview)、电平峰值保持的缓慢下落、播放头跟随、后续可能的惯性滚动。目前只能用 JS 定时器近似,既不与显示刷新对齐,也会在窗口不可见时空转。GPUI 本身有 `Window::request_animation_frame` 与 `on_next_frame`(`zed/crates/gpui/src/window.rs`),只是 gpuix 没有暴露。

## Change

1. 沿用 D1 建立的补丁机制:在固定主干的干净 vendor checkout 上做一个**最小补丁**,放 `scripts/gpuix-main/patches/frame-callback.patch`,由 `build.sh` 按序 `git apply`,`check.mjs` 校验已应用。**不得改 zed 子模块**(A6 的关闭拦截已证明 renderer 层补丁足够);只在 `packages/native/src/renderer.rs`、`packages/native/index.d.ts`(及必要的 `packages/react` 导出)。
2. API(同步风格,与 `setWindowShouldClose` 同类):
   - `setAnimationFrameCallback(callback: ((timestampMs: number) => void) | null): void` 与 `setAnimationFrameActive(active: boolean): void`。active 为 true 时,GPUI 每个显示帧调用一次 callback(`timestampMs` 为单调毫秒);为 false 时**不请求下一帧**,窗口空闲时零帧开销。callback 必须同步返回、不得重入变更 GPUI(与 close-guard 的约束一致,写进类型注释)。
   - React 侧一个小 hook `useAnimationFrame(callback, active)`:在 active 期间订阅,卸载或 active 变 false 时取消;不在 `ui` 层暴露,放 `platform/` 或 `shared/`,保持 `ui` 不 import `platform` 的层级规则。
3. 把已有的近似替换掉(清洁切换):峰值保持的 `MeterDecayDriver`(若 tracks 已合入则替换其定时链;未合入则在报告里列出替换点)、`clip-lane` 的自动滚动(若已合入)。**同一时刻每处只保留一种 owner**。
4. 实测:窗口前台时 callback 频率 ≈ 显示刷新率(记录实测 Hz),被遮挡/最小化时是否停止(记录);`active=false` 时 `getDebugFrameOverlayStats().frames` 不增长;长时间 active 的 CPU 占用。不得凭记忆下结论。
5. 上游:补丁很小且通用,在报告里附一份可直接提给 remorses/gpuix 的 PR 说明草稿(不提交远程,等用户决定)。

## Constraints

- 拥有路径:`scripts/gpuix-main/patches/frame-callback.patch`、`scripts/gpuix-main/{build.sh,check.mjs,config.json}`(仅补丁登记)、`apps/gpuix/src/platform/frame/**`(或 shared,二选一并说明)、`docs/research/gpuix-main-build.md`(「集成」一节追加)。
- 不动 `ui/**`、`project/**`、`crates/**`(我们自己的 native crate 与此无关,补丁针对 vendor)。不新增依赖。不 push,不碰 `main`,不碰其他 worktree。
- 构建很重(干净构建约 400 秒):**不要重复做干净构建**,用增量(约 70 秒);进程清理强制,`worker_done` 前 `ps` 零残留。

## Observable acceptance

- 补丁在干净 checkout 上 `git apply --check` 通过,`build.sh` 一次构建成功,`check.mjs` 报告补丁已应用。
- `tsc --noEmit`、`bun test`、`pnpm exec eslint apps/gpuix/src/platform` 通过(贴命令与计数);用注入假帧源测 hook 的订阅/取消/active 切换语义,并有变异检查(去掉取消、active=false 仍请求帧→测试失败)。
- 真实窗口:一个只显示逐帧计数的小探针,记录 Hz、遮挡/最小化行为、active=false 零帧;验证完立刻关闭。

## 追加:输入框聚焦时全选(与帧回调同一个补丁批次,共用一次构建)

clip-lane 的 Clip 名称编辑器与 Automation 数值编辑器,web 原行为是『打开即聚焦并全选,再输入替换』。gpuix 主干的原生输入框(`packages/native/src/custom_elements/input.rs`)已有 `SelectAll` 动作(约 959 行 `select_all`)与三击全选,但没有『聚焦时自动全选』的声明,JS 也没有设置选区的方法;不能用 OS 假键盘(发 Cmd+A)绕。

1. 补丁 `scripts/gpuix-main/patches/input-select-all-on-focus.patch`:给 `<input>`/`<textarea>` 加布尔 prop `selectAllOnFocus`(默认 false,不改既有行为)。在输入框获得焦点(键盘/程序聚焦,`autoFocus` 也算;**鼠标点击聚焦不触发**,点击应按平常放置插入符)时调用既有的 `select_all`。同时更新 `index.d.ts` 与 react 侧 `InputProps`/`TextareaProps` 类型。
2. 实测:`autoFocus + selectAllOnFocus` 的输入框打开即全选,直接输入替换;Tab 进入时全选;鼠标点击进入不全选;`readOnly`、失焦再聚焦的行为;用 `createTestRoot` 能测的部分写测试,测不了的用真实窗口 AX(选区文本)证明。
3. A3 的 `ui/controls/Input` 暴露该 prop(控件层透传,不新增第二套);clip-lane 的两个编辑器此后改用它。该控件改动属于 `ui/controls`,在本切片范围内批准。
4. 上游:同样附 PR 说明草稿,不提交远程。
