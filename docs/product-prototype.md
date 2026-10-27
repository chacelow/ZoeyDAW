# 原型范围与产品策略

## 当前范围

zoeydaw 是 Web-UI DAW。React 实现界面与交互，Tauri 承载桌面壳。Mac 播放接入唯一 Tracktion Engine、JUCE CoreAudio 及 SoundTouch/Signalsmith。现有能力不代表完整 DAW 深度或最终音质与性能验收通过。

当前有首页、单项目面板、Browser、编排时间线与组件画廊。生产项目使用原生播放后端，不在浏览器中回退到模拟发声。Browser 接入真实目录引用、可取消后台索引、可搜索文件树、虚拟滚动、独立试听和拖入编排。原生工程存储提供音频探测与 SHA-256、`.zdaw` manifest 保存和重开、媒体收集及同内容 Relink。Gallery 和模拟行为测试显式注入 mock provider。

一个窗口同时持有一个项目视图；不恢复旧思维导图的多 Tab、Portal 或故障隔离架构。

## 迭代策略

按界面需求反推原生需求。先让交互可运行、状态和验收可观察，再落实 Rust 实现；不先铺音频引擎或假想长期架构。

前端 runtime 集中命令、预览与确认，独立 `projectFiles` 协调真实工程文件，localStorage 只保存最近工程位置。原生播放已接入输出、外部输入监听、录音 writer、音频/MIDI Clip 和 Device chain；外部插件已有隔离 admission、参数、完整状态保存、原生编辑器、显式恢复、工程自动化及设备格式重准备接线。显式配置和驱动主动格式变化共用准备 owner，后者不重新打开驱动或覆盖偏好。完整 Session、自动化录制及物理设备恢复终验仍有缺口，见 [模块契约](architecture/modules.md) 和 [adapter 契约](../apps/web/src/pages/project/adapters/README.md)。无音源 MIDI 保持静音，真实 helper PCM 与显式 mock 浏览器证据不代替 Tauri、物理输入或真实音频终验。

兼容 Ableton Live `.als`，以及支持 CLAP/VST3，是产品方向，不是 Agent 可以自动扩展本轮任务的实现清单。具体支持范围由当次需求和真实验证决定。

## 范围判断

- 演示资源与模拟波形明确属于原型数据，不冒充本地文件或解码结果。新工程保留一条使用标准默认值并输出到 Main 的空 Audio 轨；工程始终至少有一条 Audio 或 MIDI 轨，Main、Return 和 Group 不计入。会删除最后普通轨道的直接、批量或 Group 递归删除整次拒绝；旧快照没有普通轨道时保留原数据并补一条空 Audio。Gallery 保留隔离演示素材，真实导入不生成伪造波形。
- Browser 右侧为可展开文件树，不平铺目录内容，也不显示翻页操作。左侧目录列表最末是“添加文件夹”。试听始终原速原调，底部波形与原生播放进度独立于工程 Master。设置中的自动 Warp 默认开启，只作用于之后的文件导入和 Browser 放置；关闭后保持原速且不请求节拍分析。开启时有效源 BPM 才匹配工程速度，分析不确定时保留原速并提示，不修改工程 BPM。
- 已有主题、语言和设置对话框保留，不用简化控件替换。
- 组件画廊用于验证共享组件的行为和规格，不与工程私有状态绑定。
- 调整目录、接口或工具链不自动授权提交、发布、部署或合并。

实现与状态契约见 [模块组织](architecture/modules.md)、[project adapter](../apps/web/src/pages/project/adapters/README.md)。音频选型仍须通过 [固定验证协议](research/audio-validation-protocol-2026-10-22.md)，离线合成结果不代替音乐盲听、设备延迟、Windows 真机或长时稳定性验收。

Mac 接入已通过原生构建、协议与非零源循环实际渲染测试，真实 E2x2/CoreAudio 回调已运行并捕获到保持 440 Hz 的 1.2 倍速同步输出。实际桌面 Browser 到播放 UI、设备电气回环、长时负载和音乐盲听仍须分别验收；命令行引擎捕获不冒充桌面 UI 或物理回环通过。

音频设置接入原生完整配置、独立输入输出、可用采样率与 Buffer Size、mono/stereo 通道开关及驱动延迟反馈。E2x2/CoreAudio 配置 smoke 已通过真实 buffer 切换、非法配置拒绝、持久化失败回滚、通道掩码、编排与独立 Preview 状态保留、停止代际和配置重载。测试保持 44.1 kHz 并恢复 256-frame 基线。输入权限和采集、设置对话框的桌面操作、物理回环仍未验收。Windows ASIO 未编译启用，不作为已支持能力。

修正原生 MIDI 力度校验为工程的 0–127 后，实际桌面工程已显示 `1 Audio + Main`，open 通信错误消失，播放位置前进且停止可生效。同核心真实设备 smoke 使用 `midiVelocity: 100` 通过定位、循环、独立试听、owner 切换与停止。该验收不代表桌面拖入、工程重开、输入授权或物理回环已全部通过。

Audio 放置以临时 Clip Ghost 预览。底部空白区额外预览完整新轨道，取消不修改工程。无音源 MIDI 接收音频时原地转换 Audio 并替换 MIDI/Pattern 内容，一次 Ctrl/Cmd+Z 恢复整个原轨道。已在真实 Mac 桌面验证 Browser 文件拖入 Audio 并生成真实波形；该音乐素材分析不确定，按契约原速导入。已在隔离浏览器页面验证 MIDI 原地转换、Ctrl+Z、底部 Ghost 取消，使用显式模拟文件入口，不计为原生发声验证。
