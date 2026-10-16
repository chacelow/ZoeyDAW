# 行为默认值硬编码清单（behavior-defaults）

## 结论与计数

只读检查；没有修改仓库、运行构建、测试、安装或窗口。位置均为仓库相对路径。计数单位为**语义配置组**，不是数值出现次数；同一概念的重复位置合并，同一个数字控制不同概念则分开。

**A：3 组已有统一来源但绕过；B：56 组需要统一来源；C：8 组应保留为真正常量。** A+B 合计 59 组。已有配置正确消费的 4 组另外列出，不算问题。键盘单独计数，不提出设计。

| 子类别                     |     A |      B |   合计 |
| -------------------------- | ----: | -----: | -----: |
| 工程、轨道与工作区初值     |     3 |      8 |     11 |
| 网格、时间与音高缩放       |     0 |     11 |     11 |
| 鼠标手势、滚动与命中       |     0 |     12 |     12 |
| 电平范围与峰值衰减         |     0 |      4 |      4 |
| MIDI 编辑与计算机键盘行为  |     0 |      8 |      8 |
| 音频片段、淡化与节奏输入   |     0 |      4 |      4 |
| 历史容量、窗口与浏览器目录 |     0 |      5 |      5 |
| 原生音频设备与处理默认值   |     0 |      4 |      4 |
| **合计**                   | **3** | **56** | **59** |

关键纠正：指定的“剪贴板 2048 音符上限”在当前产品实现中不存在；`2048` 实际出现在 mock 波形采样。遥测实际是 **33333 微秒**，不是精确 33ms。编曲最大 `pxPerBar` 是公式，不是某个固定最大值。普通双击交给原生 `clickCount`；只有 Stop 重复点击自定义了 450ms。

## A：已有来源但代码绕过

| ID | 位置 | 字面量 | 控制什么 | 归属及应使用来源 |
| --- | --- | --- | --- | --- |
| A01 | `apps/gpuix/src/project/stores/slices/document.ts:37` | `heightPx: 108` | Main 初始高度，与公共轨道初值不同 | **theme**：已有 `theme.project.defaultTrackHeight` / `PROJECT_METRICS.defaultTrackHeight`（70，`shared/theme/metrics/control-metrics.json:29`）。如 Main 确需专属高度，应增加 Main token，而不是直接统一改为70。 |
| A02 | `apps/gpuix/src/project/stores/slices/document.ts:8,23`; `apps/gpuix/src/project/model/reducers.ts:61,122` | `"未命名项目"`, `"Main"`, `"MIDI"/"Audio"/"Group"/"Return"`, `" Copy"` | 新工程、轨道和复制轨道名称模板 | **project default + i18n**：现有 `platform/i18n`、`app/locales`；把创建时名称模板接入 i18n，已保存用户名称不应随语言变化。 |
| A03 | `apps/gpuix/src/project/model/reducers.ts:63` | `"oklch(0.65 0.17 265)"`, `"oklch(0.65 0.18 230)"` | Group/其他新轨道初始颜色 | **theme + project default**：已有 theme chart/color tokens；还需主题中的轨道类型→默认色映射。Main 已用 `var(--chart-3)`（`stores/slices/document.ts:25`），不能把任意两个 oklch 视作既有某两个 token 的精确等价物。 |

## B：缺少统一默认表或可配置来源

下面 NEW 表示目前没有该项的统一配置家；可以承载于既有 `UserSettings`/工程数据/theme 体系，而不是要求再建一套框架。目前 `platform/settings/index.ts:8-13` 只声明 themePreset、themeMode、language、closeBehavior。

### 1. 工程、轨道与工作区初值（8）

