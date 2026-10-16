# text-i18n 硬编码调查

## 结论与计数

**33 组迁移项：A 8 组，B 25 组；另列 C 8 组保留项。** 以同文案/同格式策略合并计数，不是字符串引用次数。生产 browser/catalog 包含 **37 个设备、75 个子预设、20 个独立资源，共 132 个条目**，归并到 3 个迁移组。只读静态调查，未运行程序、测试或修改仓库。

| 子类别                 | A 已有资源却绕过 | B 缺统一归属 | 合计 |
| ---------------------- | ---------------: | -----------: | ---: |
| 共享组件默认文案       |                6 |            4 |   10 |
| 工程/轨道/片段默认命名 |                2 |            4 |    6 |
| 快照错误消息           |                0 |            4 |    4 |
| 面板/监听可访问性      |                0 |            3 |    3 |
| 单位、声像、百分比     |                0 |            3 |    3 |
| 数值精度与区域格式     |                0 |            2 |    2 |
| 时间格式策略           |                0 |            1 |    1 |
| 生产演示目录与搜索区域 |                0 |            4 |    4 |
| 总计                   |                8 |           25 |   33 |

路径均相对项目根。A 也包含共享库尚未触发的默认值：**默认值风险不等于当前生产页面仍显示英文**。B 文案使用既有 i18n 机制的新键；真正新增配置类别建议为 `creationNames`（创建命名模板）、`displayFormats`（业务量精度、单位、duration）、`resourceCatalog`（稳定 id 与展示元数据），不是全部放进 theme。

## A：已有资源但绕过

| ID | 全部同类位置 | 字面量 | 控制内容与实际可达性 | 统一来源 |
| --- | --- | --- | --- | --- |
| A01 | `apps/gpuix/src/ui/controls/Loading/index.tsx:26`; `apps/gpuix/src/ui/controls/Progress/index.tsx:26`; `apps/gpuix/src/ui/controls/Toaster/index.tsx:121` | `Loading` | 加载默认文字、不确定进度 aria-valuetext、通知加载默认文字；Toaster 生产调用已覆盖 | `notifications.loading`/`common.loading`，组合层注入 |
| A02 | `apps/gpuix/src/ui/controls/Toaster/index.tsx:120` | `Dismiss` | 关闭通知默认标签；AppShell 已覆盖 | `notifications.dismiss` |
| A03 | `apps/gpuix/src/ui/controls/Toaster/index.tsx:137` | `Notifications` | 通知区域默认 aria-label；AppShell 已覆盖 | `notifications.title` |
| A04 | `apps/gpuix/src/ui/controls/SettingsShell/index.tsx:134` | `Close settings` | 关闭设置默认标签；SettingsDialog 已覆盖 | `settings.close` |
| A05 | `apps/gpuix/src/ui/controls/SettingsShell/index.tsx:135` | `Settings sections` | 设置导航默认标签；SettingsDialog 已覆盖 | `settings.navigation` |
| A06 | `apps/gpuix/src/ui/controls/PanControl/index.tsx:9` | `Pan` | 声像默认名称；TrackMixer 已传本地化 label | `trackResources[locale].arrangement.pan`，或 footer 参数 label，由 props 注入 |
| A07 | `apps/gpuix/src/project/stores/slices/document.ts:8` | `未命名项目` | 真实 store 默认工程名；HomePage recent 条目虽用 t，store 仍固定中文 | 已有 `project.untitled`；创建时固化，不随语言切换重命名用户数据 |
| A08 | `apps/gpuix/src/project/model/clip-label.ts:8,10` | `Audio Clip`, `MIDI Clip`, `Pattern` | 公共 clipLabel fallback，音频优先 basename 正确，fallback 不本地化 | 已有 `clipEditorLabels.kind.audio/midi/pattern` 可复用；Pattern 对应现有 `Pattern Clip`，需统一措辞或单独 defaultName 键 |

## B：缺少统一资源或格式策略

