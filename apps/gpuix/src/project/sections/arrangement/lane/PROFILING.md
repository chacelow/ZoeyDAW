# Lane production 滚动剖析

## 结论与边界

仍可见 Clip 的水平位置变化，原先会重新构造未变的内容、重新上传相同 quad，并因全局 x key 重挂载 loop tick。现在位置和 AX/key 宿主保留在 `ClipCardView`，局部绘制留在默认 memo 的 `ClipContentsView`。局部几何、网格和状态仍由原有按 Clip ID 的 display projector 派生并复用，没有第二份工程状态、新缓存层或 React 深比较器。部分裁剪、缩放、编辑、hover、选择和折叠仍使内容失效。

本节时长来自三轮修复前与三轮修复后的 production 小视口诊断。视口976×196，逻辑工程仍200×50，十步输入不变。不是976×758主干窗口性能验收，不据这些时长宣称16ms达标。每格为 p50 / p90，单位ms，保留全部重复轮。

| 阶段 | 前1 | 前2 | 前3 | 后1 | 后2 | 后3 |
| --- | --- | --- | --- | --- | --- | --- |
| 投影 | 0.630 / 1.385 | 0.801 / 1.135 | 0.766 / 1.172 | 0.603 / 0.800 | 0.655 / 0.936 | 0.731 / 1.211 |
| React pre-commit 包络，扣已测投影 | 1.185 / 1.816 | 1.224 / 3.917 | 1.136 / 3.932 | 1.052 / 2.676 | 1.173 / 2.250 | 1.758 / 5.112 |
| commit，含 layout effects | 1.441 / 2.245 | 1.806 / 3.162 | 1.768 / 2.164 | 1.199 / 1.766 | 1.721 / 2.508 | 1.368 / 2.427 |
| commit，扣计数 observer | 0.984 / 1.271 | 1.066 / 1.592 | 1.189 / 1.628 | 0.869 / 1.377 | 1.332 / 1.995 | 0.912 / 1.604 |
| host queue flush，含 applyBatch | 0.987 / 1.112 | 1.098 / 1.598 | 0.847 / 1.318 | 0.786 / 1.039 | 1.049 / 1.457 | 0.821 / 1.199 |
| Native flush，非 Taffy | 2.318 / 3.228 | 2.510 / 4.159 | 2.200 / 3.567 | 1.928 / 2.423 | 2.138 / 3.549 | 2.615 / 3.754 |
| 额外 Native flush，非单帧预算 | 1.220 / 2.010 | 1.196 / 2.069 | 1.125 / 2.154 | 1.041 / 1.535 | 1.349 / 1.877 | 1.499 / 2.251 |
| observer 开销 | 0.386 / 0.694 | 0.528 / 0.788 | 0.416 / 0.592 | 0.389 / 0.475 | 0.389 / 0.613 | 0.414 / 0.565 |
| Native applyBatch 子段 | 0.295 / 0.430 | 0.249 / 0.432 | 0.290 / 0.405 | 0.263 / 0.365 | 0.329 / 0.848 | 0.276 / 0.442 |

时长有长尾，不能据单个最好值宣称普遍加速。确定的收益是未变内容的工作消失；同规模完整窗口还要另排静默复测。

## 分段口径

- 投影包括 timeline 输入命令、visibleRows，以及组件内实际 grid/card projector 调用。
- actual dist `hostConfig.prepareForCommit` 前的同步包络扣除已测组件内投影，仍包括 React reconciler 的 pre-commit bookkeeping，不冒称 React 官方 exclusive actualDuration。
- prepare 到链式 DevTools `onCommitFiberRoot` 是 commit 包络，包含 host mutation 和 layout effects，不含随后 passive effects。多个 commit 各自保留，不假设一帧恰好一个。
- resetAfterCommit 包住 queue 的序列化、Native applyBatch 和销毁 handler 清理。applyBatch 是它的子段，不能相加为互斥阶段。
- Native flush 还包括 dispatcher drain 和绘制等工作，不是 Taffy。Taffy 字段为null，按协调者审定写当前不可观测，不用JS残差推算，不增加Native text或vendor补丁。
- mutation observer 的JSON解析、历史style比较和计数开销单独记录。总commit和扣observer结果均报告；没有关闭DEV或production行为。普通production Profiler不回调，不解释为零React工作。

