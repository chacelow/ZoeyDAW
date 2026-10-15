# S1 runtime / AudioWaveform 纯重构报告

2026-10-16。基于 `d31fbf7` 开始，已同步协调者的 `b26a15b` 基线测试修正。代码与本切片验收已完成，供 `merge_ready` 复核；真实前台组合界面和桌面帧性能由协调者收尾验收，不把离屏结果描述为前台结果。

## 范围与状态 owner

公开 API、AudioWaveform props、工程行为和原有测试断言不变。没有新增功能、依赖、Rust 修改或共享主题修改。

| 入口                         | 拆分前行数 | 拆分后行数 | 上限 |
| ---------------------------- | ---------: | ---------: | ---: |
| `runtime/project-runtime.ts` |        944 |        116 |  400 |
| `audio/AudioWaveform.tsx`    |        570 |        170 |  250 |

`RuntimeOwner` 是全部 runtime 可变状态的唯一持有者。`project-runtime.ts` 组合它与 backend、editing、saving 命令，不建立需要同步的 manager。

| 模块 | 职责 |
| --- | --- |
| `runtime/runtime-state.ts` | 唯一可变状态、初始配置、历史写入口 |
| `runtime/runtime-backend.ts` | lease、协议确认、恢复、走带与 telemetry |
| `runtime/runtime-editing.ts` | 编辑、撤销、预览、录制 journal |
| `runtime/runtime-saving.ts` | 已接受 checkpoint 的保存确认 |
| `runtime/history.ts`、`effective-document.ts` | 值输入输出的 checkpoint、history flags、preview 投影与比较 |
| `audio/useAudioWaveformView.ts` | 唯一 view、drag、selection、尺寸、refs 与失活订阅 |
| `audio/AudioWaveformRulers.tsx`、`AudioWaveformLayer.tsx`、`AudioWaveformOverview.tsx` | 只读 view，输入回交 owner，保留原生节点顺序 |

主入口只计算一份 ticks，标尺与主波形共享。`SourceWaveform.tsx` 和 `PeakColumns` 路径未改。Rulers 的 children 插槽保留 musical ruler → loop strip → waveform → time ruler 的原生子节点顺序。

`runtime.test.ts` 经 LSP 搬到 `runtime/project-runtime.test.ts`。去掉 import 声明后，搬迁前后的测试体逐字一致，含 152 处静态 `expect()` 调用。变异入口仅随文件位置和 owner 接收者更新锚点，没有移除 mutant。

## 实际验证

| 命令或场景 | 结果 |
| --- | --- |
| `bun test src/project/adapters src/project/sections/clip-edit` | 182 pass，0 fail，32 files |
| `bun test src/project/adapters/runtime/project-runtime.test.ts` | 34 pass，0 fail，181 次实际 expect 调用 |
| `bun src/project/adapters/verification/mutations.mjs` | 8/8 killed；搬迁套件后重跑仍全部被抓 |
| `bun src/project/sections/clip-edit/verification/mutations.mjs` | 44/44 killed |
| `pnpm --dir apps/gpuix exec tsc --noEmit` | 通过 |
| `pnpm exec eslint --max-warnings=0 apps/gpuix/src/project/adapters/runtime apps/gpuix/src/project/sections/clip-edit/audio` | 通过 |
| `node scripts/gpuix-review-scan.mjs` | 12 source、1 test，0 HARD、0 WARN |
| `node scripts/gpuix-ui-map.mjs --check` | 9 entries、3 routes、223 testIds，地图无需重生成 |
| 根目录 `pnpm verify:gpuix` | 完整通过，末行为 `verify:gpuix passed` |

完整门禁包含真实 native build、tsc、全应用 eslint、80 个架构规则测试、9 个文档路由、1213 pass / 1 todo / 0 fail 的 Bun 全套、扫描、UI map，以及真实后端 Home → 工程 → resume 首帧 smoke。smoke 观察到 nativePlaying=true、nativeBar=20.0671285，最后输出 `released idle`。现存 1 todo 不由本切片新增。未改 Rust，因此没有额外运行 `cargo check` 或 `cargo test`。

### 原生像素与行为

使用现有 `verification/consumer-probe.tsx`，真实 Rust backend、44100Hz stereo / 88200 frames 素材、满量 10000 notes / 1024 steps 工程。临时 preload 只把旧 `AudioWaveform.tsx` 从 `d31fbf7` 加载到内存，并把证据输出改到仓库外；没有 stash、回退工作树或修改 vendor。新旧组件均消费同一真实后端。

| 主题 / 语言 | 初始节点 | initial / zoom / scroll / final PNG SHA256 |
| ----------- | -------: | ------------------------------------------ |
| dark / en   |      216 | 4/4 与拆分前相等                           |
| dark / zh   |      216 | 4/4 与拆分前相等                           |
| light / en  |      216 | 4/4 与拆分前相等                           |
| light / zh  |      216 | 4/4 与拆分前相等                           |

