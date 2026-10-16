# C4 文案与工程默认值迁移

2026-10-16。分支 `chacelow/gpuix-cfg-text-defaults`。本地不执行完整 `pnpm verify:gpuix`，遵循当天更新的轻量验证规则；完整门禁由协调者在 Actions 执行。本切片不 push、不发布、不改 Live 工程。

## 结果与边界

- 文案、创建名称、显示精度、单位、时间及声像格式进入 `app/locales`，组合根向共享组件和业务区注入。共享 UI 不再提供英文默认文案。
- `project/defaults/template.ts` 是 document、workspace、session、空 scene 的共同来源。创建时取样名称与外观，保存数据不随语言或主题变化重命名。录音进入 journal 前取样名称，延迟执行也不重读 locale。
- Rust napi `Settings`/`Preferences` 定义唯一 schema，既有 napi 构建生成 TS 类型。默认数据只在 `project/defaults/preferences.json`；纯 TS 入口的 JSON 模块声明引用生成类型，不加载 native runtime，也不复制结构。
- schemaVersion 1 支持旧无版本文件的只读内存迁移。未来版本、非法偏好与不可读原文件拒写，保留原始字节。音频设备首选参数进入 settings，实际设备参数仍以 stream info 为准。
- DragPad 的拖动比例、滚轮比例、line 换算与激活阈值通过 `ControlEnvironment.inputPolicy` 注入。嵌套 Provider 只继承新增能力，不改变其它字段的替换语义；按下时快照策略，运行中改偏好不跳变当前手势。
- notifications 是时长、队列和可见上限的唯一数值来源。policy 更新与卸载 dismiss 分属两个 effect，保留通知原有 expiry。
- 目录 metadata 已迁移；真实 filesystem roots 没有既有实现，不伪造。删除无消费者的 `libraryRoots`/`packRoots`。静态演示目录仍不可加载或放置，不把显示名当文件路径。

### 协调者裁定

| 项目 | 处置 |
| --- | --- |
| Main 高度与创建色 | C4 获准补 `layout.track.mainHeight=108`、`design.trackCreationColors`；保留旧颜色与 Main 的 `var(--chart-3)` 内容色解析 |
| scene loop 分叉 | 以真实新工程的 8 小节为唯一模板，空 scene 从 4 改为 8；明确的产品差异 |
| shared UI 英文默认 | C2 删除默认值并增加必填注入点，C4 接调用方来源 |
| arrangement 格式与 tracks locale | 归 C3；C4 只保留必填 API 的机械调用迁移，额外 Track carrier 已回退，无 shim |
| pan 表面差异 | 同一个算法，control 阈值 0、无空格；automation 阈值 .005、有空格；中英文均保留 C/L/R |
| arrangement 只用的策略 | 默认值归 C3 `arrangement.ts`，settings 仅存稀疏 override；不重复默认数字 |
| Icon scan 误报 | 由 C2 增加原生 SVG host 精确豁免及其它文件仍 HARD 的回归，C4 未改门禁 |

## 盘点处理

