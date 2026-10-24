# 统一实时控制与遥测设计

核查：2026-10-23。状态：统一 wire、低频 metadata 校验、native 输入采集与 graph observer 已实现并通过独立样本验证；MeterHub、WebView 拉取、source observation 与 UI 接线尚未完成。对应用户要求：输入电平、Track、每个Device/Plugin及多个Dock/Mixer视图同时实时更新，不能未来再各建一套timer和队列。

入口：[cookbook](daw-cookbook.md)、[整体计划](daw-refactor-plan-2026-10-22.md)。统一的是身份、生命周期、订阅和调度，不是把所有流量塞进同一个FIFO。

## 当前缺口

`packages/project-core/src/backend.ts::BackendTelemetry.levels` 仍是按字符串 Track ID 索引的左右声道数值。native `EngineSession::telemetry` 暂从 graph observer 的唯一 collector 缓存取值，并附带 device snapshot；旧 LevelMeasurer client 采集已删除。app `native.ts::schedulePoll` 仍每轮完成后等待约 33ms。该 JSON 消费链尚待步骤 3 整体切换，不能称为统一 binary Hub 已接通。

原生 graph 已具有 track/bus/master/cue 输出和 Device 前后级 endpoint，input bank 独立按 deviceEpoch 换代；这些身份尚未经统一 Hub 接入 WebView。每 endpoint 数据年龄、高负载流背压和多窗口共享快照仍待完成。instrument/third-party plugin 自报遥测不等同 host 音频 meter。现有 SharedArrayBuffer 是前端局部槽，不是 Rust 到 WebView 零复制通道。

四种内置 Device 已经由 `BackendTrack.devices` 和 `projectBackendDocument` 投影至原生稳定实例链，参数与 Device 自动化能够影响真实处理。Utility、Filter、Delay、Reverb 的 DSP 回归及 Utility 设备前采集通过；混响采用固定版本 Signalsmith，decay 是名义尾音时间，不保证完整脉冲精确 RT60。Device 前后级 tap 直接观察 PluginNode 与其输入样本，不复制轨道输出。第三方插件宿主与 meter UI 尚未接通。

## 一套入口，三类语义

| 类别 | 数据 | 交付与拥塞规则 | 不可混用 |
| --- | --- | --- | --- |
| 控制/事务 | transport、参数gesture、文档事务、订阅配置 | 优先控制与有序事务按整体计划处理；生成号和ack明确 | 不能排在meter/波形后面；不可丢commit或note edge |
| 最新快照 | transport observation、input/track/plugin/bus峰值、RMS、CPU负载 | 每session保留最新待发快照，慢消费者覆盖旧值；有明确最大在途量和恢复握手 | 不积压历史帧，不把旧meter依次动画出来 |
| 有序事件/大数据 | device/plugin fault、clip/overload累计状态；waveform/FFT chunks | 小事件带序号与重同步协议；大数据独立预算、取消与流控 | 错误不可悄悄丢失；FFT不能占用transport快路径 |

生产 meter 固定使用 single-flight binary pull。每 WebView 一个调度器，rAF 限 60Hz，降级 30Hz，最多一个 invoke 在途。promise 完成只保存 pending ArrayBuffer，下一 rAF 校验、采纳、绘制并请求下一帧。同 seq 返回空 Response。隐藏或 pause 代际改变丢旧响应；rAF 间隔超过 250ms 时先标 stale，丢暂停期间 pending 与旧在途响应，不补播。请求超过 500ms 标 stalled，但不并发补发或假称已取消。可靠事件独立使用有序 Channel，每批最多 64 条、每 stream 一批在途、service 保留 4096 条，receipt 只回收事件。溢出报告 event-gap、累计 counter 和 latch。依据见 [meter 架构纠错](cookbook-meter-references.md)。

## 身份与数据布局

控制面发布 `MeterRegistry { sessionEpoch, graphGeneration, registryRevision, endpoints }`。字符串ID只在registry和变更中传输，高率帧使用紧凑slot编号。

每个endpoint包含：

- 稳定owner身份，分input port、track、device/plugin、bus/send、master/cue。
- 明确tap位置，pre/post plugin、pre/post fader、input/output；不让一个`level`含糊代表不同位置。
- channel layout及slot range，支持mono/stereo和多声道，不把所有plugin固定为左右两值。
- 指标能力，host peak/RMS、true-peak、gain reduction、plugin自报meter分别声明。host不能从音频幅度猜测压缩器gain reduction；不支持时显示unavailable。

levels v1 使用 128-byte header、每声道 48-byte record、每 source observation 48 bytes，全部 little-endian。header 区分 generation、deviceEpoch、registryRevision、streamId、seq、controlGeneration、acceptedRevision、audioRevision 与 resetEpoch。u64 JSON 字段为十进制字符串，二进制为 u64，JS 使用 BigInt。seq 递增时即更新值，不按 generation 跳过绘制。唯一 wire 定义 `protocol/realtime.json` 生成 TS、Rust 与 C++ 产物，低频 metadata 使用生成的 Zod/serde 契约。`pnpm check:realtime-protocol` 验证全部字段与独立 golden fixture，跨语言精确保留大于 2^53 的整数。