| ID | 位置 | 字面量 | 控制什么 | 归属 / 统一来源 |
| --- | --- | --- | --- | --- |
| B01 | `apps/gpuix/src/project/stores/slices/document.ts:13`; `apps/gpuix/src/project/sections/arrangement/core/scene.ts:87`; `apps/gpuix/src/project/model/audio-editor/settings.ts:47`; `apps/gpuix/src/project/sections/transport/index.tsx:146` | `120` | 工程 BPM、空 scene BPM、source BPM fallback、双击 reset | **project default**；NEW project/transport defaults，同一值供创建和 reset 消费。 |
| B02 | `apps/gpuix/src/project/stores/slices/document.ts:14-16`; `apps/gpuix/src/project/sections/arrangement/core/scene.ts:87,96`; `apps/gpuix/src/project/sections/transport/index.tsx:159,168` | `4/4`, `"1-bar"` | 初始拍号、小节长度、拍号 reset | **project default**；NEW transport defaults。 |
| B03 | `apps/gpuix/src/project/stores/slices/document.ts:17`; `apps/gpuix/src/project/sections/arrangement/core/scene.ts:89` | `{enabled:false,startBar:1,endBar:9}` / `endBar:5` | 初始 loop，工程8小节而 scene4小节 | **project default**；NEW loop defaults；必须明确一个默认长度，再从起点推导终点。 |
| B04 | `apps/gpuix/src/project/stores/slices/document.ts:9-11`; `apps/gpuix/src/project/sections/transport/index.tsx:209` | `"C"`, `"major"`, `groove:0`, `defaultValue={0}` | 音阶、调式与 Groove 初值/reset | **project default**；NEW musical defaults。 |
| B05 | `apps/gpuix/src/project/model/reducers.ts:69-77`; `apps/gpuix/src/project/stores/slices/document.ts:31-35,38` | audio=`external/1`、MIDI=`all/all`；output=`main/none`；`"1-2"`; `monitor:"auto"`; `returnPost:true` | 新轨道 I/O、monitor、return send 前后置 | **project default / user setting**；NEW track-kind defaults；设备通道应来自可用音频设备映射，而非永远1-2。 |
| B06 | `apps/gpuix/src/project/model/reducers.ts:64-68,92`; `apps/gpuix/src/project/stores/slices/document.ts:26-30,35` | `solo/armed/mute:false`, `volumeDb:0`, `pan:0`, `cueVolumeDb:0`, `gainDb:0` | 初始轨道、cue 和音频片段增益状态 | **project default**；NEW track/clip templates。0dB/中心声像本身是单位语义，但选它作为新对象初值属于默认策略。 |
| B07 | `apps/gpuix/src/project/stores/slices/workspace.ts:9-16` | `snap:true`, `follow:true`, `automationMode:false`, `drawMode:false`, `computerKeyboard:false`, `link:false` | 新工作区交互偏好 | **user setting** 的启动默认，workspace 保存实际值；NEW workspace defaults。 |
| B08 | `apps/gpuix/src/project/model/types.ts:6`; `apps/gpuix/src/project/model/selectors.ts:11`; `apps/gpuix/src/project/sections/arrangement/core/scene.ts:85` | `128`, `ceil(.../16)*16+16` | 最小时间线长度和增长粒度/余量；不是音频工程结束点 | **project default / user setting**；NEW timeline extent defaults；scene 应复用 `MIN_TIMELINE_BARS`，不用再次写128。 |

### 2. 网格、时间与音高缩放（11）

| ID | 位置 | 字面量 | 控制什么 | 归属 / 统一来源 |
| --- | --- | --- | --- | --- |
| B09 | `apps/gpuix/src/project/stores/slices/workspace.ts:6`; `apps/gpuix/src/project/sections/arrangement/core/scene.ts:95-96` | `pxPerBar:24`, `deriveGridPlan(...,24,4,4)` | 初始编曲缩放 | **user setting / project default**；NEW viewport defaults；workspace保存实际缩放。 |
| B10 | `apps/gpuix/src/project/model/grid.ts:6` | `{mode:"adaptive",density:"medium"}` | 默认网格模式/密度 | **user setting**；已有唯一常量 `DEFAULT_GRID`，缺少可配置默认来源，不是散落重复常量问题。 |
| B11 | `apps/gpuix/src/project/model/grid.ts:8,10` | `8`, `[128,64,32,16,8]` | 网格最小像素宽与自适应密度阈值 | **theme**；NEW grid density/readability metrics。 |
| B12 | `apps/gpuix/src/project/model/grid.ts:7,166-170` | `16384`；`8*16384*numerator/denominator` | 最大音符分母和编曲最大缩放；4/4下为131072 px/bar | **user setting / centralized defaults**；NEW zoom policy；不是固定屏幕像素上限。最短Clip依赖同一分母，见C。 |
| B13 | `apps/gpuix/src/project/model/grid.ts:11-12` | bar steps `[16,8,4,2,1]`；note denominators `[2,4,8,16,32,64,128,256]` | 固定网格可选档位 | **user setting / default table**；NEW grid option presets。旧快照识别表（`:64-68`）不能跟着用户偏好缩小。 |
| B14 | `apps/gpuix/src/project/model/grid.ts:87,161` | `1024` | 最大固定网格长度/改拍号后的 clamp | **centralized defaults**；NEW grid policy；解析器和编辑器共用约束但已有工程兼容要求应独立考虑。 |
| B15 | `apps/gpuix/src/project/sections/arrangement/core/viewport/zoom.ts:156-158` | 最小 `width/bars`；未测量fallback `1` | 最小缩放始终 fit 全时间线 | **user setting** 的缩放策略；NEW viewport policy。`width/bars` 是合理推导，不应替换为写死minPxPerBar。 |
| B16 | `apps/gpuix/src/project/sections/arrangement/core/viewport/zoom.ts:118-119` | 中心anchor `width/2`; factor `1.25/0.8` | 缩放按钮步幅与锚点 | **user setting**；NEW zoom-step defaults。 |
| B17 | `apps/gpuix/src/project/sections/clip-edit/midi/viewport.ts:11` | `{min:0.25,max:16,factor:2}` | Piano-roll 水平缩放上下限/倍率 | **user setting**；NEW MIDI viewport defaults。 |
| B18 | `apps/gpuix/src/project/sections/clip-edit/midi/useMidiViewport.ts:9` | `{min:1/3,max:2.5,factor:1.5}` | 音高行缩放范围/倍率，相对 theme 最大行高 | **user setting**；NEW MIDI viewport defaults；实际行高基准继续来自theme。 |
| B19 | `apps/gpuix/src/project/sections/clip-edit/audio/source-view.ts:11,27,59,65` | `1/16384`, `max(1,span*4)`, tick最细`1/64`, tick cap `128` | 音源最窄/最宽视图和标尺细度；128是绘制预算 | **user setting / theme**；NEW audio viewport defaults；tick预算可留内部性能常量，不能把它误作工程长度。 |

