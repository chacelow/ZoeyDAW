# Clip editors F4 消费者复核

2026-10-15。当前为正确性检查点，不是最终像素/性能验收。分支已 fast-forward 同步至 `b4a55a8`（包含 `f9d4816` 二维编辑面焦点契约）；共享十一补丁解析已实测通过。只重建本worktree自有 `@zoeydaw/native`（3.83s），没有共享vendor重建、rebase、stash或桌面操作。

## 数据链路与验证入口

`verification/consumer-probe.tsx` 挂载真实 `ClipEditor`，使用同一 project runtime 的 `readProjectPeaks` 与实际 Rust session。临时 WAV 经 Rust 解码，实际 `sourceInfo` 为 44100 Hz、88200 frames、2 channels；16384px 查询返回65536个有限f32，offset=0.25与1.25的峰值哈希相同，负偏移也实际查询。不是 F4 的14,065矩形合成探针，不把MIDI/Pattern元数据说成已接通合成器。

正常工程13 notes/16 steps；满量工程10000 notes/1024 steps，所有数据保留。demo与headless probe共用 `demo/project.ts` 的同一fixture，`CLIP_EDIT_STRESS=1` 打开满量demo。生成PNG默认被 `.gitignore` 忽略，没有stage图片。

```sh
# apps/gpuix
bun src/project/sections/clip-edit/verification/consumer-probe.tsx current dense
NODE_ENV=production bun src/project/sections/clip-edit/verification/consumer-probe.tsx current-production dense
CLIP_EDIT_REFERENCE=556d829 bun --preload ./src/project/sections/clip-edit/verification/reference-preload.ts src/project/sections/clip-edit/verification/consumer-probe.tsx reference dense midi
```

Reference preload从Git读取原消费者源码，不修改产品文件；仅在验证运行中用ID入口装配历史对象边界。产品没有旧props shim或双API。单帧协议使用 `dispatchScrollWheel` 加一次native flush，额外flush单列；真实力度编辑包含native input自身的preflush。CPU墙钟不等于GPU完成时间。最早baseline驱动含多次flush与重复wheel，不与新单帧数值计算加速倍数。

## 已完成的切换

- 唯一 `ClipEditorSlot` 为 `{clipId, trackId, close}`；Footer、demo、harness与probe均迁移。`ClipEditor` 从adapter selector读取工程；MIDI大快照通过只读函数在owner内消费，不再穿过React props。NameInput只收ID和值。
- grid独占命中、选择、拖动和编辑键盘，符合 `gpuix-ui-standards.md:74` 的二维直接编辑面契约；pitch行AX标签保留时间、力度和选择信息。力度lane只有一个活动slider/Tab入口，Left/Right按源顺序导航，Up/Down保留组力度与Undo语义。原selection owner原子持有 `{indices,current}`；组内点击、Cmd+A与Shift增减更新current而不重排成员，三个consumer统一使用同一锚点。
- MIDI body是唯一wheel owner，NoteGrid不再重复绑定。同一原生wheel修复前处理两次，当前一次；倍率公式没有改变。
- quad几何由视图owner命令式上传，memoized host不接收几何数组或回调。移除/重挂载与裁剪有实际native PNG对照回归。
- 已删除全部临时TS像素舍入；像素对齐只由共享F4b原生路径负责。

## 性能诊断状态

最早满量实际消费者诊断：Audio3438节点、MIDI40291节点、Pattern1037节点；旧MIDI包括10000 note div及10000组三节点velocity，CPU驱动action+多flush p90为1994.058ms。A阶段保留全部可见语义节点，只批量绘制，仍约20307节点；源码重建patch与CPU profile保存在本地 `evidence/f4-quad-a-normal/`。A不是最终方案。

最新已执行、尚未满足全部门槛的满量单帧结果来自 `f4-imperative-owner-dense` 与 `f4-imperative-owner-production-dense`，均保留10000 notes/1024 steps，初始358节点：

| 模式        | scroll p90 ms | zoom p90 ms | redraw p90 ms | 单力度编辑 p90 ms |
| ----------- | ------------: | ----------: | ------------: | ----------------: |
| development |        17.256 |      23.373 |         6.177 |            47.068 |
| production  |        16.673 |      14.258 |         7.010 |            43.959 |

编辑已低于50ms，scroll/zoom尚未全部低于16ms，不能称性能验收通过。旧/新同协议最终对照需F4c与lane合入后重跑。

Audio profile主要为数千native波形节点及mutation；等待唯一PeakColumns quad路径。Pattern profile主要为native click、flush和TestRenderer的同步getElementBounds；其getBounds强制flush不能冒充live renderer一次读取成本。Pattern尚无产品代码改动，真实窗口/单帧复测未执行。

## 像素与精确依赖

正常MIDI保留原生有文字note盒与绘制层级，初始以及旧同域缩放/滚动四图曾得到0不同像素。删除TS snap、采用F4b后，满量无文字note描边有2118不同像素：旧div先snap整体再画border，而当前拆为独立solid rect后各自snap，不等价。