| ID | 位置 | 字面量/策略 | 控制内容 | 统一来源 |
| --- | --- | --- | --- | --- |
| B01 | `apps/gpuix/src/ui/controls/LoadErrorScreen/index.tsx:25` | `Retry` | 共享错误屏重试默认文字；路由当前传 Reload，不是完全同义 | 新增 common.retry i18n |
| B02 | `apps/gpuix/src/ui/controls/LoadErrorScreen/index.tsx:21` | `Unable to load` | 共享失败默认标题；路由已覆盖 | 新增 common.loadFailed i18n |
| B03 | `apps/gpuix/src/ui/controls/Loading/index.tsx:58` | `ZoeyMind` | logo alt 是另一个产品名 | 统一 app identity/`app.name`；先确认 logo 真实品牌 |
| B04 | `apps/gpuix/src/ui/controls/DragPad/index.tsx:40-41` | `ON`, `OFF` | 无图标开关默认文字；音频 loop/reverse 等消费者不应依赖英文 | 新增 control state labels，通过 props/ControlEnvironment 注入 |
| B05 | `apps/gpuix/src/ui/panels/PanelShell/index.tsx:27-28`; 生产传入 `apps/gpuix/src/app/project/ProjectLayout.tsx:51,66,76-78` | `Active panel`; id 直接作 aria-label，`footer/browser/arrangement` | 生产工程面板暴露内部 id 和固定英文活动描述 | 新增 panel labels/activeDescription；id 不翻译 |
| B06 | `apps/gpuix/src/ui/panels/CollapseDivider/index.tsx:24,60` | `Toggle fixed panel`; `${expanded ? expandedSize : 0} pixels` | 共享分隔条默认名和像素尺寸朗读；未证实主工程当前使用该控件 | 新增 divider labels + displayFormats.accessiblePixels |
| B07 | `apps/gpuix/src/project/adapters/snapshots.ts:74,151` | `Could not read snapshot storage.` | snapshotError 直接进入状态栏 | 新增 snapshotErrors.read i18n，状态存 code 而非句子 |
| B08 | `apps/gpuix/src/project/adapters/snapshots.ts:82,164` | `The local snapshot is invalid or unsupported. Current project was kept.` | 无效快照错误，直接用户可见 | snapshotErrors.invalid |
| B09 | `apps/gpuix/src/project/adapters/snapshots.ts:136` | `Could not save the local snapshot. Check storage availability.` | 保存失败，直接用户可见 | snapshotErrors.write |
| B10 | `apps/gpuix/src/project/adapters/snapshots.ts:155` | `No local snapshot exists for this project.` | 快照缺失，直接用户可见 | snapshotErrors.missing |
| B11 | `apps/gpuix/src/project/model/reducers.ts:61` | `${count} ${kind === "midi" ? "MIDI" : kind === "audio" ? "Audio" : kind === "group" ? "Group" : "Return"}` | 新轨命名及固定编号在前语序 | creationNames.track[kind] i18n 模板，count 参数；创建时固化 |
| B12 | `apps/gpuix/src/project/model/reducers.ts:114` | `${track.name} Copy` | 复制轨英文后缀和固定语序 | creationNames.copy 模板；保留原用户 name |
| B13 | `apps/gpuix/src/project/stores/slices/document.ts:22` | `Main` | 主轨默认显示名 | creationNames.main；内部 id `main` 不变 |
| B14 | `apps/gpuix/src/project/adapters/markers.ts:14` | `Marker` | 新标记固定名称 | creationNames.marker |
| B15 | `apps/gpuix/src/project/sections/transport/PerformanceStatus/index.tsx:36,39`; `apps/gpuix/src/project/sections/clip-edit/audio/AudioParameters.tsx:224-225`; `apps/gpuix/src/project/sections/arrangement/lane/interactions/automation/ValueEditor/index.tsx:84-85,111-113`; `apps/gpuix/src/project/sections/arrangement/tracks/meter/TrackMeter.tsx:92` | `kHz`, `ms`, `dB`, `−∞ dB`, `L … dB, R … dB`；`-60.0 dB` 测宽样本 | 采样率、延迟、增益、自动化输入、表头声道读数；单位间隔及排列硬编码，解析也写死 dB | displayFormats.units/levelMeter；符号可稳定，展示/朗读/parse/测宽同源 |
| B16 | `apps/gpuix/src/ui/controls/PanControl/index.tsx:19,23-27`; `apps/gpuix/src/project/sections/arrangement/lane/interactions/automation/ValueEditor/index.tsx:87-88,104-109`; `apps/gpuix/src/project/sections/arrangement/tracks/meter/TrackMeter.tsx:92` | `C`, `L`, `R`, `L100`, `R100`，自动化多一个空格 | 声像方向显示/输入重复、不一致；meter 声道标记直写 | displayFormats.pan + channel labels；规范 ASCII 输入别名可保留，展示/朗读可本地化 |
| B17 | 下方数值格式引用表 | `toFixed(0/1/2/3/4)`、步进推导 precision、MIDI 去尾零、`×` | 精度策略分散，普通数值固定英文小数点，ARIA 与正文不同精度 | displayFormats.number 按业务量配置 precision/trimZeros/grouping/locale/widthSamples；不改 DSP/步进算法精度 |
| B18 | `apps/gpuix/src/project/model/timeline-ticks.ts:128-130`; `apps/gpuix/src/project/sections/transport/metronome.ts:31-34` | `m:ss[.SSS]`, `h:mm:ss.SSS`; padStart 2/3 位 | 波形时间标尺与引擎时长两套格式；不是日期/时区 | displayFormats.duration 分 ruler/transport，纯 formatter 共用 |
| B19 | `apps/gpuix/src/project/sections/footer/EffectChain/ParameterControl/index.tsx:35-38,65-68`; `apps/gpuix/src/app/home/HomePage.tsx:40` | `useGrouping:false`, `maximumFractionDigits:percentage ? 0 : config.step < 1 ? 1 : 0`; `dateStyle:"short",timeStyle:"short"` | Intl **已正确使用动态 locale**；只是显示策略分散。参数百分比转换后不显示单位 | displayFormats.parameter/dateTime；不再建立硬编码 locale |
| B20 | `apps/gpuix/src/project/sections/browser/catalog.ts:79-120` | 37 个设备名，完整表见下 | 演示设备名称进入生产浏览器 | resourceCatalog，稳定 id/displayName 分离；品牌由 metadata 保留 |
| B21 | 同文件 `:79-120` | 75 个子预设名，完整表见下 | 演示预设进入生产浏览器 | resourceCatalog preset metadata；翻译不能改收藏/选择 id |
| B22 | 同文件 `:121-140`，tags 另见 `:79-120` | 20 个独立资源名及 tags，完整表见下 | 资源文字和英文搜索 tags | resourceCatalog；真实 basename 不翻译，演示 displayName/tag 可本地化 |
| B23 | `apps/gpuix/src/project/sections/arrangement/tracks/TrackRouting/index.tsx:123` | `${t("monitor")} ${mode} ${track.name}` 中 `off/auto/in` 原样显示 | 前缀翻译了，监听模式 enum 没映射 | 新增 track monitorModes i18n；内部 enum 保留 |
| B24 | `apps/gpuix/src/ui/controls/Progress/index.tsx:26` | `${Math.round((clamped / upperBound) * 100)}%` | 进度 aria-valuetext 固定百分号位置及数字体系 | displayFormats.percent / Intl percent；CSS width `%` 不在迁移范围 |
| B25 | `apps/gpuix/src/project/sections/browser/useBrowser.ts:58,82` | `toLocaleLowerCase()` 不传 locale | 搜索使用系统区域，不是应用语言 | 现有 i18n locale + 统一搜索规范化，与翻译后的 name/tags 索引接入 |