### 3. 鼠标手势、滚动与命中（12）

| ID | 位置 | 字面量 | 控制什么 | 归属 / 统一来源 |
| --- | --- | --- | --- | --- |
| B20 | `apps/gpuix/src/project/sections/arrangement/core/viewport/zoom.ts:29,110`; `apps/gpuix/src/project/sections/clip-edit/audio/useAudioWaveformView.ts:58` | `/100`, `/260`, `*0.005` | minimap拖动、编曲滚轮、音源滚轮指数缩放敏感度 | **user setting**；NEW input/zoom sensitivity；三者意义不同，不可因都是指数缩放就强行同值。 |
| B21 | `apps/gpuix/src/project/sections/arrangement/core/viewport/minimap.ts:4,92`; `apps/gpuix/src/project/sections/clip-edit/audio/useAudioWaveformView.ts:101` | minimap pan `0.25`；音源左右键pan `±0.25` | 缩略图拖动水平倍率/按键每次四分之一视图 | **user setting**；NEW viewport pan defaults；不是同一倍率的重复。 |
| B22 | `apps/gpuix/src/ui/controls/DragPad/constants.ts:11,17,20` | `4`, `16`, `16` | 数值拖动px/step、滚轮px/step、非精确滚轮line→px | **user setting**；NEW numeric-input sensitivity；现有常量已局部集中，尚未接统一偏好。 |
| B23 | `apps/gpuix/src/ui/controls/DragPad/constants.ts:14`; `apps/gpuix/src/project/sections/arrangement/core/interactions/layers.ts:17` | `3` | 数值pad/编曲手势拖动起始阈值 | **user setting**；NEW pointer drag threshold；同义重复可统一。 |
| B24 | `apps/gpuix/src/project/sections/transport/index.tsx:300` | `450` ms | Stop两次点击归零的时间窗口 | **user setting / platform preference**；NEW multi-click timing。普通控件的双击不在此算法内。 |
| B25 | `apps/gpuix/src/project/sections/arrangement/timeline/viewport/controller.ts:67` | `2000` ms | 手动滚动后暂停自动follow | **user setting**；NEW follow behavior defaults。 |
| B26 | `apps/gpuix/src/project/sections/arrangement/core/viewport/zoom.ts:230-231` | `viewportWidth/2` | 播放头越过半屏就重新居中 | **user setting**；NEW follow trigger/anchor策略；与缩放按钮中心anchor不是同一概念。 |
| B27 | `apps/gpuix/src/project/sections/arrangement/core/viewport/edge-scroll.ts:48,50,53` | elapsed cap `48` ms；horizontal `0.75` px/ms；vertical `0.6` px/ms | 边缘自动滚动最大帧推进及速度 | **user setting**（速度）+内部默认（帧上限）；NEW autoscroll behavior defaults；edge宽度已有theme，见覆盖项。 |
| B28 | `apps/gpuix/src/project/sections/arrangement/core/clip-geometry.ts:13`; `apps/gpuix/src/project/sections/arrangement/core/viewport/minimap.ts:5`; `apps/gpuix/src/project/sections/clip-edit/midi/layout.ts:95-108` | `6` px（MIDI `edgeWidth` 默认值） | Clip、minimap、MIDI音符resize命中边宽 | **theme / accessibility setting**；NEW interaction hit-target metrics；语义可共享、具体表面可覆盖。 |
| B29 | `apps/gpuix/src/project/sections/arrangement/core/clip-geometry.ts:14`; `apps/gpuix/src/project/sections/arrangement/core/clip/fade.ts:42` | `7`; gap `min(.5,max(.1,7/width))` | fade交互命中/拖动最小间距 | **theme**；NEW fade hit-target metric。已有 `arrangementFadeHandleSize:5` 控制视觉尺寸，不能误把7改5而缩小点击区。 |
| B30 | `apps/gpuix/src/project/sections/arrangement/core/automation/geometry.ts:18`; `apps/gpuix/src/project/sections/arrangement/core/automation/hit.ts:46-47`; `apps/gpuix/src/project/sections/clip-edit/midi/useMidiEditor.ts:502` | radius `4`; segment reach `min(14,height/8)`；near界线`4`；velocity reach `height/8` | 自动化点/线段与velocity杆命中范围 | **theme / accessibility setting**；NEW editor hit metrics。 |
| B31 | `apps/gpuix/src/project/sections/arrangement/core/automation/drawing.ts:75` | `3` px | 自动化自由画线每多少像素采样 | **user setting / internal defaults**；NEW automation drawing resolution，和3px拖动阈值不是同义重复。 |