## 重渲染、重挂载与位置更新

以下四个横滚阶段的计数在各组三轮中一致。前列 retained 指同ID仍可见的 Clip；后列只计其局部内容。两个裁剪边界 Clip 的内容确实变化，保留必要渲染。

| 横滚阶段 | 前 retained 内容 render | 后 retained 内容 render | 后 Clip mount / unmount | host create 前 / 后 | host destroyed 前 / 后 | 后 position-only style |
| --- | --: | --: | --- | --- | --- | --: |
| 1 | 16 | 0 | 15 / 15 | 189 / 161 | 189 / 161 | 16 |
| 2 | 20 | 0 | 4 / 11 | 70 / 35 | 131 / 96 | 20 |
| 3 | 18 | 0 | 0 / 3 | 31 / 0 | 58 / 27 | 18 |
| 4 | 30 | 2 | 32 / 18 | 332 / 280 | 210 / 158 | 28 |

输入引用追踪显示，保留 Clip 的 clip、fade geometry、颜色、峰值 reader、激活回调、音乐分子与模式都稳定；原先变化的是 card、global geometry、global grid 与left。修复后局部content引用保持稳定，只有最后阶段两个实际部分裁剪的Clip改变content。装饰key由局部内容坐标产生，不再随全局scroll x移动。

Native create/destroy来自真实applyBatch tuples与返回的实际销毁ID。destroy请求可能重复，不把请求数当实际删除数；append或insert根据历史parent区分初挂、重排和reparent。setStyle是完整replacement，按新旧完整对象的变化key分类，不因payload带width/height就称尺寸变化。setQuads绕开applyBatch，单独记录。

## 1632至3018节点变化来自哪里

下表是此前13b5267原视口A测量的production第2轮，明确不是本次新修复后的满量结果。横向工程尾部裁剪与zoom会改变每行可见Clip数，节点波动不全来自整行增删。垂直边界也会使可见行数改变；只挂载相交内容是现有产品要求，不为稳定数字保留不可见Clip。

| 步骤 | 输入       | scrollX | scrollY | pxPerBar |  行 | Clip | 节点 |
| ---- | ---------- | ------: | ------: | -------: | --: | ---: | ---: |
| 1    | horizontal |     480 |       0 |        8 |  10 |  279 | 2736 |
| 2    | vertical   |     480 |     360 |        8 |  10 |  279 | 2736 |
| 3    | horizontal |     816 |     360 |        8 |  10 |  216 | 2145 |
| 4    | vertical   |     816 |     780 |        8 |  10 |  216 | 2145 |
| 5    | zoomIn     |    1142 |     780 |       10 |  10 |  189 | 1893 |
| 6    | horizontal |    1264 |     780 |       10 |  10 |  162 | 1632 |
| 7    | vertical   |    1264 |     340 |       10 |  11 |  180 | 1800 |
| 8    | zoomOut    |     816 |     340 |        8 |  11 |  240 | 2366 |
| 9    | horizontal |     316 |     340 |        8 |  11 |  310 | 3018 |
| 10   | vertical   |     316 |       0 |        8 |  10 |  279 | 2736 |

## 证明与复跑入口

Native回归 `moves a fully visible Clip without reuploading or remounting its unchanged content` 修复前在横移64px时产生2次目标quad上传，修复后为0；位置仍正确移动，所有内容Native IDs保留。强制每次产生新局部content，以及将全局x、viewport与grid放回内容输入的变异，均命中该回归。loop tick 后续按审定改用局部ordinal key，几何不变。

独立像素参考是修复前完整ClipCard renderer的快照。原十步序列加7.25px左裁剪及复位，共13帧，每个深浅主题分别比较，26张Native PNG字节相同。未减少Clip、音符、波形像素或声道。捕获程序与比较器是verification工具，不进入产品路径。