### B17 全部数值展示引用

| 完整路径及行 | 字面量/精度用途 |
| --- | --- |
| `apps/gpuix/src/ui/controls/DragPad/numberModel.ts:45-46` | min/max/step 推导 precision，toFixed，缺省数字显示 |
| `apps/gpuix/src/project/sections/transport/index.tsx:148-149` | BPM toFixed(2)，测宽 `999.99` |
| `apps/gpuix/src/project/sections/transport/PerformanceStatus/index.tsx:39` | latency toFixed(2) |
| `apps/gpuix/src/project/sections/arrangement/tracks/TrackMixer/index.tsx:41-42` | dB toFixed(1)，`−∞`，测宽 `−59.9/6.0/−∞` |
| `apps/gpuix/src/project/sections/arrangement/tracks/meter/TrackMeter.tsx:92` | 左右声道 dB toFixed(1)，ARIA |
| `apps/gpuix/src/project/sections/arrangement/lane/interactions/automation/ValueEditor/index.tsx:85` | 自动化 volume toFixed(1) |
| `apps/gpuix/src/project/sections/arrangement/timeline/toolbar/index.tsx:117` | pxPerBar toFixed(0)，单位已 labels.pixelsPerBar |
| `apps/gpuix/src/project/sections/clip-edit/audio/AudioParameters.tsx:24-26,174,224-225` | sourceBpm 2 位、transpose/detune 0 位、gain 1 位、fade 3 位；测宽 `-60.0 dB/1024.000` |
| `apps/gpuix/src/project/sections/clip-edit/audio/AudioWaveform.tsx:165` | zoom toFixed(1) + `×` |
| `apps/gpuix/src/project/sections/clip-edit/audio/AudioWaveformOverview.tsx:47` | view.start ARIA toFixed(3) |
| `apps/gpuix/src/project/sections/clip-edit/audio/SourceMarker.tsx:82` | position ARIA toFixed(4) |
| `apps/gpuix/src/project/sections/clip-edit/midi/MidiEditor.tsx:163-164` | toFixed(4).replace(/\.?0+$/, "")，测宽 `1024.9375` |
| `apps/gpuix/src/project/sections/clip-edit/midi/MidiRuler.tsx:45` | sourceWindow 两端 toFixed(2)，ARIA |