### 4. 电平范围与峰值衰减（4）

| ID | 位置 | 字面量 | 控制什么 | 归属 / 统一来源 |
| --- | --- | --- | --- | --- |
| B32 | `apps/gpuix/src/project/sections/arrangement/core/meters/meter-peak.ts:1-2` | `-60`, `+6` dB | meter显示/clamp范围 | **theme / user setting**；NEW meter presentation scale；TrackMeter已经正确消费这两个局部常量。别与send增益协议范围混为一谈。 |
| B33 | `apps/gpuix/src/project/sections/arrangement/core/meters/meter-peak.ts:3` | `600` ms | 峰值保持 | **user setting**；NEW meter ballistics。 |
| B34 | `apps/gpuix/src/project/sections/arrangement/core/meters/meter-peak.ts:4` | `24` dB/s | 峰值下降速度 | **user setting**；NEW meter ballistics。 |
| B35 | `crates/engine/src/realtime.rs:82,84` | `-120.0` dB | 无声/极低振幅遥测有限值floor | **centralized engine default**；NEW meter telemetry floor（非theme显示范围）。保留有限数值有JSON/数值安全意义，不应直接由主题-60替代。 |

### 5. MIDI 编辑与计算机键盘行为（8）

| ID | 位置 | 字面量 | 控制什么 | 归属 / 统一来源 |
| --- | --- | --- | --- | --- |
| B36 | `apps/gpuix/src/project/stores/slices/session.ts:25`; `apps/gpuix/src/project/adapters/midi.ts:85` | octave `4`; clamp `0..8` | 计算机键盘启动音区和可调范围 | **user setting**；NEW MIDI keyboard defaults；最终音高仍必须符合MIDI协议0..127。 |
| B37 | `apps/gpuix/src/project/stores/slices/session.ts:26`; `apps/gpuix/src/project/model/midi-editing/operations.ts:91,189` | velocity `100` | 键盘、双击插入、draw音符力度 | **user setting / project default**；NEW note insertion defaults；编辑器目前写死100，不能随session.midiVelocity改变。 |
| B38 | `apps/gpuix/src/project/model/midi-editing/operations.ts:90,189`; `apps/gpuix/src/project/adapters/midi.ts:29,65` | note length `1` beat vs `0.25` beat；新录音clip `1` bar | 双击、draw、键盘录音音符/clip长度不同 | **user setting / project default**；NEW note/recording defaults；明确不同插入动作是否共享长度。 |
| B39 | `apps/gpuix/src/project/model/midi-notes.ts:3`; `apps/gpuix/src/project/sections/clip-edit/midi/geometry.ts:17` | `NOTE_GRID_BEATS=0.25` 两处 | 命中、拖动、绘制音符网格固定16分音符 | **user setting**；NEW MIDI grid defaults；已有编曲 `workspace.grid`，是否跟随编曲是产品选择，不应继续复制常量。 |
| B40 | `apps/gpuix/src/project/sections/clip-edit/midi/geometry.ts:9`; `apps/gpuix/src/project/sections/clip-edit/midi/viewport.ts:13-16,40`; `apps/gpuix/src/project/sections/clip-edit/midi/layout.ts:47` | octave label offset `-2`；空clip/缺失pitch fallback `60` | MIDI60显示C3；折叠空clip显示C3 | **user setting**；NEW octave naming / initial pitch defaults。12音名与黑键集合是音乐常量，见C。 |
| B41 | `apps/gpuix/src/project/sections/clip-edit/midi/useMidiViewport.ts:27-28`; `apps/gpuix/src/project/sections/clip-edit/midi/viewport.ts:46` | `fold:false`, zoom `1`, fitted rows额外`3` | 初始fold/fit和音高上下留白 | **user setting**（fold/zoom）+**theme**（fit padding）；NEW MIDI view defaults。 |
| B42 | `apps/gpuix/src/project/sections/clip-edit/midi/useMidiEditor.ts:351-355`; `apps/gpuix/src/project/sections/arrangement/timeline/rulers/controller.ts:212` | quantize `NOTE_GRID_BEATS`（0.25）；snap关闭marker步长`1/16` bar | 量化固定16分音符，marker未吸附键盘步进 | **user setting**；NEW quantize/editor nudge defaults；不能把两种不同单位的1/16混用。 |
| B43 | `apps/gpuix/src/project/sections/arrangement/timeline/keyboard/controller.ts:142` | velocity step `10` | C/V力度调整步长 | **user setting**；NEW MIDI keyboard behavior。按键本身归K1，此处只收行为步幅。 |