图删除或重排时，先发布对应registry再采用该generation数据。旧generation不能写进已复用slot。前端未收到registry时丢弃/请求基线，不把未知slot映射到下一插件。

`SourceRegistry` 在 document/audition 接受前准备身份，成功后才安装。多个 arrangement clip 共用 sourceHandle、各有 clipHandle；同 session 重排/删除不回收 handle，替换内容增加 sourceGeneration。Browser 无 SHA 的源使用明确的 temporary-preview 身份，记录路径、size、mtime 和实际 decoder metadata，不按路径与 authored SHA 源合并。preview stop 清活动映射，seek 恢复当前 generation，session 更换重新绑定存活 preview。当前仅实现身份，不以 timeline position 伪造 sourceFrame；实际 AudioClipPlayhead observation 尚待接线。

## 原生采集和发布所有权

1. graph 准备阶段预分配每 tap/声道状态。现有 `LevelMeasurer::Client` 含 SpinLock 和声道 resize，不作为无锁采集路径。input bank 按 deviceEpoch 独立，graph 更换不能清除其历史。
2. audio callback 只累计本块 max、sumSquares、count、clipCount，不做 sqrt、dB 或 ballistics。每 tap 一个 writer，graph worker 迁移依赖执行屏障，Hub 是唯一 consumer。
3. 每 tap 两个采集 epoch 与三槽 SPSC mailbox。旧 epoch 未确认不得复用。Hub 按 epoch 去重和累计差归并，保留最近至少 300ms 的完整 epoch 统计，不按比例插值能量。不足 300ms 为 rmsInitializing；超长量超过 50ms 为 rmsStale 并重新积窗。两种状态的 RMS 字段填有限 0，消费者不得解释为有效静音。
4. 唯一非实时 MeterHub 在有可见兴趣时 120Hz 聚合，无兴趣时 20Hz 维护状态。固定 arc-swap 1.9.3 仅发布 HubSnapshot，Arc 分配和析构不进入 audio。窗口从同一快照筛选，不建多份量测时钟。graph lane 在旧 worker 结束及 read handle 释放前不回收。
5. Hub 以真实单调 dt 维护瞬时 attack、24dB/s release、600ms hold 后 24dB/s 衰减。sessionPeak 和 clipCount 锁存至 reset。选择性 reset 在音频块生效后广播 affected endpoint、slotIds 和 slotResetEpoch。header.resetEpoch 为全局操作顺序，不要求所有 slot 相等。reset(A) 不清 B，旧 pull 不降低 expected epoch。设备停机时显示衰减但 valid=false，不冒充新输入。reset 意图以每类操作的累计代际发布，不只保留最后一个 kind。clip reset 不删除未消费的能量 epoch；hold reset 使用每个 current/completed epoch 内独立的 displayPeak 与 holdResetEpoch，保留 reset 后的短脉冲且不复活旧峰。非 finite 输入污染的 epoch 单独 valid=false，后续干净 epoch 可恢复，Hub 不得因当前 available 就忽略 completed.valid。MeterReadHandle 是 bank 的唯一消费入口。
6. input监测不等于监听输出。只有用户授权的设备输入和已有record/monitor策略决定音频路由；订阅meter不偷偷开启麦克风或监听。

`DeviceClock` 现把已打开设备的输入块交给独立 `InputMeter`。准备阶段按实际输入声道分配 bank，设备重开递增 deviceEpoch，graph 重建不改输入历史；stop 不伪造新样本。该接线不打开输入设备、不请求权限、不建立监听路由。独立真实样本测试覆盖 mono/stereo、换代和退役引用，硬件输入与 WebView 显示仍未验收。

外部音频监听已复用 Tracktion input instance/target 与 WaveInputDeviceNode，在 clips 合流之前通过 `wrapLiveInput` 加每轨 In/Auto/Off。监听仅绑定已经显式配置启用的输入，不因文档或 meter 订阅请求权限。Hosted Audio 的真实 DeviceManager 回调链验证共享输入、独立模式、Auto Clip 区间抑制、停止监听、context 重建与硬停止 fence；物理麦克风和真实 WebView 尚未验收。