## B20–B22 完整生产目录

下表行号均属于 `apps/gpuix/src/project/sections/browser/catalog.ts`。每行 tags 同时被该设备子预设继承。重复标签（如 Synth/Analog/Ambient）在同一 metadata 体系归并，不建立多个翻译来源。

| path 行 | 设备字面量          | 全部预设字面量                           | tags 字面量       |
| ------- | ------------------- | ---------------------------------------- | ----------------- |
| 79      | Analog              | Warm Pad; Deep Bass; Soft Keys           | Synth; Analog     |
| 80      | Collision           | Glass Bells; Marimba                     | Mallet; Physical  |
| 81      | Drift               | Slow Motion; Warm Lead                   | Synth; Analog     |
| 82      | Electric            | Classic EP; Mellow Keys                  | Keys; Physical    |
| 83      | External Instrument | 无                                       | Utility           |
| 84      | Impulse             | Studio Kit; Electronic Kit               | Drums             |
| 85      | Instrument Rack     | Layered Keys; Ambient Texture            | Rack              |
| 86      | Meld                | Evolving Pad; Metallic Pluck             | Synth; Digital    |
| 87      | Operator            | FM Bass; Crystal Keys                    | Synth; FM         |
| 88      | Sampler             | Grand Piano; Tape Strings                | Sampler           |
| 89      | Simpler             | One Shot; Sliced Break                   | Sampler           |
| 90      | Tension             | Plucked String; Bowed Texture            | Strings; Physical |
| 91-96   | Wavetable           | Warm Waves; Moving Pad; Sub Bass         | Synth; Digital    |
| 97      | Audio Effect Rack   | Master Chain; Parallel Color             | Rack              |
| 98      | Auto Filter         | Low Pass Sweep; Envelope Filter          | Filter            |
| 99      | Compressor          | Gentle Glue; Punch                       | Dynamics          |
| 100     | Delay               | Dotted Echo; Tape Slap                   | Delay             |
| 101     | EQ Eight            | Low Cut; Air                             | EQ                |
| 102     | Glue Compressor     | Bus Glue; Soft Clip                      | Dynamics          |
| 103     | Grain Delay         | Shimmer; Frozen Grain                    | Delay; Ambient    |
| 104     | Hybrid Reverb       | Small Room; Endless Hall                 | Reverb; Ambient   |
| 105     | Limiter             | Transparent; Loud                        | Dynamics          |
| 106     | Saturator           | Warm Tape; Soft Drive                    | Drive             |
| 107     | Utility             | Mono; Wide                               | Utility           |
| 108     | Arpeggiator         | Up & Down; Random Steps                  | MIDI              |
| 109     | Chord               | Minor Seventh; Fifth                     | MIDI              |
| 110     | Scale               | Minor; Major                             | MIDI              |
| 111     | Velocity            | Soft Touch; Accents                      | MIDI              |
| 112     | LFO                 | Slow Sine; Random Hold                   | Modulation        |
| 113     | Shaper              | Ramp; Pulse                              | Modulation        |
| 114     | Envelope Follower   | Smooth; Transient                        | Modulation        |
| 115     | Max Instrument      | Granular Cloud; Mono Synth               | Max for Live      |
| 116     | Max Audio Effect    | Spectral Freeze; Resonator               | Max for Live      |
| 117     | Max MIDI Effect     | Melodic Steps; Note Echo                 | Max for Live      |
| 118     | CLAP                | Demo Synth; Demo Reverb                  | Plug-in           |
| 119     | VST3                | Demo Piano; Demo Compressor              | Plug-in           |
| 120     | Drum Rack           | 808 Core Kit; 909 Core Kit; Acoustic Kit | Drums; Rack       |

