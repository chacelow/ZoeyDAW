# Browser 与播放限制的重新评审

2026-10-22。回应“这些限制是不是现成方案已解决，交互是不是不合理，以及能否比 Live 做得更好”。这是研究判断，不是功能缩减授权或实现完成声明。

## 结论

可以争取在 Browser 到编排这一条具体工作流上超过参考产品。但需要分别比较交互、声音和资源消耗。既不能用“纯 Rust”证明快，也不能用“别人有这个按钮”证明交互合理。

“先原速播放再考虑保持音高”“先只做 macOS”“为发声迁移 gpuix”不再是当前方案。用户已确认首批 macOS 与 Windows、本地音频、必须支持工程 BPM 同步保持音高，并明确不迁移现有 UI。

## 逐项撤回或重定性

| 原先说法或潜在限制 | 依据与判断 | 修正后的方向 |
| --- | --- | --- |
| 先原速播放即可完成首批闭环 | 是我为缩小实现范围提出的建议，不是用户要求，也不是物理边界。用户明确否定。[需求确认] | 原速是合理的素材播放模式，但不能替代本次要求的保持音高节拍同步。 |
| 整体必须纯 Rust | 当前仓库采用 Rust 壳，旧调研倾向 Rust；用户本轮优先级是性能、兼容性与体验。语言本身不证明实时安全或质量。[仓库 Cargo.toml][S1] | Rust 是现有集成起点，不排除必要的 C++ DSP、成熟引擎或授权算法。先比较总成本和实测结果。 |
| 音频性能要求必须迁移 gpuix | UI 渲染性能与原生音频 deadline 是不同问题。用户明确“不迁移”。[需求确认][S2] | 保留 React、Tauri 和 Canvas。音频独立运行；如有 UI 瓶颈按 profiling 处理，不以迁移框架代替证据。 |
| 索引完成前整个 Browser 不能使用 | Live 手册描述扫描完成后内容可访问，但没有理由把此行为作为新产品硬要求。[S3] | 设计目标是增量可用、进度明确、可取消，不让全库扫描阻塞已知目录浏览和正在播放的工程。仍需性能原型验证。 |
| 原速 Raw 模式不能定位 | 是 Live §4.9 的公开行为，不是数字音频必须遵守的限制。[S3] | 不直接照搬。允许原速定位是候选改进，需验证长压缩文件随机 seek 的准确度与响应；可有短暂加载状态，但不应无解释禁用。 |
| 所有试听只能等下小节 | Live 在 Raw 关闭且 transport 运行时有量化试听；停止工程时不适合无缘由等待。[S3] | 分开“正在准备”和“等待同步点”。即时原速与工程同步是不同意图，不用单一规则处理所有素材。 |
| 首次必须全文件分析完成才能有任何操作 | Live Warp 文档说明首次分析期间不能播放/编辑。这是参考现状，不是我们的验收目标。[S4] | 原始试听、波形可见、节拍同步就绪分开。优先让用户立即浏览和获得可用反馈；未有可靠 tempo map 时不得伪装为已完成同步。 |
| 所有样本必须自动拉伸 | Live 也区分 One-shot、Warped Loop 和长素材，并提供关闭 Warp。[S4] | “具备同步能力”不等于“强制处理每个文件”。鼓单击、音效、自由速度录音应保留合理语义。 |
| WAV、AIFF、FLAC、MP3 就是永久格式上限 | 是首批格式集合，不是用户授权的永久产品边界。容器扩展名也不足以定义具体 codec 支持。[需求确认][S5] | 建实际格式与编码矩阵。可采用成熟解码器扩充，不因某 wrapper 未开 feature 就宣布产品不支持。 |
| 整首解码进 RAM 才能随机定位或画波形 | SoundCraft 当前采用整文件 SourcePool；它自己将长会话内存列为缺口，不应继承。[S6][S7] | 短样本可以全解，长素材比较有界块缓存与 PCM 磁盘代理。画波形用峰值层级，不必把 PCM 发往 UI。 |
| 大压缩文件必须让用户转 WAV | Futureboard 当前部分峰值路径存在此限制。它是实现限制，不是本产品的合理交互。[S8] | 后台分块解码与峰值生成；如内部需要代理，由程序管理、显示进度，不强迫用户手工转换。 |
| 同源文件只能有一个流播位置 | Futureboard 的单 reader_frame 共享 ring 有同源不同区间并播风险，尚未复现。[S8] | 内容和缓存可以共享，每个 Clip 播放实例的游标、拉伸和循环状态必须独立。 |
| 所有控制命令队列满了可以直接丢 | 旧实时规则把参数流、数据和命令混在一起。Stop、seek、note-off 与可合并的连续目标值不能统一丢弃。[旧 zip realtime-audio-rules.md] | 队列策略必须按语义制定。音频回调不等待，不等于可以丢失停止、松键或最终编辑状态。 |
| 默认复制一切才安全 | Live 与 FL 都区分库目录引用和工程已用素材收集。复制全部库浪费磁盘和时间。[S9][S10] | 添加 Browser 目录不复制。工程收集与播放缓存分离，默认策略还需确认。不在本轮擅自定“永远自动复制”。 |
| 未保存工程必须先弹保存框才能试听 | 没有该需求或技术依据。Live 有临时工程目录。[S9] | 试听不要求先保存。需要持久素材的操作由临时工作区拥有，保存时再完成迁移，不阻断初次探索。 |
| 不支持原生音频是长期产品边界 | `docs/product-prototype.md` 是当前原型现状说明，不是用户要求永久无音频。 | 本轮仍只调研。实施获准后，真实能力与原型边界必须同步更新，不能用原型说明拒绝建设目标能力。 |
| 第三方插件、录音、Live 工程等现在一起做 | 用户选首批本地音频，本轮核心是 Browser 与时间线播放。 | 这是当前研究与交付顺序，不代表永久不做。不能为显得完整把未授权实现范围扩大。 |