现有 API 复核后，生产 meter 插入已改用已有 per-output hook 与 graph observer，删除新增每轨 factory 字段和三个 vendor 插入调用。observer 在初始化前将被观察节点登记为真实依赖；多输出按实际 Node 身份分配唯一 writer。原生测试覆盖 2 workers、memory sharing/pooling 四种组合、五种输出状态、共享节点的多输出不重复累计。graphBuilt/graphPosted 的精确生命周期和 legacy master meter 抑制仍是独立扩展，不因 observer 成功而假称可一并删除。observer 依赖当前应用的最终 fence 和唯一 mute 节点结构，不承诺任意 Tracktion 拓扑；拓扑变化必须通过相同样本测试。完整依据见 [现有 API 复核](cookbook-meter-references.md#2026-10-23-现有-api-复核)。

Device meter 使用 `device/<id>/in` 与 `device/<id>/out`，owner 为稳定 Device ID。相邻插件输出和输入可能是同一 Node，但各 endpoint 有独立 bank；同一 endpoint 被多个输出根发现时只创建一个 writer。双 worker、sharing/pooling 四种组合的样本回归覆盖两个串联 Utility 的独立输入输出能量。当前 collector 仍在原生进程内，未新增每插件 timer 或 IPC。

Rust `realtime/rms.rs` 按累计 epoch 替换能量，保留至少 300ms 的完整窗口，超过 350ms 或输入间断时重新积窗。`ballistics.rs` 按单调时间计算 600ms hold 与 24dB/s release；`channel.rs` 将结果编码为单声道 WireRecord，重复 publication 不刷新 freshness，失效旧 epoch 不清除正在恢复的新窗口。原生 MeterTap 到 Rust 的样本 smoke 验证短峰能量和 completed 重放去重。以上聚合模块尚未接入生产 Hub、IPC 或 WebView，不能视为整条同步路径已完成。

## Web消费与Canvas绘制

每 WebView 一个 MeterStore 拥有 registry、最新完整 snapshot 和兴趣并集，独立窗口不共享 JS 对象。全应用 native 唯一 MeterHub。接口固定为 `acceptRegistry`、`acceptFrame`、`readLatest`、`setInterest`、`subscribeMetadata`、`dispose`。兴趣按稳定 endpointId 保存，新 registry 重新解析 slot；owner token 防止旧清理删除新兴趣。

Arrangement、Mixer、Device rack、浮动窗口各自的可见集合合并后发送。重复显示同一endpoint不增加采集任务。面板移动、隐藏、卸载、engine release时引用计数清理。input meter即使transport停止仍可能活跃，因此调度条件必须是active interests/data而非`playing`。

每个面板一个 meter Canvas 与 layout rect 表，复用 arrangementScheduler。同一帧读取同一 buffer，React 只订阅 registry、错误与低频生命周期，level 不 setState。静态渐变和刻度按主题尺寸缓存，数字限 10Hz；每 plugin 不建 timer 或 IPC。衰减真相归 Hub，不由各窗口独立重算。

默认可见 60Hz。最近两秒 paint p95>16.67ms 降至 30Hz 并显示 degraded，连续五秒≤12ms 恢复。频谱使用独立 interest 与 binary snapshot，每窗口最多一个 endpoint、全应用最多四个；FFT 不混入 levels。LUFS、true-peak 与 plugin GR 按明确 capability 和独立帧类型发布，不能从 peak 推算。

## 预算和验收

不能只测一个track。新增冻结前的同步负载阶梯为16/64/128 tracks、每轨0/4/8 devices、input endpoints和master/cue、多面板重复显示。平台无法承载的组合必须标出容量，不承诺无限扩展。

带宽按实际布局计算。128 tracks × 8 plugins × 每 plugin input/output 两个 stereo tap = 4096 声道槽。无 source 记录时每帧 `128 + 48 * 4096 = 196736` bytes，60Hz 为 11804160 bytes/s，尚未计入 track/input、source 尾记录和 IPC 副本。这是算术预算，不是吞吐测量。默认只订阅可见面板兴趣，不自动订全部工程。

验收必须同时覆盖：

- 播放中连续改参数，声音按最新完整版本生效，计时与capture无额外停顿；meter延迟和声音延迟分别测。
- registry增删、插件重排/替换、session切换，旧数据绝不落到新slot；多声道正确。
- UI阻塞/隐藏1秒后恢复，只显示最新快照，publisher积压和内存有固定上限；不可丢事件通过序号检测并重同步。
- 多Dock/Mixer显示相同endpoint，只有一个原生publisher和一个session hub；关闭全部视图后无残留订阅。
- input信号在transport stopped时继续刷新；无输入授权时不得采集或路由。
- RMS窗口、peak hold、clip latch、mute/solo、pre/post tap的数值用已知音频验证；无plugin meter能力时明确不可用。
- 同时运行索引、波形、保存和缩放，记录snapshot producer→receipt→paint年龄p50/p95/p99、Canvas耗时、IPC bytes/s、allocations、callback deadline和xruns。

沿用冻结音频/UI阈值。正常负载 meter 采集→Hub→pull→paint 年龄 p95≤33.4ms、p99≤66.7ms，计时映射误差上界计入判断。步骤 3 开始先在已有 Tauri 窗口测 33KiB 与实际 payload，含空闲、1.2 秒 UI 阻塞、120Hz 和双窗口；raw Channel 与单 credit Channel 只作对照，不保留第二生产通道。未测平台标 NOT VERIFIED。ArrayBuffer 仍要边界校验并统计 alloc/copy，不宣称零解析或一次拷贝。