| path 行 | 独立资源字面量        | tags 字面量       |
| ------- | --------------------- | ----------------- |
| 121     | Ambient Keys          | Keys; Ambient     |
| 122     | Deep Sub              | Bass; Synth       |
| 123     | Warm Strings          | Strings; Ambient  |
| 124     | Plucked Glass         | Mallet; Digital   |
| 125     | Kick 808.wav          | Drums; Kick       |
| 126     | Snare Dry.wav         | Drums; Snare      |
| 127     | Hi Hat Closed.wav     | Drums; Hi Hat     |
| 128     | Analog Texture.wav    | Texture; Ambient  |
| 129     | Break 120 BPM.wav     | Drums; Loop       |
| 130     | Field Recording.wav   | Texture; Ambient  |
| 131     | Piano C3.wav          | Keys; One Shot    |
| 132     | Ambient Intro         | Ambient; Audio    |
| 133     | Bass Pattern.mid      | Bass; MIDI        |
| 134     | Chord Progression.mid | Keys; MIDI        |
| 135     | Swing 16-55           | Swing; 16th       |
| 136     | Swing 8-60            | Swing; 8th        |
| 137     | 12-TET                | Equal Temperament |
| 138     | Just Intonation       | Just Intonation   |
| 139     | Empty Arrangement     | Arrangement       |
| 140     | Electronic Session    | Electronic        |

目录 reachability：BrowserPanel 渲染 `row.entry.name`，操作标签也拼入名字（`apps/gpuix/src/project/sections/browser/index.tsx:422,467`）。catalog 名字还参与稳定 id 生成（`:41`）及 purple 判断（`:49,57,76`）。迁移不能只就地翻译 name，否则会影响 id、收藏、展开和搜索；应先分离稳定标识与 displayName。

## Rust 用户可见错误追踪

**正常引擎错误/phase 已有映射，不是裸英文泄漏。**

- `crates/engine/src/session.rs:105-129`：prepare 失败丢弃 String，返回 `BackendFailureCode::Rejected`。
- `apps/gpuix/src/project/adapters/backend/connection/connection.ts:76-83,156-159`：保存 error code/phase。
- `apps/gpuix/src/app/project/ProjectSections.tsx:47-51`：backend code 查 `timelineLabels.backendErrors`；但 snapshotError 原句不翻译，直接进入状态栏（B07–B10）。
- `apps/gpuix/src/project/sections/transport/PerformanceStatus/index.tsx:59`：phase 查 `labels.enginePhases[phase]`。

