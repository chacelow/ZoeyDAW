# R2 Arrangement 修复与验证

2026-10-16。分支 `chacelow/gpuix-r2-arrangement`。代码验证 HEAD 为 `2dd4dc6bcf0b32fbf635fe1e4750fa43ced6e832`，已集成 R2-ui 与 R2-app。最终比较入口为 `git diff a98b719f...2dd4dc6b`。本报告及入口链接是之后的文档提交，不改变已验证代码。

ARR-01 至 ARR-07、独立审查的 F1 至 F4，以及协调者追加的 Save 可用性接入均已实现。没有本切片未实现项。前台整体视觉、物理修饰键输入及完整应用帧预算仍按派发要求由协调者串行验收，不以离屏结果冒充。

## 修复与红绿证据

路径前缀为 `apps/gpuix/src/project/sections/arrangement/`。

| 项目 | 修复前实际失败 | 实现与修复后行为 | 回归及变异 |
| --- | --- | --- | --- |
| ARR-01 | hydrate 后 move Ghost、resize edge 暂态仍非空 | 共同 finish 无条件清理 clipDrag、clipResize、timeSelectionPreview；epoch 不符仍禁止旧 gesture 写工程 | `lane/interactions/controller.test.tsx` 的 stale move/resize；`epoch-clip-transients` 命中两例 |
| ARR-02 | freehand 保留不对齐的原峰值，回扫保留旧采样 | DrawingState 保存合并 swept intervals；覆盖 original 和旧 painted，保留区间外点及未画过的 viewport 间隙 | core automation 三例；三个 freehand 变异均被捕获 |
| ARR-03 | 有效位置拖到 Audio 禁止区后释放，仍把 move/copy 提交到旧有效目标 | 当前 valid 参与取消及选择保护；无效释放不提交、不改 finish 时的选择或插入点 | 跨轨 move、Alt-copy；`invalid-release` |
| ARR-04 | 真实 MIDI ClipEditor 的 Cmd/Ctrl+S 后 dirty 仍为 true | timeline 在 Clip Editor 局部命令隔离前处理保存，文本与菜单边界不变 | 真实 composition、ClipEditor、native backend 与实际快照内容；`clip-editor-save` |
| ARR-05 | Clip 点击聚焦虚拟 LaneRow，而非稳定编辑面 | 一个持续挂载的 timeline-viewport；行、Clip 和 lane slot 无额外 Tab/输入路径；删除旧 activateClip 与焦点装饰 | 完整原生 Tab 循环排除行/Clip，滚动不丢焦点；`editing-surface-tab-owner` |
| ARR-06 | 拖动中 Tab 离开后释放仍把 Clip 从 bar 2 移到 bar 4 | viewport blur 中断 lane；捕获不依附 source row；滚动卸载源行后仍能跨轨完成 | document、preview、history 回滚；实际源行卸载后移动；`lane-focus-cancellation` |
| ARR-07 | 播放位置更新访问 16/1024 个未变 Clip 的几何字段 32/2048 次 | Overview 与 Playhead 分离，未变静态 Clip 几何访问为 0，原生播放头仍移动；工程/marker/theme/size/bars 更新仍刷新概要 | `minimap/render-cost.test.tsx`；静态概要恢复播放订阅的变异命中两例 |
| 追加 Save 状态 | 损坏快照已阻止底层保存，但按钮仍以 enabled 外观显示 | `useProjectState(canSaveSnapshot)` 控制共享 Button；原 key 不变，干净工程恢复可用 | 原生禁用 paint、点击和 Cmd+S、实际 storage 内容；`save-snapshot-availability` |

## 自审结果