### 6. 音频片段、淡化与节奏输入（4）

| ID | 位置 | 字面量 | 控制什么 | 归属 / 统一来源 |
| --- | --- | --- | --- | --- |
| B44 | `apps/gpuix/src/project/model/audio-editor/settings.ts:45-55` | `warp:true`, mode `"beats"`, transpose/detune `0`, reverse `false`, loop `true` | 新音频clip默认warp/loop/调音 | **project default / user setting**；NEW audio import/clip defaults；start/end随sourceOffset和clip长度计算应保留推导。 |
| B45 | `apps/gpuix/src/project/model/fades.ts:3`; `apps/gpuix/src/project/sections/arrangement/core/clip/fade.ts:43,69` | `DEFAULT_FADE_CURVE=0.35` | 缺省fade曲率 | **project default / user setting**；NEW fade defaults；调用点已复用局部常量。 |
| B46 | `apps/gpuix/src/project/model/fades.ts:103-115`; `apps/gpuix/src/project/sections/arrangement/core/clip/fade.ts:44,69` | fade length/offset缺省`0`；curve position缺省`.5` | 默认无淡化、曲线控制点居中 | **project default / user setting**；NEW fade defaults。曲线公式系数不是偏好，见C。 |
| B47 | `apps/gpuix/src/project/sections/transport/metronome.ts:25` | tap有效窗口`2500` ms，历史`.slice(-5)` | Tap Tempo平均窗口与最大tap样本数 | **user setting / centralized defaults**；NEW transport interaction defaults。 |

### 7. 历史容量、窗口与浏览器目录（5）

| ID | 位置 | 字面量 | 控制什么 | 归属 / 统一来源 |
| --- | --- | --- | --- | --- |
| B48 | `apps/gpuix/src/project/adapters/runtime/runtime-state.ts:98-100` | `past.length>100` / `shift()` | Undo历史上限 | **user setting**；NEW history capacity；不是协议限制。 |
| B49 | `apps/gpuix/src/app/home/recent-projects.ts:5,40,44` | `20` | 最近工程保留/持久化数量 | **user setting**；NEW recent-project capacity；已局部常量化。 |
| B50 | `apps/gpuix/src/main.tsx:52-54` | `width:1280,height:800` | 主窗口首次尺寸（注释引用旧Tauri配置，实际本地硬编码） | **user setting**；NEW window startup geometry / remembered geometry。 |
| B51 | `apps/gpuix/src/project/sections/browser/catalog.ts:44,53,64,78-140`; `apps/gpuix/src/project/sections/browser/useBrowser.ts:108` | `packs/userLibrary/currentProject`；写死设备/preset/sample/clip/groove/tuning/template列表 | 产品Browser目录并非真实扫描结果；所有资源名集中在该数组但未连接目录来源 | **user setting + resource catalog**；NEW user library/pack roots + resource index。这里没有真实浏览器文件系统路径，不能把 `"Piano C3.wav"` 当已存在文件路径。 |
| B52 | `apps/gpuix/src/project/sections/browser/catalog.ts:46,55,73,143-147`; `apps/gpuix/src/project/sections/browser/useBrowser.ts:49-54` | favorites `wavetable/hybrid-reverb/drum-rack`；purple判定`name==Wavetable`/`includes(Warm)`/`tags.includes(Ambient)`；初始kind `all`、descending `false` | 收藏、颜色收藏分类、排序与筛选初值 | **user setting**；NEW browser preferences / collection metadata；不能从名字反推用户收藏颜色。 |

