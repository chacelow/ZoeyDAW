# 从 X 追溯的开源 DAW 线索

2026-10-22。使用 ego 浏览器实际搜索 X，使用 GitHub MCP 和仓库资料追溯。帖子只是发现入口，不能证明性能、完成度或可嵌入性。没有关注、点赞、发布或发送信息。

## 查到的项目

| 项目 | X 入口 | 仓库事实与局限 | 本次用途 |
| --- | --- | --- | --- |
| Sweet DAW | [作者开源公告](https://x.com/land0jp/status/2100237479320457337) | [仓库](https://github.com/drvfua-debug/sweet-daw-open) 为 MIT，React/TypeScript/Web Audio，README 标注初始 v0.1.0，偏移动端与 AI stems 后期。BPM Lock 自述为离线素材渲染，不是动态 tempo 播放。 | 可看素材与非破坏编辑，不作为原生多轨实时引擎首选。 |
| eseq | [作者回复](https://x.com/__ALEZ/status/2098530033014861870) | [仓库](https://github.com/universalsequences/eseq) 为 GPLv3，Rust 加 Lisp runtime，README 当前列 macOS、Linux，无已查实 Windows 路径。DSP 还有独立 C audiograph 与运行时编译器，不等于所有层纯 Rust。 | 看实时图与性能验证方法，不为它迁移当前 UI。 |
| openDAW | [社区版本消息](https://x.com/chom/status/2111012762327691733) | [仓库](https://github.com/andremichelle/openDAW) 主体 AGPLv3+，官网另有商业许可。已打开 [运行网页](https://opendaw.studio/) 并观察 Dashboard、项目、Samples、Soundfonts 和 WebCLAP 入口；没有加载用户音频或测播放。 | 现代 Browser 与素材工作流参考，不凭网页能启动证明原生驱动能力。 |
| SoundCraft | [近期讨论](https://x.com/mochittini/status/2113045751131427085) | [官方仓库](https://github.com/storytold/soundcraft) 标明 pre-alpha、MIT 或 Apache-2.0。README 功能很多，但项目自己的 gaps 记录整文件 RAM、流播缺失、无音质对照验证等。 | 可看可复用模块与对照方法，不整套当成熟 DAW 引擎接入。 |
| Futureboard Studio | X 搜索没有取得可引用的作者发布帖，不能补造。 | [仓库](https://github.com/futureboard/futureboard-studio) 为 MIT，明确 pre-alpha。源码有真实流播与峰值缓存，同时存在平台本地依赖和大压缩文件限制。 | 经源码审查后复用局部设计，不以 MIT 或 Rust 直接判定可靠。 |

另外搜索到 Ardour、LMMS 发布消息，以及不是 DAW 的音频工具。没有把“DAW”关键词命中就算同类产品。

## 两个具体源码反例

### 名字叫 streaming，不一定是实时磁盘播放

已通过 GitHub MCP 读取 Sweet DAW 的 [StreamingWavSource.ts](https://github.com/drvfua-debug/sweet-daw-open/blob/main/src/audio/engine/StreamingWavSource.ts)。`readPcmWavRange()` 读取 Blob 的一个连续范围并分配 Float32Array；`prepareStreamingWavSources()` 汇总该次渲染的源范围并创建 AudioBuffer。它能减少离线分块渲染的内存，不等于已经证明无界长文件的实时预读、循环和多位置并播。不能因文件名有 Streaming 就当需求已解决。

### README 的“Fast”不等于已验证产品性能

已通过 MCP 读取 SoundCraft 固定提交 `9b8283b90877813a929f5e28b2dc92e5774da933` 的 [SourcePool](https://github.com/storytold/soundcraft/blob/9b8283b90877813a929f5e28b2dc92e5774da933/crates/model/src/source.rs) 与 [gaps](https://github.com/storytold/soundcraft/blob/9b8283b90877813a929f5e28b2dc92e5774da933/docs/gaps.md)。SourcePool 共享 Arc 包装的整段解码 AudioBuffer 和峰值；G-06 明确记录长文件流播和录音落盘缺口，G-07 记录没有与目标软件输出对照。不能用宣传中的帧率代替 ZoeyDAW 的内存、xrun 与音质验收。

## 筛选原则

- X 用于发现，不用于背书。
- README 用于定位，固定提交源码用于确认结构，运行与测量用于确认效果。
- 不因项目新就否定可用模块，也不因 stars、release 数量或 AI 生成速度就认为成熟。
- GPL/AGPL 与商业双许可不能忽略；MIT 根许可证也不能替代第三方依赖审查。
- 用现成解码器、拉伸器、设备库或成熟引擎解决已有人解决的问题。产品状态、错误恢复与交互仍需整体设计。