汇总在 `/tmp/zoeydaw-s1-evidence/s1-pixel-parity.json`，完整组合图与 consumer JSON 在同目录的 `f4-s1-before-*-dense` 和 `f4-s1-final-*-dense`。consumer 的卸载检查通过，原生节点和 activation listener 均释放。

### Audio production 分段

沿用 `audio-profile-preload.ts` 与 `audio-render-cost.tsx cached-bounds` 的 3 cycles × 10 wheel steps，production、排除首个冷 step、原有 p90 算法和 logging 分段不变。下面公开五轮交错进程复跑的全部 p90，不丢弃慢轮。

| 轮次 | 原版 zoom p90 ms | 拆分后 zoom p90 ms | 原版 scroll p90 ms | 拆分后 scroll p90 ms |
| --- | --: | --: | --: | --: |
| 1 | 3.259 | 3.160 | 3.788 | 3.329 |
| 2 | 3.562 | 4.135 | 3.628 | 4.994 |
| 3 | 3.174 | 3.326 | 3.237 | 3.425 |
| 4 | 3.569 | 2.991 | 3.626 | 3.156 |
| 5 | 4.303 | 3.929 | 3.552 | 3.848 |
| 五轮 p90 中位数 | 3.562 | 3.326 | 3.626 | 3.425 |
| 规格历史基准 | 3.2 | — | 3.9 | — |

重复测量的中位数没有退化，zoom 相对历史基准增加 3.9%，在允许噪声内；scroll 更低。第 2 轮有慢尾，不能声称每一轮都在历史阈值内。逐帧和 render/commit/passive/hostCommit/applyBatch/getBounds 分段保存在 `/tmp/zoeydaw-s1-evidence/final-production-{before,after}-{0..4}.json`，汇总为 `s1-production-summary.json`。这些是离屏 CPU 墙钟，不是桌面 GPU 完成或前台 frame 时间。

复跑入口，从 `apps/gpuix` 执行：

```sh
NODE_ENV=production bun --preload ./src/project/sections/clip-edit/verification/audio-profile-preload.ts src/project/sections/clip-edit/verification/audio-render-cost.tsx cached-bounds
bun src/project/sections/clip-edit/verification/consumer-probe.tsx s1-recheck dense audio
```

现有入口默认把 JSON 写到 clip-edit/evidence；不要把复跑产物误提交为源码。

## UI 规范第 13 节证据

| 检查 | 实际证据与边界 |
| --- | --- |
| Gallery 与业务整体布局 | 真实 backend 的完整 Audio 组合原生截图已核对；未改共享 Gallery。前台 Gallery / 整体 app 评审交协调者，不声称已做 |
| 跨区域对齐与居中 | 四种组合的完整 PNG 与原版一致；新窗口 AX 的 waveform bounds 为 834×378，Zoom in 为 13×13 |
| 间距与内边距 | 保留原有共享 token；参数栏、工具栏、标尺、overview 的组合像素未变 |
| 统一设计入口 | 继续使用 useTheme、Button、Icon、SourceMarker、SourceWaveform；无新的圆角、边框或 spacing 入口 |
| 尺寸与紧凑感 | 节点数不变、图标按钮方形、overview 高 13；完整区域截图一致。当前 Live 没有选中的 Audio Clip，不能据此声称 Live Audio 密度对照完成 |
| 深浅主题与中英文 | 四种组合各 4 个全图 SHA256 相等 |
| 状态与键盘 | 原有 AudioEditor、marker-shortcuts、pressed-families、clip-edit 原生回归及全套测试通过；原生 overview 为有名称的 slider，值 0.250 |
| 拖动、滚轮、弹层与性能 | 现有行为回归和 44 个 clip mutant 全部通过；满量轮滚动/缩放像素一致。分段 CPU 证据如上，物理输入与前台帧仍归协调者 |

### 产品规则 → Live 观察 → 实现 → 差异 / 未验证

| 产品规则 | Live 只读观察 | 实现 | 差异 / 未验证 |
| --- | --- | --- | --- |
| 不改变现有 Audio 交互语义 | 当前 Live 为 Arrangement / Device detail，没有选中的 Audio Clip；未修改工程或触发播放 | 只拆 owner 与子视图，已有 16 张业务组合图与原版相同 | 本轮无法观察 Live Audio source ruler / overview，未宣称与 Live 一致 |
| 走带和录制不由视图重构改变 | AX 显示播放=0、Arrangement 录制=0 | runtime 原始生命周期与协议顺序保留，真实 backend smoke 通过 | 未在用户 Live 中执行录制或编辑 |