| 类型 | 完整位置 | 全部诊断字面量 | 应如何处理 |
| --- | --- | --- | --- |
| 内部 prepare 校验 | `crates/engine/src/session.rs:138,144,152,158,276,284,289-294` | `invalid tempo or meter`; `invalid musical coordinates`; `invalid loop`; `duplicate source id`; `only local file sources are supported`; `invalid local file URI`; `truncated URI escape`; `invalid URI escape` | 已折叠成 rejected，不直接显示；保留诊断。未来细分用户原因时增加 code+params，前端翻译 |
| 内部混音校验 | `crates/engine/src/mix/mod.rs:76,86,96,101,105,138,141,207` | `duplicate track id`; `non-finite mixer control`; `unknown output track`; `unknown send track`; `invalid return send`; `invalid audio clip`; `missing audio source`; `cyclic audio routing` | 同上，不把底层诊断变成当前 locale 文案 |
| 内部解码诊断 | `crates/engine/src/assets.rs:135,140,156,161,166,171` | `no audio track`; `missing audio codec parameters`; `source format changed while decoding`; `only mono/stereo media is supported`; `non-finite PCM`; `empty media or invalid sample rate` | 同上，外部 decoder `to_string()` 同属技术详情 |
| N-API 边界泄漏风险，非已确认用户文案 | `crates/native/src/engine.rs:72,75,171,176,180,229,237,262`; `crates/engine/src/session.rs:227`; `crates/engine/src/assets.rs:86`; `crates/engine/src/peaks.rs:177` | `engine handle lock poisoned`; `engine session disposed`; `engine handle ids exhausted`; `engine cleanup lock poisoned`; `invalid peak range`; `unknown source`; `invalid looped peak range or pixel count`; `invalid peak range or pixel count` | 可能被错误边界捕获；`apps/gpuix/src/app/router/RouteErrorBoundary.tsx:83,112` 仅 showDetails 时显示 error.message。主反馈应映射 code，详情可保留诊断，不能宣称每条都已在 UI 显示 |
| 设置/平台 N-API 风险 | `crates/native/src/settings.rs:23,26,30,105`; `crates/native/src/external.rs:29,41`; `crates/native/src/log.rs:271`; `crates/native/src/reduced_motion.rs:91`; `crates/native/src/window_diagnostics.rs:37` | `user config directory unavailable`; `user data directory unavailable`; `home directory unavailable`; `snapshot key must not be empty`; `only absolute http/https URLs may be opened`; `open exited with {status}`; `invalid log level`; `reduced motion observer lock poisoned`; `Window diagnostics require the main thread` | settings 在 snapshot 路径被捕获并显示 B07–B10。其他未确认用户可见 producer；未来在 UI 边界映射，而非翻译所有开发异常 |

## C：合理保留项与正确注入（8 组）

