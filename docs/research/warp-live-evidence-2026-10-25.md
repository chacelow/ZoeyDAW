# Live Warp 实现证据

本轮检查已安装的 `/Applications/Ableton Live 12 Beta.app/Contents/MacOS/Live`，arm64 slice，Mach-O UUID `1C047D57-ADC5-330C-98AC-B7E914239D03`，完整文件 SHA-256 `ba0a4b90a3563d18877dda7d1284590956644eb3970f5b68575e3a9d6b096518`。REA `inspect_macho` Evidence 为 `ev_caf056d1dd7255e58e99b2b172922e003cd2731f30828346700383944addb102`。本轮使用系统原生 Mach-O 检查，没有反编译 DSP 或观察运行调用。导出表不完整，未返回的符号不能视为不存在。

## 二进制观察

| 地址          | 导出符号中的类型与方法                                           |
| ------------- | ---------------------------------------------------------------- |
| `0x102305f00` | `OWarperBeats::OnSustainComplete` callback                       |
| `0x102311310` | `OWarperTones::OnSustainComplete` callback                       |
| `0x1023112c8` | `OWarperTexture::OnSustainComplete` callback                     |
| `0x1023112c4` | `OWarperRePitch::OnSustainComplete` callback                     |
| `0x102305f04` | `OWarperElastique::ProcessData` callback                         |
| `0x100e0d654` | `FWarpMarkerContainer::mWarpMarkers` model registration          |
| `0x100e0d65c` | `FWarpMarkerContainer::mTempoAfterLastMarker` model registration |

这些符号证明发布产物包含相应类型和模型注册，不证明本次播放曾执行它们，也不提供其完整算法或参数。36 条链接库声明中有 `libonnxruntime_abl.dylib`，但本轮没有将它追到 Auto-Warp，不能据此声称当前 Auto-Warp 使用某个神经网络。

## 官方资料确认的行为

[Live 12 手册 §9](https://www.ableton.com/en/manual/audio-clips-tempo-and-warping/) 区分短素材策略、长素材 Auto-Warp 和默认 Warp Mode。首次导入先分析；Warp Marker 将源时间点映射到音乐时间。源 BPM 是固定速度映射的一个参数，不能独自表达首拍、弱起和变速演奏。

同一手册 §9.3 说明 Beats 保护瞬态并支持片段循环与包络；Tones 按音高特征调整颗粒大小；Texture 采用颗粒与 Fluctuation；Re-Pitch 以播放速率耦合速度和音高，并关闭独立移调控件；Complex/Complex Pro 处理混合素材，Pro 提供 Formants 和 Envelope。

[zplane 对 Ableton CEO 的官方访谈](https://products.zplane.de/blog/gerhard-behles-interview-ableton) 明确说 Live 5 授权 Auftakt 与 Elastique，Complex 使用频域技术；Beats、Tones、Texture 和 Re-Pitch 初版由 Gerhard Behles 编写。这是历史与技术来源证据，不能据此推定已安装版本的 SDK 版本、参数或全部 DSP 细节。

## 本项目实测差距

直接编译当前 `tempo_analysis.cpp` 并链接现有原生库的独立探针得到：规则 120 BPM 十秒脉冲返回 120；两秒循环、十秒切分节奏返回 unknown；反相立体声规则节拍经能量回退返回 120；纯音和单次敲击返回 unknown。这些合成用例证明现有拒绝路径，不代表真实音乐识别率。

原生 `TimeStretcher::checkModeIsAvailable` 探针中，Signalsmith Default/Cheaper、RubberBand Melodic/Percussive 和 Elastique Pro 全部回退到 SoundTouch Better。当前源码的 Clip 插入与实时更新也明确选择 SoundTouch Better。界面五个非 Re-Pitch 模式没有五种对应处理器。Rust engine crate 没有单独的 BPM 或 stretch crate。

候选库及许可见 [伸缩选型](warp-stretch-options-2026-10-25.md) 与 [节拍分析选型](warp-tempo-options-2026-10-25.md)。未取得当前 Live 自动分析算法、完整 DSP、SDK 版本或相同素材的音质对比结果。
