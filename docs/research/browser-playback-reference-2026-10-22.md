# Browser 与时间线播放的参考行为

2026-10-22。研究记录，不是已批准的架构决策，也不代表 ZoeyDAW 已实现这些能力。

## 目标与已确认边界

用户要求以 Ableton Live 为基线，并在使用体验和性能上做得更好。不能用静态外观或“能出声”代替完整操作。首批目标是 macOS 与 Windows 桌面端，本地音频，跟随工程 BPM 且保持音高。保持现有 UI，不执行 gpuix 迁移。媒体复制还是引用尚未决定。

研究先回答事实，再提出推荐。用户允许用 ask 一次询问多个独立问题，但不希望代替调研去逐项询问实现细节。

2026-10-22 用户后续纠正优先于本文推荐：Browser 为目录树而非平铺分页。添加目录位于左侧 Places 列表末尾。Browser 始终原速原调独立试听，绕过工程 Master，底部波形可点击定位播放并显示真实进度；自动试听开关只控制选中即播。BPM 匹配发生在拖入编排后，不要求先在 Browser 填源 BPM，不提供 Browser sync 选项。下文 Live 的 Raw/sync 观察保留为参考事实，不再作为 ZoeyDAW 试听需求。

## 证据等级

- **现场观察**。操作正在运行的 Live，通过窗口截图与 AX 检查结果。只能证明可见状态，不能证明声学质量、播放延迟或跨平台性能。
- **官方文档**。描述产品的公开行为，不推断其私有实现。
- **源码**。证明特定提交的结构与实现，不等于实际性能或成熟度。
- **目标与推荐**。需要原型、样本和基准验证，不写成现有事实。

## Live 的 Browser 是素材工作流，不只是文件树