独立 `pstack-reviewer` 使用 Standards 与 Spec 两轴审查。初审发现三个独立问题，定向复审再发现 F4。最后两次定向审查确认 F4 关闭，Save 接入和 Clip 旧焦点清理没有新增发现。审查者没有运行检查，以下红绿与变异由本 worker 执行。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| S1/F1，输入层与外框双滚轮入口 | 必修 | 删除输入层及 lane demo 重复入口，保留全宽 timeline-layout | 原生 delta 24 曾变成 48；修后车道/表头单次平移和缩放比例一致；reverting mutant 失败 |
| F2，输入层挡住车道侧高度条 | 汇报仲裁 | 协调者批准 TrackResizeOverlay；移出 Row 的唯一 hook/handle，通过中立 interactionOverlay 放在输入层上方 | 左侧拖动曾高度 70 不变，期望 104；修后提交；条外点击仍选 Clip；隐藏边界、pinned、唯一数量回归通过 |
| F3，Shift+F10 伪指针重命中 | 必修 | 直接按当前有效 Clip/Automation point 身份解析；没有目标不打开菜单；鼠标路径不变 | 3px Clip 尾部删除、打开菜单后恢复可见区域再 rename、第二轨自动化点 edit/delete；两个 reverting mutants |
| F4，resize 边界离屏销毁活动 owner | 必修 | 保留活动 track 和按下 hitbox 到 release/cancel；空闲仍裁剪实际条形交集 | 真实 source/Main 越界后继续提交且仅一条 undo，Escape 完整回滚；四例、24 assertions；去掉冻结矩形的变异失败三例 |
| Minimap 组件证据不能外推整个应用 O(1) | 记录 | 限定声明为 MiniMap 组件内静态投影；不宣称完整 composition 每帧 O(1) 或前台达标 | 下方 production 测量保留全部轮次及限制 |
| 继承的 model/grid.todo | 记录 | 本切片不越界删除 | `project/model/grid.test.ts:66`；最终整仓测试的一个 todo，非本切片新增 |

### 扫描 WARN 逐项结论

最终 review scan 为 0 HARD、5 WARN。全部是 demo/verification 的固定验收窗口尺寸，非新增产品控件度量；保留。产品输入层和 resize strips 的几何仍从 viewport、core layout 和主题 token 派生。

| WARN 文件                                   | 结论                           |
| ------------------------------------------- | ------------------------------ |
| `app/verification/r2-arrangement-smoke.tsx` | 固定 1440 宽业务截图窗口，记录 |
| `lane/demo/index.tsx`                       | 既有 1280 宽 demo 窗口，记录   |
| `tracks/demo.tsx`                           | 既有 1120 宽 demo 窗口，记录   |
| `tracks/verification/appearance-smoke.tsx`  | 固定 760 宽离屏验收窗口，记录  |
| `tracks/verification/render-cost.tsx`       | 固定 1000 宽性能夹具，记录     |

### 审查差异与提交

完整已验证差异：`git diff a98b719f...2dd4dc6b`。初审、F1/F2/F3 定向复审、F4 生命周期复审及最终 Save 小差异审查均已完成；最终复审没有新增 Standards/Spec finding。

```text
0d110e81 fix(arrangement): replace swept freehand automation intervals
5f76a5a5 perf(arrangement): isolate minimap playhead projection
94b7dfc5 fix(arrangement): save from clip editor focus
5f4f3c33 fix(arrangement): retain lane editing ownership across transitions
4d715901 test(arrangement): exercise native editor save and blur cancellation
1017a116 test(arrangement): measure the full layout container
5cb7bb55 fix(arrangement): resolve keyboard menus by selection identity
d2311aa9 fix(arrangement): separate lane input from track resizing
e8d0f007 refactor(arrangement): remove keyboard menu geometry contract
5c0e3407 fix(arrangement): retain resize capture outside the viewport
cf2d8828 fix(arrangement): disable saving blocked project snapshots
918b8895 refactor(arrangement): remove obsolete clip focus decoration
2dd4dc6b test(arrangement): keep Save verification locale independent
```

协调者要求的主干同步为 `72d30766`、`896d4ac3`、`be7ed8a2`。未 push。

## 验证命令与结果

| 命令或入口 | 最终结果 |
| --- | --- |
| 根目录 `pnpm verify:gpuix` | passed；native build、tsc 0 errors、eslint 0 warning；architecture 80 pass；Bun 1308 pass、1 inherited todo、0 fail；UI map current；真实 backend resume smoke released idle |
| `bun apps/gpuix/src/project/sections/arrangement/core/verification/mutations.mjs` | 14 个变异被捕获，目标文件 SHA-256 未改变 |
| `bun apps/gpuix/src/project/sections/arrangement/lane/verification/mutations.mjs` | baseline 44 pass；20 个变异被捕获，目标文件未改变 |
| `bun apps/gpuix/src/project/sections/arrangement/timeline/verification/mutations.ts` | 25 个变异被捕获 |
| `bun apps/gpuix/src/project/sections/arrangement/timeline/verification/r2-minimap-mutations.ts` | 一个变异命中两条回归 |
| `app/verification/r2-arrangement-smoke.tsx`，preload `native-fixture.ts` | `native: ready, saved: true, blurCancelled: true`，结束为 `released idle` |
| `node scripts/gpuix-review-scan.mjs` | 36 source、9 test files；0 hard、5 warn，结论见上表 |
| 稳定窗口后台启动 | 自有 `r2-arrangement-window` 创建为未聚焦的 1280×800 窗口；AX 仅窗口/chrome，未据此宣称业务帧或视觉通过；15.2 秒后立即关闭 |