Live 观察截图为 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a7ae8f5eb89330.png`。此截图只证明实际观察了当前界面，不作为 Audio 区域的对照证据。

## 真实后台窗口与进程清理

两次仅操作自启命名服务，均使用 `GPUIX_BACKGROUND=1 bun --hot`，没有 acquire 桌面控制，也未停止用户服务。

| 服务                        |   PID | 验证后状态             |
| --------------------------- | ----: | ---------------------- |
| `s1-audio-background`       | 29585 | 观察后 15.0s 内已 stop |
| `s1-audio-final-background` | 39371 | 观察后 23.6s 内已 stop |

最终窗口 AX 为 `engine=ready`，overview=0.250，Source time 在 source/fade markers 之后，原生读取顺序已保留。启动前后的前台窗口均为 Orca。证据在 `/tmp/zoeydaw-s1-evidence/final-background-audio.ax.txt` 和 `final-background-bounds.json`。最后一次工具 stop 元数据为 exited / exit=1，日志只有 created native window 与 mount complete，没有错误文本；不将工具强制停止描述为正常 exit=0。

清理检查实际执行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空，退出码 1 表示无匹配。没有本切片残留进程。临时 preload 脚本完成验证后删除，保留仓库外的观测 JSON 与截图。

## 自审结果

独立只读 `pstack-reviewer` 审查完整 `git diff b26a15b...HEAD`，分别按 Standards / Spec 核对规范、单一 owner、生命周期顺序、公开 API、原生节点顺序、测试和变异。Standards 0 项，Spec 0 项；它未重复运行父任务的验证命令。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| 首次扫描 no-tests HARD，因为纯搬迁源码但未涉及测试路径 | 必修 | 将既有 runtime 套件搬到 runtime 目录，不添加或改写断言 | LSP rename_file，测试体一致，34 pass；最终扫描 0 HARD / 0 WARN |
| 基线 held Button mutant 存活，既有测试未验证 release 后锁存填充 | 汇报仲裁 | 未在 S1 修改该断言；协调者以 b26a15b 修基线，S1 同步后全量重跑 | 44/44 killed，mutation 定义不变 |
| 提取时 time ruler 排在 waveform 前，原生 AX 顺序改变 | 必修 | Rulers children slot 恢复原次序，ticks 也恢复为一份共享计算 | 最终 AX 顺序、16 张 PNG SHA256 相等 |
| 最终扫描与独立双轴审查 | 记录 | 没有残留发现，没有 WARN 待处置 | 扫描 0/0，review Standards 0 / Spec 0 |
| 后台 / 离屏结果不能替代前台视觉和帧验收 | 记录 | 明示边界，交协调者前台串行验收 | 未发起桌面控制，未声称实际前台性能完成 |

## 错题

- 错：只按 AST 名称搬迁 state 引用时，`beginEdit(owner)` 的局部 owner 会遮住 runtime owner。对：区分编辑 owner 字符串与 runtime 接收者，并用类型检查验证所有搬迁函数。因：AST 名称相同不等于符号相同；本轮 TypeScript 的 string 属性诊断抓到了错误。
- 错：从仓库根直接 `pnpm exec tsc -p apps/gpuix/tsconfig.json`，拿到 TS5101 / 6.0 deprecation 提示。对：使用 setup 的 app 范围命令或统一 verify。因：根命令与 app 锁定工具解析不同，不应修改 tsconfig 掩盖调用错误。
- 错：把功能折叠测试当成锁存渲染覆盖。对：原 owner 增加释放后的实际 fill 检查，保留原 mutant。证据为协调者 b26a15b，不重复写 LESSONS。

## 已验证做法

- 把全部可变 runtime 字段留在一个对象，按职责移出命令函数；无需状态同步、manager、兼容层或第二份工程。
- 用原生 Fragment 与 children slot 拆视图，保持 host 树次序，不为文件拆分增加布局容器。
- 旧组件通过临时内存 preload 对照，新旧都用真实 backend 与原有输入协议。PNG SHA256、节点数、变异和分段原始样本分别证明不同事实。
- 原断言不动。测试仅就近搬迁，纯重构仍能通过扫描和原有变异入口。
- 原生窗口只做后台只读验证，观测后立即停止命名服务；前台输入和帧门槛不伪造。

## 提交与剩余项

- `67bb722b6e9efa539c503775bc2c1a6dca906b6f`：runtime 职责拆分。
- `e879b9158fd9871aa85c0226bdc6cae48e6c097d`：AudioWaveform 单一视图 owner 拆分。
- `21578429922415442e8a996f5198fc8d952b810d`：断言不变的 runtime 测试搬迁。

协调者已批准 adapters README、CHANGELOG 和必要时生成 UI map 的文档范围。地图实际检查未变化。没有代码未实现项或待新增依赖；剩余的是协调者的复核、合入确认与前台最终验收，收到合入结果后才发送 worker_done。