## 哪些是真正需要守住的边界

- 实时回调必须在设备 deadline 内完成，不能把磁盘、目录、网络或 UI 工作同步放进去。[S2][S11]
- 有界内存和读盘带宽意味着预读与缓存取舍。不能承诺任意文件、任意轨数和任意低缓冲始终无掉音。
- Tempo 检测存在半倍、双倍、首拍和自由速度误差。已知 BPM 不等于已知 downbeat，更不等于完整 warp map。[S4]
- 时间拉伸存在瞬态、音高、相位、延迟与 CPU 权衡。一个算法支持保持音高不等于所有素材都有 Live 同级音质。[S4][S12]
- 许可证、厂商 SDK 条款、真实设备驱动与系统权限是外部约束。不能通过改个 wrapper 或换语言消失。
- macOS 上运行通过不能证明 Windows。必须在交付平台及代表设备上验收。

这些边界应转成准备策略、进度、取消、错误恢复和验证，不应直接变成禁用按钮或静默降级。

## 现成方案已经解决了什么

| 能力 | 可核对的现成实现 | 采用判断 |
| --- | --- | --- |
| 媒体源与剪辑分离 | Ardour Source/Region、Tracktion SourceFileReference | 借鉴不变量，避免重新发明路径即身份。GPL 源码不直接混进当前 Apache-2.0 产品。 |
| 非实时磁盘读取、seek 与 loop refill | Ardour DiskReader + Butler | 成熟职责参考。不为了保持 Rust 就否认这些问题已有人解决。 |
| 整体可嵌入编排引擎 | Tracktion Engine | 真实候选。C++、JUCE 消息线程、商业许可和特定压缩缓存路径需要验证，不因非 Rust 排除，也不因现成就直接采用。 |
| 快切试听取消与峰值缓存格式 | Futureboard token 与 FBPEAKS1 | 有实际 Rust 源码可研究，需检查局部许可、依赖、线程和多实例行为。 |
| 解码、重采样、时间拉伸 | 独立音频库及商业 SDK | 使用成熟算法，不自研 codec。版本、feature、延迟和许可证逐项核对。 |
| 声音与 UI 分离、批量状态传输 | 原生引擎样本时钟、Tauri Channel | 沿用现有 adapter 边界，但状态确认、取消和大数据通路不能照搬 mock 假设。 |

具体源码与版本证据在配套开源 DAW、音频库研究报告中，不把上述表当完成集成。

## 如何判断“更好”，而不是“不一样”

候选优势包括原速也可定位、索引期间增量可浏览、素材依赖更明确、快速试听取消可靠、预览到编排设置一致。但必须验证用户是否少等待、少纠正、少丢素材，以及声音和资源是否没有退化。

基准使用同一批合法素材、机器、音频设备、采样率和 buffer。至少区分短 one-shot、节奏循环、人声、全混音、长文件、坏文件及同源多位置并播。

不通过给竞争产品增加默认高质量效果、给自己关闭必要处理等方式制造优势。不用软件音频 CPU 百分比直接对比系统任务管理器 CPU，也不用平均 UI FPS 掩盖尾延迟和音频 deadline miss。

## 来源

[S1]: https://github.com/Tracktion/tracktion_engine
[S2]: https://www.ableton.com/en/live-manual/12/computer-audio-resources-and-strategies/
[S3]: https://www.ableton.com/en/live-manual/12/working-with-the-browser/#previewing-files
[S4]: https://www.ableton.com/en/live-manual/12/audio-clips-tempo-and-warping/
[S5]: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/chansettings_sampler.htm
[S6]: https://github.com/storytold/soundcraft/blob/9b8283b90877813a929f5e28b2dc92e5774da933/crates/model/src/source.rs
[S7]: https://github.com/storytold/soundcraft/blob/9b8283b90877813a929f5e28b2dc92e5774da933/docs/gaps.md
[S8]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereDirectAudioEngine/src/audio_file.rs
[S9]: https://www.ableton.com/en/live-manual/12/managing-files-and-sets/
[S10]: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/songsettings_settings.htm
[S11]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/butler.cc#L169-L307
[S12]: https://licensing.zplane.de/uploads/SDK/ELASTIQUE-PRO/V3/manual/elastique_pro_v3_sdk_documentation.pdf