### 8. 原生音频设备与处理默认值（4）

| ID | 位置 | 字面量 | 控制什么 | 归属 / 统一来源 |
| --- | --- | --- | --- | --- |
| B53 | `crates/engine/src/session.rs:75` | `desired_sample_rate=Some(48000)` | 首选设备采样率（实际值来自stream.info，不保证总是48000） | **user setting**；NEW audio-device settings；由native settings传入DeviceSession，不由theme决定。 |
| B54 | `crates/engine/src/session.rs:76` | `desired_block_frames=Some(256)` | 首选音频缓冲帧数/延迟 | **user setting**；NEW audio-device settings；与解码重采样chunk不是同一个buffer。 |
| B55 | `crates/engine/src/assets.rs:35,179,181` | peak base bin `64` frames，requested levels `32` | 波形峰值金字塔分辨率/深度 | **centralized engine defaults**，可由性能档位控制；NEW waveform processing defaults；不是默认采样率，也不是2048音符限制。 |
| B56 | `crates/engine/src/assets.rs:190`; `crates/native/src/engine.rs:141` | resampler chunk `1024`；telemetry `Duration::from_micros(33333)` | FFT重采样处理块、约30Hz控制线程遥测 | **centralized engine defaults**；NEW engine processing/telemetry defaults；如提供低CPU模式再接用户设置。无需向普通用户暴露全部底层参数。 |

## C：真正常量，避免过度迁移（8组）

| ID | 位置 | 字面量 | 保留原因 / 归属 |
| --- | --- | --- | --- |
| C01 | `apps/gpuix/src/project/sections/clip-edit/midi/clipboard.ts:3,6,22,40-51`; `apps/gpuix/src/project/model/clip-clipboard.ts:5,41`; `apps/gpuix/src/project/sections/arrangement/core/automation/clipboard.ts:3` | MIME `application/x-zoeymind-{midi-notes,clips,automation}+json`；version `1`；pitch `0..127`、velocity `1..127` | **true constant**：剪贴板协议身份、版本和MIDI7bit值域；不能因品牌名或设置变化改写既有数据协议。 |
| C02 | `apps/gpuix/src/project/adapters/snapshots.ts:40`; `apps/gpuix/src/app/home/recent-projects.ts:4`; `crates/native/src/settings.rs:11,31,73,108` | `zoeydaw:project:snapshot:v1:${encodeURIComponent(id??"default")}`；`zoeydaw:recent-projects`；`com.zoeydaw.desktop`；`Library/Logs`；`settings.json`；`snapshots/{encoded}.json` | **true constant**：持久化namespace、平台目录约定和兼容契约。可集中成 storage identifiers 表，但不做用户/theme配置；改名需数据迁移。目录根已由 `userDirectories` 提供，不能改成绝对工程地址。 |
| C03 | `crates/engine/src/assets.rs:21,85`; `crates/engine/src/peaks.rs:176` | `MAX_PEAK_PIXELS=16384` 和重复裸 `16384` | **true constant**：读峰值分配安全上限。应共享同一engine限制常量，不让主题绕过；与网格16384语义不同。 |
| C04 | `apps/gpuix/src/project/model/fades.ts:4,9`; `crates/engine/src/mix/fade.rs:11-12`; `crates/engine/src/mix/mod.rs:59`; `crates/engine/src/realtime.rs:82` | curve vertical scale `.4`；position clamp `.1..9`；normalized `-1..1/0..1`；`FRAC_PI_4`；`20*log10` | **true constant**：fade曲线/归一化模型、等功率pan和dB数学关系。JS/Rust需同一模型契约；不应随theme改变真实声音。 |
| C05 | `apps/gpuix/src/project/sections/clip-edit/midi/geometry.ts:2,4-5,9`; `apps/gpuix/src/project/model/types.ts:7`; `apps/gpuix/src/project/sections/transport/metronome.ts:17,28,32-34` | MIDI128pitch、12音级、黑键`[1,3,6,8,10]`；pattern16steps；`60000/1000/60/3600`；每拍4sixteenths | **true constant**：当前MIDI/12-TET/pattern数据形状和时间单位换算。pattern步数未来若变需连同schema/所有调用者改变，不是只加一个设置。 |
| C06 | `apps/gpuix/src/project/model/grid.ts:9`; `apps/gpuix/src/project/model/clip-automation.ts:5`; `apps/gpuix/src/project/sections/arrangement/core/rulers/geometry.ts:78` | `1/(MAX_NOTE_DENOMINATOR*32)`；`1e-6`；epsilon比较 | **true constant**：最短正长度和浮点比较安全策略，集中命名即可；不要当用户吸附粒度。 |
| C07 | `crates/engine/src/session.rs:55-58,72`; `crates/engine/src/realtime.rs:43-44`; `apps/gpuix/src/project/model/timeline-ticks.ts:13` | graph初始capacity `4/4/8/8`；stereo `[(0,0),(1,1)]`、2声道；tick budget `256` | **true constant / implementation tuning**：初始容器容量不等于用户轨道上限，双声道是当前处理模型，tick cap是绘制预算。可保留局部命名常量，不机械加用户设置。 |
| C08 | `apps/gpuix/src/project/model/persistence.ts:185-186,138`; `apps/gpuix/src/project/adapters/transport.ts:20`; `apps/gpuix/src/project/sections/transport/index.tsx:142-143`; `apps/gpuix/src/project/model/audio-editor/settings.ts:83-93` | BPM `20..999`；send gain `-60..6`；transpose `-48..48`；detune `-50..50` | **true constant / domain constraint**：现有可保存/可编辑数据边界，应统一domain limits并让UI消费，不开放theme修改。不是默认BPM120或meter视觉范围的重复项。 |