production诊断：`NODE_ENV=production LANE_PROFILE_VIEWPORT_HEIGHT=196 bun --preload ./src/project/sections/arrangement/lane/verification/phase-preload.ts src/project/sections/arrangement/lane/verification/render-cost.tsx`。像素诊断使用 `local-content-pixel-preload.ts` 的 `LANE_CONTENT_CAPTURE_DIR`、`LANE_CONTENT_APPEARANCE` 和可选修复前 `LANE_CONTENT_REFERENCE`，然后运行 `compare-local-content-pixels.ts before-directory after-directory`。诊断环境开关不属于产品窗口入口。

本次ignored原始证据位于 `evidence/verification/production-phases-before.json.local`、`production-phases-after.json.local`、`local-content-pixels.json.local`。它们是本worker实际运行的 `createTestRoot` 离屏诊断，保留每帧时间、输入引用变化、component生命周期、完整host mutation分类和命令回执。它们不是真实满量窗口结果，不作为16ms窗口门槛通过证明。

## 独立审查处置

| 发现 | 类别 | 处置与证据 |
| --- | --- | --- |
| 两个空捕获目录会被像素比较工具误判成功 | 必修 | 增加非空PNG捕获守卫。两个空目录实际退出1并报缺少capturedPNG；原真实深色13帧仍全部字节相同。没有用语法错误或空循环代替失败证明。 |
| geometry、source/Ghost、memo边界与分段计时口径 | 无新增finding | 独立Spec只读审查通过；Standards除上述工具缺陷外无其他必修或仲裁。Taffy仍null，Native flush不伪称layout。 |

独立审查未执行检查。测试、变异与NativePNG证明由本worker实际运行。完整窗口16ms预算按协调者收尾决定由其前台串行验收，不把来源不同的证据拼成已通过。

## 真实窗口尝试、输出路径与停帧来源

本worker按绝对UTC授权，用命名 `bun --hot` service、`GPUIX_BACKGROUND=1`、完整200×50与原十步协议尝试复测，但完成轮数为0。第一次在创建窗口前遇到preload注入锚点不唯一，已修为包含 `createAnimationFrameSource(renderer)` 的唯一边界。续次日志确认实际创建窗口、挂载完成、10000 Clip与backend ready，但没有完成标记，runner随后报告输出文件ENOENT。两次service均在finally关闭，规定ps过滤无残留；没有将零轮当作性能结论。

来源必须区分：协调者在2026-10-15 19:16 UTC，于本worktree用相同production、背景模式和preload独立诊断，报告 `window-profile-mounted` 与 `window-profile-await-frame` 均出现、文件已写出，随后停在 `await-initial-native-frame`，viewport为0×0，Native只停留启动时6帧。本worker没有另行复跑确认这些数字。该结果与F3已验证的遮挡/最小化停帧一致：被Edge完全遮挡的背景窗口不交付animation-frame；未遮挡的非活动窗口才继续节流绘制。它不是内容性能失败。

输出路径作为独立工具问题修正：preload现在以实际cwd解析为绝对路径、创建父目录、在创建窗口前写 `preload-ready` 回执，记录canonical output、cwd、pid和deadline，并把同一路径回传给effect。无窗口的路径验证已观察到实际文件与绝对路径一致；脚本摘要首次引号错误记录保留，随后直接检查已成功写出的回执，未重开窗口。证据在 `evidence/verification/window-output-path-proof.txt.local`。缺少、过期UTC授权仍在创建窗口前失败。

按协调者的明确决定，不再申请后台时段，也不绕过遮挡停帧、不主动激活窗口、不使用JS定时器伪造帧。满量真实窗口16ms需要未被遮挡的可见窗口，已移交协调者收尾阶段的前台串行真实桌面验收。这里提交的是可复查runner、真实production离屏分段、根因修复和像素等价证据；真实窗口预算状态仍为待前台验收。