| 盘点组 | 来源与消费者 |
| --- | --- |
| text A01–A06、B01–B04 | C2 必填 Loading、Progress、Toaster、SettingsShell、LoadErrorScreen、PanControl、DragPadToggle 文案；调用方使用已有或新增中英文资源。四个 Link/Loop/Warp/Reverse 固定功能标签保持基线，不改成 ON/OFF |
| text A07、A08、B11–B14 | `creation-names.ts` → 模板、track/clip/marker/copy 命令；已有用户名称与真实 basename 保留 |
| text B05、B06 | ProjectPage 注入 panel 名称及 activeDescription；分隔条注入可访问像素 formatter |
| text B07–B10 | `SnapshotErrorCode` 为 read/invalid/write/missing；应用组合根当前语言映射，不保存句子 |
| text B15–B19、B24 | `createDisplayFormats`；transport、clip-edit、footer、Home 已消费。arrangement 的 ValueEditor、meter、toolbar、ruler 调用归 C3 |
| text B20–B22、B25 | 37 devices、75 child presets、20 resources 的本地化 metadata；132 个稳定 ID 不随语言变化，搜索使用应用 locale |
| text B23 | 已提供 monitor mode 中英来源，Track 调用与 locale 迁移由 C3 完成 |
| behavior A01–A03、B01–B08 | 模板、主题创建外观及 workspace 启动偏好；Main 108 与普通轨高分开，不把两种 OKLCH 擅自等同其它 chart 色 |
| behavior B22、B23 | 后续明确授权 C4 补 shared DragPad 消费链；4/16/16/3 默认值不变，arrangement pointer 消费仍归 C3 |
| behavior B36–B43 | MIDI keyboard、插入、绘制、录音、fold、命名音区等来源；draw 保留实际旧值 .25，不误用插入长度 1。编排区专用 velocityStep/markerNudge 归 C3 |
| behavior B44–B47 | 音频 metadata、fade 模板、Tap/Stop 策略；不增加 warp/pitch DSP 或音频节拍器能力 |
| behavior B48–B50、B52 | history、recent、窗口、browser 启动偏好接入 settings；workspace 保存实际视图值 |
| behavior B51 | 仅 metadata 迁移；没有可迁移的真实目录索引，删除空 roots 配置，另立功能切片 |
| behavior B53–B56 | 设备首选参数进入 settings；峰值、重采样及遥测默认集中于 engine defaults，数值保持；没有改 DSP 算法 |
| C 类 | 协议/版本/namespace、MIDI 与时间单位、DSP 数学、分配安全上限、夹具视口留在原层并说明原因；不把品牌、真实 basename 或开发诊断翻译为用户数据 |

## 实跑验证

工作目录为 `apps/gpuix`，除注明外。

| 命令或场景 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过 |
| 受影响范围 `bun test`，涵盖 app/i18n、control-input、project lifecycle、settings/storage、defaults/model/adapters、transport、clip-edit、browser、footer、tracks Row/meter、shared controls/UI verification | 最终 903 pass、0 fail，135 files、423212 assertions；未运行全仓完整门禁 |
| 影响的 TypeScript 路径 eslint | 251 files、0 warning/error；路径取未截断 Git diff 输出，不使用被压缩的路径列表 |
| `cargo check -p zoeydaw-engine -p zoeydaw-native` | 通过 |
| `cargo test -p zoeydaw-engine -p zoeydaw-native` | engine 39、native 29，共 68 pass |
| `bun run --cwd crates/native build:debug` | 重建真实 bridge、二进制及生成类型；生成文件按仓库约定忽略，不手改或强制提交 |
| `node scripts/gpuix-ui-map.mjs --check` | current：9 entries、3 routes、234 testIds |
| `bun src/project/sections/clip-edit/verification/mutations.mjs C4` | 独立临时 checkout 中 baseline 0，30/30 killed，exit 0；含两种 pan 阈值、C/L/R、separator、5 输入策略/快照、事件时录音名称 |
| `bun src/app/verification/mutations.mjs "view unmount"` | 1 mutation caught，3 个真实行为断言失败；临时源恢复，实际工作树未改 |
| native settings smoke | 无版本文件内存迁移且字节不改；设备偏好 44100/128 重新创建 owner 后读回；future-version 写入拒绝且字节保留。这不是硬件必然采用 44100 的声明 |
| 真实 decoder/device 路径 | sampleRate 48000、latency 284 frames；播放/seek、有限 meter、停止 -120 dBFS 有真实输出 |
| `ProjectPage` 来源回归 | Main 原生行高、5 类创建色随来源；语言/主题变化不改已存文档、不重开 session；下一新工程采样新 Main 高度 |
| notification 来源回归 | 改 visible/queue/defaultDuration 不清空保留项、不重启旧 expiry；队列缩小时淘汰旧项，新增项使用新时长 |

没有把测试中有意触发的 read-only/unknown-mode WARN 日志称为失败。系统 `CoreAnalytics` 诊断不作为产品行为证据。