| ID | 位置 | 字面量/机制 | 保留理由 |
| --- | --- | --- | --- |
| C01 | `apps/gpuix/src/project/model/audio-editor/musical-value.ts:20-22` | toFixed(10)，`bars.beats.sixteenths` 的点号 | 有配套 parser 的音乐输入语法与去浮点噪声；不能按普通小数 locale 改掉。可统一 formatter ownership，但保持语法 |
| C02 | `crates/engine/src/protocol.rs:18`; `apps/gpuix/src/project/stores/slices/session.ts:23`; `apps/gpuix/src/project/adapters/backend/connection/connection.ts:82` | `protocolVersion must be 1`; `idle/opening/pending/ready/error` | 协议版本、状态 enum 不翻译；phase 和 backendErrors 已正确映射 |
| C03 | 上方 Rust 内部错误表；`apps/gpuix/src/project/adapters/runtime/runtime-state.ts:36-38`; `apps/gpuix/src/ui/controls/Menu/index.tsx:225,257`; `apps/gpuix/src/ui/controls/Popover/index.tsx:45`; `apps/gpuix/src/project/sections/clip-edit/environment.tsx:25` | `Project backend is not configured. Call configureProjectBackend at the application composition root.`; `ContextMenuRadioItem requires ContextMenuRadioGroup`; `SubTrigger requires MenuSub`; `Popover components require a Popover root`; `ClipEditor must render inside its environment provider` | 开发者不变量/配置诊断，不是用户文案；错误屏主反馈本地化，技术详情允许原样 |
| C04 | `apps/gpuix/src/project/sections/arrangement/tracks/TrackRouting/index.tsx:11-18`; `apps/gpuix/src/project/sections/arrangement/tracks/TrackMixer/index.tsx:129`; `apps/gpuix/src/ui/controls/ControlGroup/index.tsx:76` | `1 / 2`, `3 / 4`, `1`, `2`, MIDI 1–16；Solo `S`；`/`, `.` | 通道标识、紧凑标准符号、节拍分隔符不是自然语言；完整 accessible label 已 t |
| C05 | `apps/gpuix/src/app/settings/SettingsDialog.tsx:217-218`; browser/catalog 上表；`apps/gpuix/src/project/model/clip-label.ts:8` | `GitHub`、CLAP/VST3 等协议/品牌、用户真实 sample basename | 品牌和用户数据不翻译；目录 ownership 迁移不意味着重命名文件 |
| C06 | `apps/gpuix/src/platform/log/formatter.ts`; `apps/gpuix/src/platform/log/serialize.ts`; `apps/gpuix/src/platform/i18n/core.ts:66-69` | 日志格式/日志消息、Intl 系统 locale 探测 | 未发现日志作为产品 UI 文案的消费者，不把开发日志都搬 i18n。系统 locale 探测是正确启动行为 |
| C07 | `apps/gpuix/src/project/sections/clip-edit/audio/AudioParameters.tsx:319,326`; `apps/gpuix/src/project/sections/footer/EffectChain/ParameterControl/index.tsx:33-38,53,58`; `apps/gpuix/src/app/home/HomePage.tsx:39-40` | semitones/cents、参数名来自 labels；Intl 用 labels.locale/locale；untitled 用 t | 已正确注入，只有 B17/B19 的格式策略需收敛；不要复制第二份文案 |
| C08 | `apps/gpuix/src/project/adapters/fixtures.ts:50,169,185-186`; `apps/gpuix/src/ui/panels/PanelGallery/index.tsx:24,29,33,105,122,135,172,188,197`; 专属入口 `apps/gpuix/src/ui/panels/gallery.tsx:3,7` | `Drums`, `Main`, `Intro`, `Verse`; `Toggle Browser/Clip/Device`; `Resize browser columns`; `Resize browser`; `Drums/Bass/Synth/Audio`; `Resize clip`; `Clip — continuous height, Device stays fixed`; `Toggle device by dragging` | fixtures 未被生产 composition 选择；PanelGallery 仅 gallery/test 消费。路径虽不总匹配 gallery/**，用途属于排除范围，不计迁移。真正生产演示泄漏是 browser/catalog |

## 接入与优先级

1. 确定生产问题：快照 4 类错误、store 固定中文工程名、轨/标记/复制/fallback 名称、PanelShell id、TrackRouting mode enum。
2. 共享组件契约：Button/Label/ListRow/Menu/MotionTabs/PopupButton/DragPadNumber/ControlledScrollbar 已主要通过 labels/children/aria props 注入；只收敛本表默认英文和 PanelShell fallback。AppShell 的 Toaster 与 SettingsDialog 的 SettingsShell 已正确注入。
3. 格式层：使用既有 app locale；volume/pan formatter、parser、ARIA、测宽样本同源。duration 与音乐坐标分别建模，避免将时长当 Date，或破坏 bars.beats.sixteenths 语法。
4. 当前范围未发现 Intl 硬编码 locale。快捷键归 K1，此切片未重复设计快捷键。