协调者已明确不接受该差异，批准F4c在同一QuadBatch/setQuads路径增加每batch `strokeWidth`/`strokeColor` 小标量。收到实际合入SHA后必须用一个note一个原生bordered quad，删除5-rect模拟，再完成像素、DEV/production性能与Audio A/B。当前没有F4c或lane合入SHA，不能编造已接入或通过；没有改PeakColumns、lane、SDK或vendor。

修复重复wheel后，相同输入次数不再产生相同viewport。后续GPU A/B按同一实际viewport比较，并明确旧双处理/新单处理的驱动差异；初始图单独保留独立对照。

## 实跑门禁

| 命令/路径 | 结果 |
| --- | --- |
| `node scripts/gpuix-main/check.mjs --resolution` | b4a55a8同步后十一补丁、host、React解析通过 |
| apps/gpuix `pnpm exec tsc --noEmit` | 当前正确性检查点通过 |
| `bun test src/project/sections/clip-edit src/project/sections/footer/index.test.tsx src/shared/quads src/project/adapters/backend/native.test.ts` | 十一补丁检查点103 pass、0 fail、85255 assertions、21 files |
| 完整 `mutations.mjs`（原30项与新增8项） | baseline0fail，38项全部KILLED，源文件恢复校验通过 |
| 真实backend测试 | 48000Hz设备、outputLatencyFrames284；播放有限电平，停止-120dBFS |
| 原生单wheel回归 | 修复前宽846而期望423，exit1；修复后对照真实Zoom In/Out按钮、单次pan及选择/Undo通过 |
| Footer真实ID-slot回归 | 一次力度编辑80→81，单次Undo恢复80，始终只有一个编辑器 |

完整应用套件、最终native stroke像素与满量性能、真实窗口整体评审仍未完成；不将本检查点发为worker_done。独立双轴审查已完成，下表只关闭当前正确性findings，不替代最终原生验收。

## 错题

- wheel同时绑在grid和父body，native冒泡生成两次消费与两轮重绘；仅更换绘制primitive不能解决输入owner重复。
- 同时存活两个TestRoot后比较截图，最初两个上传负变异仍通过。改为顺序捕获、独立oracle后，丢注册与不更新几何均实际失败；原空转结果没有算验收。
- 一个bordered div拆成分别snap的fill矩形，不等于原生border绘制；不能用TS的1x舍入覆盖DPR问题。
- 组选择不能只保存成员并按源顺序猜current；组内点击另一个已选音符会用错误力度锚点。三回归先失败后通过，原子 `{indices,current}` 修复并保持剪贴板顺序。
- 本地config落后共享vendor也会触发ordered-patch门禁。同步实际主干后再判断，不能把版本错位直接称为vendor故障。

## 已验证做法

- ID-only公共边界与只读快照函数消除React DEV深遍历10000notes的props成本，不关闭instrumentation。
- 单一selection owner派生活动slider；实际Tab、Left/Right、Up/Down、AX value、指针同步与Undo回归覆盖导航契约。
- 重任务按协调者资源窗口暂停，所有headless root在finally卸载；没有自启桌面窗口或停止用户服务。
- 生成PNG留在ignored evidence，提交可重跑入口与数值证据，不制作逐按钮状态矩阵。

## 自审结果

| 发现 | 分类与处置 | 证据 |
| --- | --- | --- |
| Spec P2：组内点击不更新current | 必修，已关闭；同一owner原子持有成员与current，三个consumer共用锚点 | 新三回归先3fail，修复后邻近32tests/215assertions；组内点击/Cmd+A两变异KILLED |
| Standards P2：列表roving与piano roll箭头编辑冲突 | 汇报仲裁，已关闭；协调者在f9d4816明确二维编辑面根0，不改既有箭头 | `gpuix-ui-standards.md:74`；Standards复核关闭 |
| Standards P3：纯投影引用React文件 | 必修，已关闭；纯类型/转换移到paint-layers.ts，无React/SDK依赖，无旧re-export | Standards复核关闭；103回归与8变异通过 |
| bordered-div拆分的2118边缘像素差异 | 共享仲裁，未验收；等待F4c，一个note一个原生bordered quad，删除5-rect模拟 | `f4-imperative-owner-dense`初始PNG与旧div差异；协调者不批准放宽 |

独立lane为现有 `pstack-reviewer`，job为 `ClipStandards` 与 `ClipSpec`；实际具体model未由工具暴露，不能声称已验证。协调者已明确由其在合入前做固定模型复核。两轴只读、未运行检查或修改源码；原findings全部关闭，本次复核新增0。

## Pattern 新发现

`consumer-probe.tsx pattern-hit dense pattern` 实测完整1024 steps：strip为x4、宽1092、高34；首步x4、宽2，末步x4096、宽2，越过1100px视口。真实native点击语义step1的中心，权威store改变的是step4；step2→8、step3→12。`evidence/f4-pattern-hit-dense/result.json` 同时保存decoded metadata、bounds、逐次requested/changed索引与backend ready/pending0状态。

根因是原PatternSteps固定gap与border下的实际flex几何，和独立均分命中公式不一致。协调者已批准本dispatch修复，要求同一纯几何、最小可操作宽度、共享横向滚动、可见裁剪与单入口键盘；按要求在MIDI正确性单元之后独立实现、独立提交。当前未修改Pattern产品代码，不把这个错误藏在性能数字中。