## 原生像素与窗口证据

证据目录在仓库外：`/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/zoeydaw-c4-evidence-8ySk93`。入口为 `app/verification/r1c-surfaces.tsx` 加真实 `native-fixture.ts`，Gallery 使用 `scripts/gpuix-main/ci-geometry/gallery.tsx`。

| 组合 | 比较结果 |
| --- | --- |
| Gallery 深浅 × 中英 4 张 | 全部 0 像素差 |
| 业务英文 深浅 × MIDI/audio 4 张 | 重复捕获全部 0 像素差；首轮 light/audio 曾有单像素 1 灰阶差，已记录而未隐藏 |
| 业务中文 深色 MIDI/audio | 9533 左右像素差，限定 Browser 本地化结果区；其它区域保持。偶发单像素栅格差另记 |
| 业务中文 浅色 MIDI/audio | 9017 像素差，bbox `(108,151)-(318,470)`，为既有英文演示资源翻译 |
| 后台真实窗口 | 自启 `GPUIX_BACKGROUND=1 bun --hot src/app/verification/footer/demo.tsx`，日志为 created native window、mount complete、B2 panels mounted；OS 窗口列表未暴露该后台窗口，AX 未验证，未切前台；已关闭 |

原始 baseline 的仓库根 Gallery 脚本因 JSX 解析范围未运行；把完全相同的有限脚本放入 baseline 的 app scope 后成功捕获，未改 baseline 业务源码。前台可见窗口的整体视觉与帧性能仍由协调者串行验收，不用离屏数据冒充前台性能。

### UI 规范第 13 节

| 检查 | 证据与结论 |
| --- | --- |
| Gallery 与业务整体 | 4 Gallery overview、8 真实后端业务组合，不按按钮批量截图 |
| 跨区域居中 | 同屏工具栏、数值、卡片和面板边界检查；默认图形无迁移位移，Main 行高另有原生 bounds 回归 |
| gap/padding | 沿用 C1/C2 token，Gallery 0 diff；没有新增业务实例补偿 |
| 统一入口 | Theme Main/创建色、locale format、input、notification 来源回归及变异均改变真实消费者 |
| 尺寸与紧凑感 | 保留默认原生尺寸与紧凑度；没有单实例放大或新增网页式留白 |
| 深浅与中英文 | 同一组合覆盖全部四象限；中文 Browser 差异为明确的本地化 |
| 状态与键盘 | native keystrokes、真实 pointer/wheel dispatcher、失焦/手势快照与通知状态转换测试通过 |
| 拖动/滚轮/弹层/性能 | shared controls 原生行为范围测试通过；没有声称实跑前台帧性能 |

## Live 对照

只读观察 Live 的 `无标题` 窗口，未编辑工程或触发播放。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 工程拍号与音阶 | 当前工程 4/4、C Major | 模板保留 4/4、C major | 当前 Live 速度 140 是现有工程值；不能据此推断新建默认，repo 120 保留 |
| Main 与路由 | Main、1/2、Auto/In/Off 可访问值 | 保留 protocol id、compact 模式及用户名称 | Track 文案消费归 C3 |
| 设备 | 48.0 kHz | 设置首选 48000/256，实际 stream info 验证 48000 | 不声称默认值能强制所有硬件 |
| clip loop、fold | loop 开、fold 关；当前 clip 4 bars | 音频/MIDI metadata 默认来源保持旧值 | 录音/插入/绘制长度按各自旧语义，未改 Live |
| 声像符号 | 旧产品与协调者 Live 观察均为 C/L/R | 两表面同源但保留阈值/空格差异，解析兼容 separator/L25% | 不在此迁移中统一两表面交互语义 |

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| runtime cleanup 变异锚点失效 | 必修 | 改为清理中的 releaseRuntime 调用 | 1 mutation caught |
| 当前 README 仍指旧验证入口 | 必修 | 更新 app/verification 路径，历史报告不改 | dc79beac |
| 录音 journal 延迟重读名称 | 必修 | 入 journal 前取样名称，新增完成/取消回归 | e6b03ef8、两种命名变异 killed |
| AutomationValueEditor 与 timeline formats 消费 | 汇报仲裁 | C3 完成；C4 不冒领 Track 迁移 | 协调者 msg_ebe49641b0d8 |
| Icon 原生 SVG host 正则误报 | 汇报仲裁 | C2 精确修扫描后同步 | 当前 scan 0 HARD |
| C2 合并后配置原生测试失败 | 汇报仲裁 | C2 合并 C4 后修，C4 同步 | 定向 118 pass，最终范围 903 pass |
| 663 行 catalog | 记录 | 数据表和稳定 ID/本地化 metadata 单一职责，无控制流程；保留同文件并由 132 ID 契约覆盖 | file-size WARN，有明确理由 |

