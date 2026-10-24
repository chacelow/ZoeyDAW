# DAW 参考 cookbook

更新：2026-10-23。面向 ZoeyDAW 的播放连续性、低延迟、波形和时间线反馈。本文是长期导航，不是已经完成的能力清单。

## 阅读入口

| 文档 | 用途 |
| --- | --- |
| [音频、Rust、Tauri 参考目录](cookbook-audio-references.md) | 第一份用户清单的全部项目、文章、许可证与采用限制 |
| [Canvas、波形、播放线参考目录](cookbook-canvas-references.md) | 第二份用户清单及缺少精确 URL 的线索，按渲染问题查找 |
| [Ableton 式原子零件目录](cookbook-atomic-references.md) | 第三份清单，按九类模块核对库能力、许可证和当前栈适配 |
| [Meter 专项与架构纠错](cookbook-meter-references.md) | 两份外部评审的全部线索、single-flight pull 决策、已读源码与待核实来源 |
| [统一实时控制与遥测设计](realtime-sync-design.md) | input、track、device/plugin meter、多Dock/Mixer的身份、背压和容量契约 |
| [当前项目逐项评审](daw-current-review-2026-10-22.md) | 已具备、未做到位、缺失和不适用项，以及代码与运行证据 |
| [播放与渲染重构计划](daw-refactor-plan-2026-10-22.md) | 实施顺序、模块接口、失败语义和验收门槛；待实施方案不是现状 |
| [既有开源 DAW 深读](open-daw-architecture-2026-10-22.md) | Ardour、Tracktion、Futureboard 的媒体、流播、时钟和许可证据 |
| [既有 Browser 专项](browser-playback-reference-2026-10-22.md) | 浏览器索引、试听与导入行为 |
| [冻结验收契约](audio-acceptance-contract.json) | 数值阈值与负载，不能因实现困难降低 |
| [真机矩阵](audio-hardware-matrix-2026-10-22.md) | 硬件覆盖范围；历史通过不替代当前版本复测 |

## 反馈到参考的路由

| 用户反馈 | 先看项目路径 | 对照参考 | 要证明什么 |
| --- | --- | --- | --- |
| 空格后卡一下、定位响应慢 | runtime `submit` → connection `drain` → native `apply` | daw-tauri 小命令、Maolan transport、Tauri Channel | 队列等待、主线程等待和首个生效音频块分别耗时多少 |
| 拖动音量、fade 时播放卡住 | native `sameGraph`、`updateMixer`、`updateEnvelopes` | Tracktion 原位 setter、vibez 参数发布 | 不额外 stop/seek/play，实际输出随最新参数变化 |
| 移动 Clip、改路由时断播 | `EngineSession::prepare/apply` | Tracktion 同 Edit 图重建与节点状态复用 | 稳定对象身份、图采用时间、不中断的真实输出 |
| 播放头顿挫、被旧值拉回 | connection telemetry barrier、插值、canvas playhead | audio-ui、Maolan、Ryosuke timeline | seek generation 正确；UI 插值不成为音频时钟 |
| 波形锯齿、缩放突然换样式 | core signed-waveform、range demand、三个视图 | wavesurfer、waveform-playlist、gl-waveform、Ardour peaks | 真实正负峰谷、声道分离、固定外观；不伪造采样点 |
| 长工程缩放、滚动卡顿 | canvas scheduler、painters、viewport、range cache | waveform-playlist、Canvas-Timeline、OffscreenCanvas | 可见范围工作量、主线程长任务、帧时间和内存 |
| 后台分析拖慢播放 | native analysis、媒体 worker、IPC | Ardour Butler、vibez 工作线程、Tauri Channel | 音频 callback 不做文件分析；后台任务有取消和资源预算 |
| 插件崩溃拖垮应用 | 当前 native plugin owner | Maolan plugin host、vibez scanner | 先区分扫描隔离与运行隔离，再设计 IPC 与恢复 |
| 长压缩音频占用过大 | Tracktion reader/proxy 路径 | Ardour、Futureboard、Tracktion 源码 | 固定工作集，不能把渐进全量解码称为有界缓存 |
| input、插件前后级、多窗口 meter 不一致 | native telemetry、MeterBank/MeterHub 与每 WebView MeterStore | [meter 专项](cookbook-meter-references.md)的 Tauri、hollance、ArcSwap 证据 | 单消费者累计、选择性 reset、迟到响应、多窗口一致性与实际帧年龄 |

## 证据与复用规则

1. 收到同类反馈，先定位上表对应路径，再读参考的具体实现。不能只按关键词选库或照抄 README。
2. 每次比较写明症状、当前调用链、参考机制、差异、选择和验证命令。已有能力不重复造轮子。
3. 区分源码核实、官方文档声明、用户提供线索和本机运行。本文没有运行参考项目，不据此排名谁更快。
4. 直接复制代码前固定 commit、核对文件级许可证和第三方依赖许可、保留归属。GPL 代码不能因隔着 Rust/C++ FFI 就视为免除义务；无明确许可证不直接复制。
5. 优先调用现有 Tracktion/JUCE 能力。参考 CPAL 引擎的命令模型，不引入第二个声卡 owner；参考 WASM 的调度模型，不把浏览器音频时钟套在原生设备上。
6. 将一次性实施状态放在评审与计划中。cookbook 保存可复用判断，新增测量必须注明环境、输入、版本和口径。
7. 同一个标题有多个可能来源时保留为“待定位”，不生成猜测链接。项目改名、404 或未完成设计同样保留记录。

## 需要纠正的常见推断

- WebView IPC 不是零延迟，但它不自动解释明显卡顿。必须拆开测量输入、排队、执行、音频采用与设备输出。
- Tauri 高频流不应一概使用 Event。[官方 Channel 文档](https://v2.tauri.app/develop/calling-frontend/#channels)强调有序流，Event 不适合大量数据。换通道不等于修好图重建。
- 离开音频线程不等于可以离开主线程。Tracktion 插件初始化与 Edit mutation 有 message-thread 约束。
- sample counter、transport position、audible position 是不同坐标。设备累计回调帧不能直接当工程位置，seek 和 loop 后尤其如此。
- 峰谷数据不能恢复原始采样时序。缩小时保留 extrema，深度放大读取原始 samples；不对 peak bins 拟合漂亮曲线冒充音频。
- “60 FPS”“lock-free”“后台建图”是需要核实的具体路径，不是整个应用的性能保证。

## 当前实施范围

已批准的完整实施覆盖统一协议与 MeterHub、控制快路径、稳定 Edit、内置与外部插件、输入、时间域、MIDI、自动化、Session、Warp、录音、设备恢复和波形缓存。早期参考目录中“暂缓集成”属于当时的研究判断，不缩减当前批准范围。能力完成以源码和实际验收为准，文档选型不等于已实现。Meter 生产方案以 [实时同步契约](realtime-sync-design.md) 为准，早期 Channel 加 meter receipt 方案已替换。