[Live 12 Browser 手册](https://www.ableton.com/en/live-manual/12/working-with-the-browser/) 给出的完整基线包括：

- Places 是用户添加的目录引用，不搬动原目录。支持外置盘。
- 添加目录会扫描，显示扫描进度。离线目录保留为灰色条目，可重新定位或从侧栏移除。
- 官方明确不建议直接索引整个盘或非常大的目录。
- 搜索多个词采用全部匹配。搜索清空与筛选清空是不同操作。
- 历史包含搜索和导航状态，而不只是分类 ID。
- 支持搜索结果保存为用户标签、收藏、标签过滤、排序与附加属性列。
- 键盘能完成搜索、进入结果、上下选择、展开目录、试听和加载。

**对当前实现的影响**。`useBrowser.ts` 的静态数组、同步递归过滤和仅分类历史不能直接承担大型目录库。真实目录发现、索引、查询与音频分析需要区分。查询返回必须有版本或代次，旧查询不能覆盖新查询；这是设计推荐，不是对 Live 内部实现的猜测。

## Live 试听和编排共用音乐语义，但不是同一个播放位置

[Live 12 Browser §4.9](https://www.ableton.com/en/live-manual/12/working-with-the-browser/#previewing-files) 说明：

- 开启 Preview 后，选择文件即可试听，方向键连续切换。
- 关闭 Preview 时仍能用 Shift+Enter 或右方向键试听。
- 试听有波形和定位区域。Warp 关闭的 Clip 无法在此定位。
- Raw 关闭时，运行中的 transport 可在下个小节开始试听，且试听循环。
- Raw 开启时按原速、不循环试听，且不能 scrub。
- Preview/Cue 有独立音量。设备具备足够输出时可独立耳机选听，不打断 Main。

**现场观察**。

1. Live 原有工程 transport 停止，BPM 为 140，Arrangement 插入位置为 8.3.1。
2. 切到“采样”，AX 返回 1001 个项目，包含 AIFF 与 WAV。
3. 单击 `7SKIES_Cinematic_Drums.wav` 后，底部出现试听波形和“原始预览”控件，Clip 编辑区仍显示原来选中的 `6_stringer_D#3`。
4. 将 Raw 开启后 AX 读到值 1，随后恢复为 0。
5. 搜索 `7SKIES Drums` 返回 1 个结果。Arrangement 插入位置仍为 8.3.1。
6. 清空搜索并切回乐器，AX 确认 119 个项目，transport 仍停止，原 Arrangement 选择未改。

没有录制音频回环，没有测首声延迟，没有用用户工程测试拖入、变速、删除或保存。上述观察不能当作听音质量证明。

**推荐**。试听与 Arrangement 共用解码、重采样、节拍映射和拉伸能力，分别拥有播放游标及生命周期。快速选择 A、B、C 时，A 的晚到任务不能启动或覆盖 C。同步试听需要“等待下小节”状态；不能把正常量化等待显示成卡住。

## FL 可以补充的细节

已使用 ego 浏览器打开并核对 [FL Browser 官方手册](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/browser.htm)，未运行 FL 原生应用。

- 只搜索已添加的目录，含子目录。可启用索引，也有刷新和启动重建索引选项。
- 默认单击试听最长 5 秒，可改完整试听。Shift+Click 支持从指定位置播放。
- 有 BPM、Loop、Key、Sync 试听控制，但需要素材元数据。
- Sync 开启时，拖进 Playlist 的素材保持试听时的速度和调性配置。One-shot 不受 Sync 设置影响。
- 官方明确提醒，错误的音频 tempo 元数据会造成错误拉伸。
- 普通 `.flp` 不包含采样，`.zip` 工程包含受支持的工程素材，但不自动包含第三方插件和插件内部素材。

[FL Project settings](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/songsettings_settings.htm) 还提供工程目录、复制已用采样到工程目录，以及对工程生成文件 Move、Copy 或保留原处的独立策略。不能仅凭 FL 支持 zip 就说它没有工程素材收集能力。

[FL Sampler 官方手册](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/chansettings_sampler.htm) 区分：

- Realtime Stretch 可随工程 tempo 动态变化，保持音高。
- 离线 Elastique 预计算质量路径不能替代实时 tempo automation。
- Keep on Disk 有格式限制，不能把“支持磁盘流”推成全部格式具有同等行为。
- 显式 Fade 与底层 declick 不同，不能用截断或统一长淡入损坏鼓的瞬态。

## 素材引用、工程收集与缓存是三个问题

[Live 文件管理 §5.5–5.7](https://www.ableton.com/en/live-manual/12/managing-files-and-sets/) 明确区分外部引用与 Collect All and Save。收集会复制已用媒体到工程，代价是额外空间；不要求复制整个素材库。

同一手册 §5.1 说明压缩音频可以解码为临时无压缩文件，解码缓存有空间限制；分析文件保存波形、Warp 分析和部分默认设置。缓存不是唯一原始媒体，缓存被清理不能让已保存工程丢失其素材身份。

**推荐方向，未定稿**。

- Browser 添加目录只引用，不复制素材库。
- 工程使用独立媒体源身份，不以绝对路径作为身份。
- 工程已用媒体支持收集，明确显示外部依赖和便携状态。默认收集还是默认引用，待完整比较后决定。
- 波形峰值、解码 PCM、节拍分析与拉伸渲染属于不同派生产物。应能失效重建，不能混进工程作者数据。
- 不因复制完成就宣称素材可播放；准备、分析、预读和设备状态各自可观察。

## BPM 同步不是设置一个比例

[Live Warp 手册](https://www.ableton.com/en/live-manual/12/audio-clips-tempo-and-warping/) 区分原速、Warp、瞬态、Warp Marker、源 BPM 和不同算法。

- One-shot、节奏循环、长歌、无固定拍点的素材不能统一猜测。
- 自动检测会有半倍、双倍与首拍错误，Live 提供修正入口。
- Warp Marker 把源音频中的具体点映射到音乐时间。单个源 BPM 不能表达自由速度录音。
- Beats 偏重瞬态，Tones 适合单音高素材，Complex 与 Complex Pro 面向复杂内容，质量和 CPU 有取舍。
- 首次分析期间素材不能播放或编辑，这是官方文档的行为，不代表每类样本耗时相同。

**推荐**。解码、tempo/beat/downbeat 分析、时间映射、音高保持拉伸分开选型和验收。通用 stretcher 不提供完整 Auto-Warp。对没有可靠节拍分析的素材，不可静默套用猜测后声称已正确同步。

## “优于 Live”需要可比较的证明

[Live 资源手册](https://www.ableton.com/en/live-manual/12/computer-audio-resources-and-strategies/) 说明其 CPU 表示音频处理耗时相对 buffer deadline，不是系统 CPU 百分比；CPU 与磁盘过载应分开。正式比较必须同机器、设备、采样率、缓冲、素材与播放场景。

| 场景 | 体验基线 | 性能与正确性证据 |
| --- | --- | --- |
| 大目录首次加入与重启 | 有进度、可取消、离线状态明确，不冻结 UI | 扫描/索引耗时、查询 p50/p95、UI 帧时间、播放中 xrun |
| 快速连续选择试听 | 最后选择获胜，无旧音频回响，选择不改工程 | 冷/热首声延迟、取消任务数、PCM 与峰值复用、试听切换爆音 |
| 同步试听后拖入 | 相同源范围、tempo、Warp 和音高设置听起来一致 | 录制试听与编排输出，对齐比较，不用 UI 配置相等代替音频证明 |
| 长压缩素材 | 不因整首 PCM 驻留耗尽内存 | 峰值 RSS、缓存空间、解码吞吐、随机 seek 与循环预读 |
| 同源多 Clip | 不同源偏移可并播与独立循环 | 同源不同偏移叠播波形和输出验证，共享内容但不共享播放游标 |
| 鼓、人声与全混音变速 | 不漂拍、不改目标音高，瞬态和立体声合理 | 多种比例听音、起音误差、频率/音高、立体声相干、算法延迟 |
| 播放中索引、缩放与拖动 | 音频不受 UI 帧率或文件扫描阻塞 | callback p99/max、deadline miss、xrun、UI p95 帧时间 |
| 工程迁移与缓存清理 | 已收集工程能独立打开 | 源盘断开、相对路径、缓存删除、同名不同内容、损坏文件 |

以上是验证维度，不是已测成绩。没有负载基线前不承诺轨数、内存或延迟指标。

## 现有 Tauri 通信能力

本轮通过 Context7 MCP 查询 Tauri 文档，结果指向 [Rust 调用前端](https://tauri.app/develop/calling-frontend/) 与 [core Channel API](https://tauri.app/reference/javascript/api/namespacecore/)。

官方明确 event 系统不适合低延迟和高吞吐，Channel 面向有序流，原始字节可用 ArrayBuffer。推荐 PCM 留在原生播放路径，UI 仅收状态和按可见范围请求的峰值等派生数据。Channel 是传输工具，不是音频实时安全或跨平台共享内存的证明。