### scan WARN 逐项结论

最终 `node scripts/gpuix-review-scan.mjs`：0 HARD、15 WARN。

| 文件 | 结论 |
| --- | --- |
| `app/locales/browser-catalog.ts` | 数据表单一职责，663 行理由见上；无 >1000 手写文件增长 |
| `app/verification/clip-edit/audio-render-cost.tsx` | 离屏 fixture 视口，契约允许常量，不是产品尺寸 |
| `app/verification/clip-edit/consumer-probe.tsx` | 同上 |
| `app/verification/clip-edit/demo/index.tsx` | 独立验证窗口尺寸，不改变产品窗口默认 |
| `app/verification/footer/demo.tsx` | 验证窗口尺寸 |
| `app/verification/footer/measure.tsx` | 测量视口 matrix |
| `app/verification/footer/states.tsx` | 状态测量视口 matrix |
| `app/verification/lane/demo.tsx` | 独立验证窗口尺寸 |
| `app/verification/timeline/layout-smoke.tsx` | 离屏 toolbar 视口 |
| `app/verification/tracks/appearance-smoke.tsx` | 主题矩阵视口 |
| `app/verification/tracks/demo.tsx` | 独立验证窗口尺寸 |
| `app/verification/tracks/render-cost.tsx` | 固定测量协议视口 |
| `gallery/states.tsx` | Gallery 固定展示高度，排除的演示 fixture，不是业务实例来源 |
| `project/adapters/fixtures.ts` | 显式测试颜色，生产组合未导入 |
| `project/defaults/template.ts` | paddingBars=16 是时间线增长余量，非像素；已归 defaults 源 |

## 错题

- 把原始 draw length 误读为 1。实际为 .25，已按代码保留并用不同插入/录音策略回归防混用。
- 不能用 JSON Value 的整数/浮点表示差异测试 defaults 一致性。删除该 incidental assertion，保留 Rust/TS 数值全等及边界行为测试。
- 原生派发后只 flush renderer 不等于提交 React state。量化与 locale 回归需要正确的 flushSync 边界。
- 不从组件默认 ON/OFF 推断调用方实际显示。不可变 baseline 证明四个功能 toggle 已显式同名，保持原样。
- 目录根、Track carrier 等无消费者或跨所有权内容不能作为完成；删除空 roots，回退越界 Track carrier。

## 已验证做法

- Rust schema/napi 类型生成加同一 JSON 数据源，避免平行手写 TS settings。
- 输入偏好在实际消费者回归中覆盖 4→8、16→32、16→24、3→7，手势快照独立变异。
- 大范围合并先 WIP checkpoint，再逐项小提交；全部 hook 通过，没有 --no-verify。
- mutation 在仓库外的 immutable checkout 运行，避免中断破坏工作树。
- 所有自启 GPU 验证 service 拿到证据立即关闭。后台 AX 不可见就如实标未验证，不抢用户前台。

## 进程清理

实际执行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空，grep exit 1 表示没有匹配。自启的业务/Gallery/mutation/window service 均已关闭；未停止用户或其它 worker 的服务。临时 baseline 和 mutation checkout 位于仓库外，交付前清理；证据 PNG 留在上述外部证据目录供协调者复查。
