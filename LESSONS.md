# 错题

开工先扫本文。只记录可核实的故障、原因与对应做法；能机械化的已转成 lint、类型或测试，本文只链接权威规则。

## 渲染器与事件

- 窗口键盘事件在所有元素 keyDown 之后触发，同一次按键共享 `keystrokeId`；元素 `stopPropagation()` 会让窗口收不到，窗口 handler 不能阻止元素。工具栏、Transport、表头按钮自己不响应 Space、也不 stopPropagation，Space 才会冒到窗口触发播放；输入框聚焦时只对可打印键 stopPropagation。
- 拖动隐藏光标走 renderer 的相对模式（`beginRelativeDrag`/`endRelativeDrag`），不在 JS 里换算屏幕坐标：JS 处理事件时 OS 光标已经又动过，任何“读当前光标再还原”都会差一个 move 步长。相对模式由平台层在事件时刻累加位移（macOS `CGAssociate` 断开后读 `NSEvent.deltaX/Y`；Windows 每次 move 后 `SetCursorPos` 回锚点，与 Live 实测一致）。
- 「跟随系统」外观读的是窗口 `effectiveAppearance`，它继承 `NSApp.appearance`；一旦设置应用级外观覆盖，系统切换就不再触发。`architecture/gpuix-lessons` 拦截 `setWindowAppearance`。
- 批量矩形与原生 div 的像素等价必须覆盖小数位置、尺寸、host origin 与 scale 1/1.25/1.5/2：layout 舍入与 paint 边缘舍入是两步，整数用例测不出。
- React 19 DEV 的 Performance Track 会对变化的 `Float32Array` props 逐下标枚举，几千个峰值一帧就是数毫秒；性能门槛以 production p90 为准，大数组走命令式上传。
- 面板是否固定看作者声明的同单位 min/max，不看空间不足时夹出来的 `min === max`。

## 构建与补丁

- 合入改动补丁序列的提交后，先跑 `node scripts/gpuix-main/check.mjs`；报 “Vendor must contain exactly the checked-in ordered patch series” 时 tsc 与测试结果都是假失败，先重建渲染器。
- 修改序列中间的补丁，共享 vendor 要用旧补丁从尾部逆序 `git apply --reverse` 回退到被改补丁，再 `git rm --cached` 清掉残留 intent-to-add 条目，然后重放；`build.sh` 只能追加尾部。
- Apple Git 2.50.1 的 `git apply --intent-to-add` 会删掉补丁未涉及的 index 条目；先普通 apply，再对 `ls-files --others` 的新文件 `add --intent-to-add`。
- `pnpm add` 会重算 lockfile 并把 React 链接改回 npm 版本，造成多 React 实例；加依赖只编辑 `package.json`，再 `pnpm install --no-frozen-lockfile`，核对 lockfile 只有新增行并跑 `check.mjs --resolution`。
- Windows 本机构建 native 时，PATH 中 Git 的 `link` 会抢在 MSVC `link.exe` 之前；用用户级 MSVC 环境与 User+Machine PATH 运行。
- 引入 crate 或 npm 包前先查 registry 的真实版本与活跃度。外链校验用 `url` crate，Windows 打开外链用 `ShellExecuteW`，拒绝以 `-` 开头的 href。

## Git

- worktree 之间共享 stash 与 `refs/stash`。对照旧版本用 `git worktree add` 临时副本，不用 stash/checkout；验证 stash 行为只在 `mktemp -d` 的一次性仓库里做。
- 被 drop 的 stash 仍是悬空对象：`git fsck --no-reflogs --unreachable` 找回；未跟踪文件在第三个父提交里。
- hook 报 `pre-commit failed` 不等于没提交：先看 `git log`、HEAD 内容与 `stash@{0}`，确认后再处理；同一条命令里不要连跑两次 `git commit`。

## 测试

- Bun 的 `jest.useFakeTimers()` 忽略 `toFake`，一律伪造全部定时器。
- Bun 会把 `received` 里的数组替换成 `ExpectArrayContaining`，污染活的 Zustand state；会被继续读取的状态先 `structuredClone` 再断言。
- 纯函数用固定种子的性质测试守不变量；断言报违规时先分类，确认是断言前提错还是实现错。变异不红先比对输出，确认变异是否真的改变了行为。
- 判断 DOM 耦合用 ESLint 作用域分析，不用字面 grep：领域字段就叫 `document`。
- 尺寸断言从 token 推导（`CONTROL_METRICS`、`DEFAULT_LAYOUT_TOKENS.track.*`），不写 13、21、53 这类数字；改一次 metrics 曾打红 11 个测试。
- 原生点击测试先 `nativeSimulateMouseMove` 再点击；目标可能在滚动区外时先 `scrollIntoView` 并 flush。连续点击不同按钮时，没有 move 的第一次点击会被吞掉。
- 依赖真实音频设备的用例经 `platform/verification/audio-test.ts` 按探测结果跳过；生命周期类用例在无设备时改用已有 mock，断言照跑，不整体跳过。

## 验收

- 验证窗口用带 `name` 的 service 启动，拿到证据立即 kill；每个 gpuix 窗口是常驻 GPU 进程。
- 后台窗口通常被遮挡，macOS 停发遮挡窗口的 animation frame；性能、首帧、截图类验收用离屏 `createTestRoot` 或在真实桌面让窗口可见。
- `computer` 截不到按住期间的 pressed 帧；pressed 用原生测试断言样式与尺寸。
- 对照 Live 量尺寸要量完整组件，写明 AX 单位、显示器分辨率与窗口尺寸，比较比例。
- 在用户的 Live 里只做观察与视图类操作；AX `find({title})` 是子串匹配，改状态前按完整标签与 ref 定位，优先语义动作，不在标尺手势区拖动。快捷键以 Live 菜单实测为准。
- 把视觉「不对」报成缺陷前，先核对素材的预期数据与参考实现。
- 卡顿先量：`createTestRoot` 连续 flush 取 p50，再按区块和节点数拆分。原生 flush 随节点数线性增长（约 2000 节点 64ms），React 不 commit 也会慢；Gallery 只挂载当前类别。
- Windows 上 `computer.window().screenshot()` 会裁掉窗口右侧约 7px；判断右边缘是否被裁，用桌面截图按 DWM bounds 裁出来对照，不要据此给 viewport 加补偿。
- 热重载几十次后窗口可能停在空白状态；视觉验收前重启窗口，不要把这种空白当成缺陷。