## 已有配置正确消费（不计入问题，4组）

| 项目 | 证据 | 结论 |
| --- | --- | --- |
| 普通轨道高度/最大高度/resize步进 | `apps/gpuix/src/project/layout/track.ts:8-14`；`apps/gpuix/src/project/adapters/tracks.ts:11,133`；`shared/theme/metrics/control-metrics.json:29` | 初始70来自theme，max=4×默认高度；行高/step由control tokens推导。倍数4可作为未来主题策略，但这里不是重复裸height70。 |
| 自动滚动边缘42px | `shared/theme/metrics/control-metrics.json:38`；`project/sections/arrangement/lane/interactions/controller.ts:250`；`project/sections/arrangement/timeline/viewport/auto-scroll.ts:20-21` | 已经通过theme/依赖注入，缺口是速度B27而非edge家不存在。 |
| MIDI行高6..18与编辑器区域尺寸 | `shared/theme/metrics/control-metrics.json:66-72`；`project/sections/clip-edit/midi/useMidiViewport.ts:20-25` | 行高、key/ruler/velocity高度已有theme入口，不能又新建第二份defaults。 |
| metronome开启默认 | `project/stores/slices/workspace.ts:16`; `project/model/persistence.ts:394-395`; `project/sections/transport/index.tsx:174-176` | `true`和旧快照补值需要统一project/workspace default；当前只有视觉节拍器，标签明确silent，不能虚构音频click音量/音色默认。此项作为B07同类补充，不新增问题组。 |

## 指定但未发现的行为 / 澄清

- **剪贴板2048音符上限不存在**：`project/sections/clip-edit/midi/clipboard.ts:24-30` 只拒绝空数组，再逐音符校验，不限制数量。对产品目录搜索 `2048|2_048` 后扩展搜索adapter/platform，当前数值只落到 `project/adapters/fixtures.ts:19`（mock waveform最多2048采样），不是clipboard；不应据题设误加音符上限。
- **autosave未实现**：产品搜索 `autosave|autoSave`，再检查 `adapters/snapshots.ts` 的保存入口与 `adapters/README.md:92`，当前为显式snapshot保存，README明确不是background autosave。没有可迁移的autosave间隔；新增autosave是功能需求，不属于常量搬家。
- **普通双击无JS时间间隔**：`ui/controls/DragPad/useDragPad.ts:110`、`project/sections/clip-edit/midi/useMidiEditor.ts:267`、`arrangement/lane/useLaneSurface.tsx:69`、`timeline/minimap/index.tsx:97`、`timeline/rulers/index.tsx:110` 都消费原生 `clickCount`。不要加第二套定时判定；唯一自定义450ms见B24。
- **浏览器没有真实catalog根路径**：`catalog.ts` 全部是显示元数据；`useBrowser.ts:108`直接筛选常量数组。native的 `userDirectories` 是app存储根，并非browser媒体根。应先有真实资源目录索引，再配置roots。
- **44.1kHz不是设备默认**：engine session首选48k/256；44100在此范围搜索主要属于Rust测试。不要将内联 `#[cfg(test)]` 后的样例当产品defaults。