本切片未修改 Rust source。`pnpm native:build` 已由完整门禁实际执行，没有本切片的额外 cargo check/test 声明。

中途一次完整门禁的 Cmd+F 用例在 5 秒附近失败；隔离用例通过，保存完整日志的全套测试也通过，未改 timeout。另一次全套检查发现新 Save 回归依赖进程全局语言，已改用 `timeline-save` 稳定入口；最终完整门禁通过，不隐去这些失败。

可复跑业务入口，在仓库根执行：

```sh
B2_EVIDENCE_DIR="$(mktemp -d)" bun --cwd apps/gpuix --preload ./src/app/verification/native-fixture.ts src/app/verification/r2-arrangement-smoke.tsx
```

Gallery 复用 `src/gallery/GalleryDemo.tsx` 与既有 `src/gallery/verification/evidence.tsx`。本轮直接用 createTestRoot 挂载 default Gallery，捕获 dark/en、light/zh 两个完整组合，卸载后 retained 为 0；没有逐按钮批量 PNG。

## UI 规范第 13 节

证据目录为 `/tmp/zoeydaw-r2-arrangement-ctx3e6`。`provenance.json` 绑定代码 HEAD、renderer SHA 和四张整页 PNG 的 SHA-256；业务 AX JSON 同目录。截图不提交 Git。

| 检查 | 结论与证据 |
| --- | --- |
| Gallery 与业务整体布局 | `r2-gallery-{dark-en,light-zh}.png` 与 `r2-arrangement-{en-US-dark,zh-CN-light}.png`；保留工具栏、Browser、Arrangement、Clip Edit 的空间关系，已读取检查 |
| 跨区域对齐与居中 | 组合截图未见新增布局偏移；既有全宽布局六条原生几何断言保持不变，只将测量节点改为 timeline-layout |
| 间距与内边距 | 没改共享 gap/padding；resize 条仍取 control track gap，输入层从 core ruler 与 viewport 派生 |
| 统一设计入口 | 复用 Menu、Button、原有 resize gesture、共享主题；不另造业务圆角、配色或数值控件 |
| 尺寸与紧凑感 | 截图保留原有工作站密度；透明输入与条形 overlay 不占布局空间；Live 观察见下表，不以不同窗口尺寸比较绝对像素 |
| 深浅主题与中英文 | 同一业务组合和 default Gallery 的 dark/en、light/zh overview；未宣称四种主题语言笛卡尔积均做前台验收 |
| 状态与键盘 | native Tab、blur、Escape、Cmd/Ctrl+S、Space、Shift+F10、禁用 Save、hover 光标及 rename 回归；不保留逐 Clip 键盘入口 |
| 拖动、滚轮、弹层与性能 | 原生跨行/卸载/resize 越界、单次 wheel、真实菜单动作均验证；性能限制见下一节；真实可见窗口由协调者收尾 |

## 产品规则与 Live 观察

只读观察 Live 的现有工程，未点击、拖动、播放、保存或修改内容。AX 窗口为 1463×1049 原始单位，截图工具缩放至 1250×896；未自行换算点和像素。参考图为 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a7fb836d92b047.png`。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 保存为全局命令 | 文件菜单「保存 Live Set」显示 Cmd+S | Clip Editor 非文本区域交给唯一窗口保存 owner | 未在用户 Live 中触发保存或验证 Clip 焦点组合 |
| 稳定二维编辑面 | AX 有 Arrangement 分组、时间线描述及独立轨道标题栏；截图车道在左、表头在右 | timeline-viewport 单一编辑面，tracks 保留独立控制区域 | 未对用户 Live 做 Tab 输入 |
| freehand 覆盖旧包络 | 当前自动化关闭，工程无可用 Clip 供只读观察该手势 | swept intervals 回归与变异 | Live 绘制行为未实操，不改用户工程来造案例 |
| 禁止区释放不提交 | 当前工程没有可拖 Clip | move/copy valid→invalid release 回归 | Live 实际拖放未验证 |
| 失焦取消 lane 手势 | 只读观察未开始编辑手势 | native Tab/blur 后 document、preview、history 回滚 | Live 取消语义未实操 |
| resize 捕获与边界 | 截图有轨道分隔与右侧表头 | 唯一 resize strips 与 source/Main 越界回归 | Live 实际 resize 未验证 |
| Minimap 静态内容与播放头 | 截图有顶部概要；未播放、未计时 | 静态 Overview 与动态 Playhead 分开 | 不宣称测量过 Live 的投影成本或帧率 |

## Production 离屏测量边界

lane 的 production render-cost 入口保持 10,000 Clips、976×758 viewport、相同十步滚动/缩放。`LANE_PROFILE_INPUT_SURFACE=0` 是验证入口的对照开关，不是产品兼容路径。以下是移除空 editor wrappers 后的全部四轮，原始 JSON 为 `profile-round-*.json`。更早的诊断两轮也保存在目录内，没有用最好一轮替代全部结果。

| 顺序 | 稳定输入层 | CPU p50 ms | CPU p90 ms | retained initial |
| ---- | ---------- | ---------: | ---------: | ---------------: |
| 1    | 开         |     125.54 |     422.28 |             2709 |
| 2    | 关         |     156.01 |     193.91 |             2706 |
| 3    | 关         |     211.75 |     517.66 |             2706 |
| 4    | 开         |      42.32 |      92.91 |             2709 |

每轮有真实 native frame stats，29 frames；卸载入口检查零 retained。新增输入层只有常数级节点，未增加每 Clip 输入节点。并行宿主负载导致时长方差很大，不能用这组数据证明前台 16ms 达标，也不能外推完整应用 O(1)。ARR-07 的组件回归单独证明稳定 Clip 几何不随播放位置重新遍历。

## 授权边界与资源清理

经协调者明确批准的额外拥有路径：

- `app/project/ArrangementPanel.tsx` 的稳定输入和 interactionOverlay 接入。
- `app/project/composition.test.tsx:245` 的 full layout 测量节点；其余几何断言不动。
- 新增 `app/verification/r2-arrangement-smoke.tsx`；没有 lint 豁免。
- 自动生成的 `docs/architecture/gpuix-ui-map.md`。

没有新增依赖、手写 SVG、DOM 路径、产品 mock 或提交的图片。代码/脚本路径扫描没有新增写死的绝对宿主路径；外部输出通过环境变量传入。

进程检查实际运行 `ps -axo pid,etime,command`，按 `bun .*--hot|cargo run|gallery|demo` 筛选，输出为：

```text
(empty)
```

自有 service `r2-arrangement-window` 已停止，PID 45378 不存在。详细记录为证据目录的 `process-check.txt`。所有离屏入口均有限退出，backend 回到 idle；没有停止用户已有服务，没有调用 computer.control.acquire。

## 错题

- 把父 div 当成 DOM 式鼠标冒泡 owner 会失效。原生后代 hitbox 阻挡祖先 hover，必须用一个真实保留输入 hitbox，并把独立 resize 条放在其上方。
- 捕获生命周期不能跟随当前可见几何。空闲条裁剪与活动 owner 保活分开，不能把 resize 自己移出视口当成取消。
- 键盘选择不能伪装成指针坐标再次 hit-test。裁剪片段与第二轨自动化点会选错对象。
- 先保证回归红灯来自目标故障。首次越界测试撞到合法 MAX_TRACK_HEIGHT，之后缩小 viewport，在有效高度范围内复现回滚。
- Native TestElement 的 customProps 不是完整 AX 状态，且全局语言可能继承其他测试。禁用回归使用真实 paint/动作/存储内容，并用稳定 testId，不钉死按钮文字或遗漏字段。

## 已验证做法

- 共同结束路径只无条件清理 UI 暂态，工程写入仍受 epoch guard 约束，旧手势不能覆盖新工程。
- 稳定编辑 hitbox、实际条形 overlay、唯一菜单与输入框分工明确，复用既有 core hitTest、布局和项目 edit gesture，没有第二份工程。
- resize 的 capture 回调保持依赖稳定；保留按下矩形直到 release/cancel，几何更新不会触发 effect cleanup。
- Minimap 复用 React memo 和独立订阅，不引入另一套概要几何。[React memo 官方说明](https://react.dev/reference/react/memo#updating-a-memoized-component-using-a-context)确认 memo 不阻止组件自身的 context 更新，主题变化仍刷新。
- 变异通过 Bun plugin 在内存复原错误，失败必须来自行为断言，不接受语法错误或空转。core/lane runner 同时校验源目标未被修改。
- 文档只报告实际执行：真实后端、离屏原生像素和行为、后台启动/释放分别列证据，不把任何一种替代前台整体和性能验收。