## 键盘文字量统计（只计数，归K1，不设计）

为避免把相同按键在不同编辑表面去重后低估，采用“**作用域 × 按键组合**”计数；Cmd/Ctrl等价算一项，Shift变体单计；keyDown/keyUp同一动作只计一次；字符 `"space"`/`" "` 是两个字面量但同一个binding。下表覆盖产品业务层与业务控件编辑器，不含共享UI库的ARIA标准键盘导航、测试、demo、菜单展示字符串。

| 范围 | 数量 | 锚点 / 构成 |
| --- | --: | --- |
| Timeline业务指令 + 计算机琴键 | 34 | `project/sections/arrangement/timeline/keyboard/controller.ts:6-23,84-174`：18个指令组合，16个NOTE_KEYS。无选中Clip时Cmd+E的no-op分支不另计。 |
| MIDI editor | 15 | `project/sections/clip-edit/midi/useMidiEditor.ts:57-63,333-423`：8个command组合、Escape/Delete/Backspace与4方向键。DRAG_BLOCKED_COMMANDS只属于重复拦截，不加4。 |
| Lane公共/Clip/Automation | 15 | `arrangement/lane/interactions/controller.ts:205-228` 6；`clip/index.ts:130-164` 4；`automation/commands.ts:14-55` 5。 |
| 标尺/marker业务指令 | 8 | `arrangement/timeline/rulers/controller.ts:193-213`：Cmd+L、Escape、Delete、Backspace、F2、Enter、Left、Right。 |
| 全局Browser搜索 | 1 | `app/project/composition.ts:46-49`：Cmd/Ctrl+F。 |
| EffectChain业务操作 | 8 | `project/sections/footer/EffectChain/index.tsx:123-142`：Escape、Alt+Left/Right、Delete/Backspace、Left/Right、Enter。 |
| 音源view / source marker | 5 | `clip-edit/audio/useAudioWaveformView.ts:98-101` 2；`audio/SourceMarker.tsx:116-139` 3。 |
| 轨道identity / resize / reorder | 8 | `tracks/TrackIdentity/index.tsx:49-52` 2；`tracks/Row/useTrackResize.ts:65-81` 5（包含arrowup/arrowdown别名）；`tracks/Row/useTrackReorder.ts:92` 1。 |
| 名称/数值编辑器 Escape | 4 | `tracks/TrackIdentity/NameInput/index.tsx:38`; `timeline/rulers/MarkerEditor.tsx:75`; `lane/interactions/clip/NameEditor/index.tsx:113`; `lane/interactions/automation/ValueEditor/index.tsx:167`。 |
| **合计** | **98** | 包含别名与重复作用域，非98个唯一快捷键。上述范围共40种不同按键字面量（包含space字符和arrowup/arrowdown别名）；不计modifier名称。 |

## 架构连接（供迁移分片使用）

- `stores/slices/document.ts` / `workspace.ts` / `session.ts` 各自创建工程、工作区、临时输入状态；`model/reducers.ts`另建轨道/片段模板；`core/scene.ts`还复制一份120/4/4/24/128和不同loop长度。这是最主要的默认值分叉链。
- `model/grid.ts`决定grid与编曲zoom上界；`core/viewport/zoom.ts`决定fit下界/滚轮/按钮/跟随；MIDI和音源编辑器各自还有独立zoom policy。统一入口应保留不同语义，而非让所有16/24/100统一成一个数字。
- theme metrics已覆盖轨道布局、autoscroll edge、MIDI行高；settings目前覆盖面很窄。新增用户可调偏好应进入既有settings，工程创建模板与实际持久化工程值分离。
- `crates/engine/src/session.rs`选择设备48k/256；`assets.rs`解码/重采样并构建peak pyramid；`crates/native/src/engine.rs`以33333µs调度遥测；TS meter使用自身-60..6/600ms/24dBps显示策略。音频数学、设备设置和视觉meter策略必须区分。
