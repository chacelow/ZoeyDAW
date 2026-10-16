# C3 编排统一配置迁移

## 范围与交付状态

C3 的样式、几何、编辑策略和已授权的格式调用迁移已完成本地验收。Standards 无可行动发现，Spec 两项 P2 已修复并由原 reviewer 复核关闭。本文用于 `merge_ready`，不代替协调者的前台视觉评审或 main Actions 完整门禁，合入复核后再发送 `worker_done`。

实际开工基线为 `a4a9d11c`。所有权为 `project/sections/arrangement/**`。协调者追加授权了 `project/defaults/arrangement.ts`、组合根配置注入、Track locale 资源迁移及对应验证调用更新。C1 来源以已合入的 `gpuix-migration` 为准。C2 的中央 Icon scanner 修复从主干合入，C4 的创建模板、settings、formatter 和中心 `C` 修复从其发布提交合入，没有在 C3 复制共享修法。

本轮不新增依赖，不 push，不改 Live 工程，不修改用户启动的服务。Rust 变化仅为合入依赖，不属于 C3 实现。用户后来要求完整 `pnpm verify:gpuix` 放在 main Actions，本机只运行类型、范围测试、eslint、变异和必要原生验证。

## 来源与生命周期

- `Theme.layout` 注入唯一 `ArrangementGeometry`。绘制、hit、滚动、resize、标尺和 viewport 读取同一几何引用。`SceneStore.setGeometry()` 更新原实例，不重建工程或修改保存的轨高。
- `project/defaults/arrangement.ts` 持有 `ArrangementPolicy`、默认值、单位与合法范围。配置边界解析稀疏偏好，合法零值保留。controllers 通过 `readPolicy()` 读取最新值，纯计算只接收需要的策略分组。
- project metrics 不决定 composition 生命周期。稳定只读 metrics 对象读取最新受控 project 来源，minimap 上下限和两个 autoscroll owner 不冻结初值。偏好或度量变化取消活动 preview，不提交工程，不生成 undo。
- Track 文案唯一数据位于 `app/locales/sections/tracks.ts`。组合根注入 `TrackLabels` 和纯 `DisplayFormats` 端口。删除旧 `tracks/locales.ts` 与其 re-export，project 产品代码不 import app。
- Mixer Pan 使用 `control` 变体，自动化 ValueEditor 使用 `automation` 变体。ValueEditor 的 dB 带单位。中心 `C` 保持跨语言协议表示，业务组件不加 locale 特例。
- meter 的显示范围、hold、fall 读取策略。遥测 floor 和音频增益协议不是显示偏好，不混用。

## 盘点处置

表中组号来自 `docs/reviews/2026-10-16-hardcode/style-layout.md` 与 `behavior.md`。跨组只处理 arrangement 位置，共享来源由其 owner 实现。

| 盘点组 | C3 处置与来源 |
| --- | --- |
| style 3.1 | TrackRows group frame 读取 `design.shape.controlBorderWidth` |
| style 3.5 | ruler、GroupRails、minimap divider 读取 `design.editor` stroke family |
| style 3.6 | playhead、insertion、selection、marker、loop 各读对应语义线宽，不复用 grid major 宽度代替所有线 |
| style 3.7 | grid quad 打包接收 major/minor width 和 minor opacity，保留 Float32 quad 协议 stride |
| style 3.8 | NameEditor 与 ValueEditor 读取 `design.editor.inlineRadius` |
| style 5.2 | Clip ghost、时间选区读取独立 opacity |
| style 5.4、5.5 | group clip preview 与绘制范围分别读取独立 opacity |
| style 5.6 | loop shading 读取 `clipLoopShadeOpacity` |
| style 5.8 | arrangement minor grid 读取 `project.gridMinorOpacity` |
| style 6.2 | TrackIdentity 字重读取 `design.typography.weights.medium` |
| style 7.1 | marker、loop、bar、time ruler 高度读取 `layout.arrangement`，body origin、pinned viewport 与 overlay 同步 |
| style 7.2 | Clip resize、fade hit 和 automation point 使用各自 hit 几何，保留视觉 fade size 与命中尺寸的区别 |
| style 7.3 | Clip 最小宽高、inset、body threshold、fade margin 和 automation body 几何读取注入来源 |
| style 7.4 | minimap edge hit 读取几何，pan scale 读取编辑策略 |
| style 7.6 | minimap clip inset 读取 project 来源，DragPad center marker 归 C2 |
| style 8.5、8.6 | lane controller 返回语义 cursor，宿主按 `design.cursors` 映射。轨道、标尺和 minimap 状态同源 |
| 补录样式 | focus width/offset、NameEditor inset、fade stroke、六类 Clip opacity、track border 和 runtime cache 依赖已统一 |
| behavior B09 | Scene 初始工程/工作区复用 C4 project template，不留第二份 120/4/4/24/128 初值 |
| behavior B15、B16 | fit 下界、未测量 fallback、step factor 和 anchor 读取 zoom policy，保留 `width / bars` 推导 |
| behavior B20、B21 | wheel/minimap sensitivity、minimap pan scale 分别读取 policy，不合并不同语义倍率 |
| behavior B23 | 共享 pointer 偏好读取 C4 来源，删除编排局部拖动阈值副本 |
| behavior B25、B26 | follow pause、trigger 和 anchor 读取 policy |
| behavior B27 | 最大帧推进、水平与垂直速度读取 autoscroll policy。edge 继续来自 theme project metrics，并可实时更新 |
| behavior B28、B29、B30 | resize/fade/automation hit 读取几何；fade hit 7 与视觉 size 5 保持不同默认 |
| behavior B31 | freehand 采样像素分辨率读取 automation policy，不借 pointer drag threshold |
| behavior B32、B33、B34 | meter min/max、hold、fall 读取 policy，默认 -60/+6 dB、600 ms、24 dB/s 保留 |
| 已授权 text 调用 | TrackMixer、TrackMeter、toolbar、time ruler、monitor 枚举、自动化显示与解析接入 C4 formatter |

behavior B10–B14 的 `project/model/grid` 来源与全局网格默认由 C4 持有，C3 消费既有 grid plan，不另建模型。B17–B19、B22、B24 在 clip-edit、UI 或 transport。B35 是 engine telemetry floor，不由 C3 改。

C 类保留并在代码旁说明理由，包括布局原点和拉伸零值、归一化端点、音乐单位换算、IEEE 浮点比较容差、SVG viewBox、RGBA 和 quad stride、索引 sentinel、稳定协议名称与用户保存颜色。没有把算法常量机械搬成主题字段。

## 实测验证

除明确写根目录的命令，其余在 `apps/gpuix` 运行。

| 命令或入口 | 结果 |
| --- | --- |
| `bun test src/project/sections/arrangement src/app/project/live-policy.test.tsx src/shared/theme/runtime-overrides.test.tsx` | 353 pass，0 fail，53 files，654181 assertions |
| `pnpm exec tsc --noEmit` | 通过，0 diagnostics |
| 根目录 eslint，范围为 arrangement、app/project、Track locale、arrangement defaults、theme runtime test、geometry probe | 通过，0 error，0 warning |
| `bun src/project/sections/arrangement/core/verification/format-mutations.mjs` | 13/13 有效消费者失败，6 source hashes unchanged |
| `bun src/project/sections/arrangement/core/verification/policy-mutations.mjs` | 73/73，含配置零值、owner 保留、取消 preview 与 live metrics，source hashes unchanged |
| `bun src/project/sections/arrangement/core/verification/style-mutations.mjs` | 105/105，含网格缓存失效和四个 track border 旁路，27 source hashes unchanged |
| 根目录 `node scripts/gpuix-review-scan.mjs` | 197 source、92 test，0 HARD、16 WARN，逐项处置见下表 |
| `configuration-surfaces.mjs capture` | Gallery 4 与真实 native backend 业务组合 8，全部完成，命名服务退出 0 后立即释放 |
| `configuration-surfaces.mjs compare`，共享来源参考与 C3 最终结果 | 12 张 PNG 字节差 0，SHA 相等，无像素容差 |

变异共 191 项。loader 只在内存中恢复使用处的旧 literal 或旧接线，不改磁盘源码。runner 验证变异实际应用、消费者断言失败和 source hash 不变。语法、导入、超时与未执行不算通过。runner 从 app 目录启动 Bun，以加载唯一 `bunfig.toml` test preload。

测试输出含 `Context leak detected, CoreAnalytics returned false`。命令退出成功，测试未跳过，也未抑制诊断。不把该日志本身推断为 C3 进程泄漏或产品通过证据。

本机没有运行完整 `pnpm verify:gpuix`、打包或 Windows 构建。本轮未改 Rust 实现，未另跑 cargo。

## 像素证据与共享来源归因

证据根目录为 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/zoeydaw-c3-evidence.kXS67Hh6Rn`。图片和 AX 保存在仓库外。

保留三份最终对照，不覆盖开工截图。

| 目录 | 源码与用途 |
| --- | --- |
| `current-renderer-before` | detached `a4a9d11c` 原代码，链接当前相同 renderer 与依赖，使用隔离 HOME/XDG 重采 |
| `shared-source-reference` | detached C4 `277ca73c`，包含匹配的 C1/C2/C4 来源与本地化，用于区分共享来源变化和 C3 迁移 |
| `final-composition` | C3 `bf15fa9e`，已合入 C2 scanner 和 C4 Pan 修复 |

原 `a4a9d11c` 与 C3 最终比较，Gallery 四张、英文业务四张逐字节相等。中文业务的 Browser 目录名称已由 C4 本地化，协调者批准这部分有意差异。所有 Clip、网格、标尺、几何与轨道控制区为零差。矩形 `(330,56,942,419)` 覆盖编排区及轨道控制列，不含 Browser。

| 中文业务组合 | Browser 名称区域变化像素 | Browser 外变化 | 归因 |
| --- | --: | --- | --- |
| dark audio | 9533 | `(61,237)` RGB 53→52，`(52,239)` 70→71，alpha 不变 | 两个字边点在 C4 共享来源参考完全复现 |
| dark MIDI | 9533 | 同上两点 | 同上 |
| light audio | 9017 | 0 | 已批准 Browser 中文目录名称和排序 |
| light MIDI | 9017 | 0 | 同上 |

Browser 名称区域为 `[107,321) × [125,475)`。C4 中文名称改变可见排序，因而图标所在行也随名称移动，不能只按文字墨迹做掩码。两处字边变化没有加容差，也没有宣称原始全图为零。

共享来源参考与 C3 最终结果的 Gallery 四张、英文和中文业务八张全部逐字节相同。原始中文差异因此不归于 C3。C4 修复已恢复中心 `C`，没有残留 `C→中` 回归。自有两个临时 worktree 已删除，未碰现存其它 worktree。

重跑入口为根目录：

```sh
bun apps/gpuix/src/app/verification/configuration-surfaces.mjs capture <外部证据目录>
bun apps/gpuix/src/app/verification/configuration-surfaces.mjs compare <匹配共享来源参考> <迁移结果>
```

`createTestRoot` 在 finally 卸载。capture 服务仅在两个子进程完成并打印完成标记后报告 ready，再立即释放。最终两次对照 capture 分别在 14.8 s、6.4 s 内结束，共享来源参考 6.5 s，退出码均为 0。

## UI 规范第 13 节

| 检查 | 证据与未验证边界 |
| --- | --- |
| Gallery 与业务整体布局 | 四张 Gallery、八张完整业务组合，同共享来源参考全部字节差 0 |
| 跨区域对齐与居中 | 原生 bounds 验证 ruler/body/pinned viewport、轨道 resize、meter、Clip 与自动化编辑位置；默认组合零差 |
| 间距与内边距 | `design` 与 `layout` 完整来源覆盖，NameEditor inset、fade margin、minimap inset 有消费者变异 |
| 统一设计入口 | 105 个样式变异和 73 个策略变异，包含 runtime grid threshold/cache 与 track border override |
| 尺寸与紧凑感 | 默认组合与匹配来源参考不变，Live 完整编排区域截图作为密度参照，不把局部控件宽度当整体 |
| 深浅主题与中英文 | Gallery 和真实后端业务均覆盖 en/zh、dark/light；音频和 MIDI 两种编辑器 |
| 状态与键盘 | 原生事件覆盖焦点、输入提交、拖动、取消、滚动、marker 与 automation 选择；保留 K1 唯一 keyboard owner |
| 拖动、滚轮、弹层与性能 | native 行为和节点数回归通过；未测前台帧耗时、OS 实际 cursor 和整体性能，留协调者串行验收 |

早期自有后台窗口 AX 仅暴露 `zoeydaw` window 与系统按钮。该记录只证明启动，不证明业务出帧。没有用黑图、AX 数量或测试数量替代视觉验收，没有申请桌面控制。

## 产品规则 → Live 观察 → 实现 → 差异或未验证

Live 观察只读。证据为 `live.png` 与 `live.ax.txt`，没有播放、点击或修改 Live 工程。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 紧凑编排控制列 | 完整区域中轨道、routing、mixer 同行密排，右侧 Main 固定区可见 | 保留默认 304 控制列与现有轨高，配置后同一 geometry 驱动所有消费者 | 没有宣称与 Live 的绝对像素一致 |
| 监听模式 | AX 369–372、391–394、406–409 为 In/Auto/Off，Auto 选中 | 机器 enum 不翻译，短显示和朗读来自 locale map | 英文短标记保留，朗读本地化 |
| Pan 中心 | 参考图中中心为 C，协调者核对旧 PanControl/ValueEditor 后确认跨语言 C | C4 共享 formatter 恢复 C，Mixer 与自动化保留不同变体 | 未加入 C3 特例 |
| 音乐定位与循环 | AX 22–24 为 7.4.3，循环起点 9.1.1、长度 4.0.0，图中标记 9 与 13 | 音乐时间领域语义保留，ruler 度量可注入 | 没有在 Live 执行缩放或拖动来反推敏感度 |
| 偏好变化不改工程 | 观察期间只读，无 Live 配置 API 实测 | 真实 native backend 回归证明 preview 取消、document 不变、无 undo | 新 Theme API 属本项目，不声称 Live 有同接口 |

## 自审结果

审查固定点为 `a4a9d11c`。完整命令为 `git diff a4a9d11c...HEAD`，并检查 integration working-tree delta。Spec 由独立 `pstack-reviewer` 审查，修复后由同一 reviewer 复核。首个 Standards lane 停在 skill 加载，未产出代码审查，取消后由独立 `reviewer` 完成 `a4a9d11c...943819c7` 的 Standards 审查。两个 reviewer 均只读，未运行检查或编辑。

主要 C3 实现提交为 `3f9f48f4`、`94bd85bd`、`8e8a2d63`、`652b44f2`、`ede44776`、`19267de5`、`5abd043c`。两项 Spec 修复分别为 `41a10e6a` 和 `bbffff08`。`943819c7` 删除已被 monitor maps 替代的无消费者文案键。共享合入包含 `57c4da32`、`031e3546`、`bf15fa9e`。完整列表由 `git log --first-parent --oneline a4a9d11c..HEAD` 生成。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| project metrics 改变重建 owner，丢失选择 | 必修 | metrics 使用稳定 live 来源，取消手势但保留 composition，独立 Spec reviewer 复核关闭 | 三字段真实 hook/native 回归，八个生命周期退化变异 |
| 显式 layout border 未贯通 Row/resize/meter | 必修 | 三处统一解析后 geometry，独立 Spec reviewer 复核关闭 | border 6 原生 bounds、四个旧来源变异 |
| gridMinSubdivisionWidth 更新不失效 lane cache | 必修 | 纳入缓存依赖，删除合并产生的重复 geometry 条件 | native 网格移除/恢复，旧缓存判断变异失败 |
| Row focus 变异最初存活 | 必修 | 原断言命中同 testId 的 TrackRows 外层；补 direct TrackRow 与 lane 断言 | 两个 focus 变异现失败 |
| mutation runner 缺 app test preload | 必修 | 使用 app cwd，统一创建配置前提 | baseline 原因定位，191 个变异通过 |
| 中央 Icon 原生宿主被 scanner 误报 | 汇报仲裁 | C2 在主干精确修复，C3 合入，不改真实手写 SVG 规则 | 最终 HARD 0 |
| C4 Pan 中心被翻译为中 | 汇报仲裁 | C4 修来源，C3 只消费，已合入 `277ca73c` | 最新十二图对照与 formatter 回归 |
| C4 parsePan 未解析自定义 separator | 汇报仲裁 | C4 修 parser，C3 不复制解析逻辑 | `277ca73c`，自动化原生 formatter 回归 |
| 早期 monitorIn/Auto/Off 与最终 map 来源重复 | 必修 | 删除三个接口键和六个双语数据项，保留唯一 monitor maps | LSP、翻译键检查无消费者；删除后 13 个格式变异和 tsc 通过 |
| 既有 large native controller test | 记录 | 共享单一真实编辑夹具，当前未越 1000 行硬线；未按前后半拆文件 | 功能按手势已有分组 |
| Standards 审查 | 通过 | 必修 0、共享仲裁 0、无新增可行动 smell | `C3StandardsRetry`，覆盖策略类型、稀疏解析、生命周期、注入方向与真实 native 回归 |

### Scanner WARN 逐项处置

这些 WARN 没有 arrangement 产品代码项。验证画布固定值不属于用户主题配置。纯 fixture 不读取 React context。

| 路径 | WARN | 处置 |
| --- | --- | --- |
| `app/locales/browser-catalog.ts` | 663 lines | C4 的集中 locale 数据，记录并交共享 owner，不在 C3 拆分 |
| `app/verification/clip-edit/audio-render-cost.tsx` | 4 px literals | 固定离屏性能验证画布，C 类，记录 |
| `app/verification/clip-edit/consumer-probe.tsx` | 2 | 固定原生消费者验证画布，记录 |
| `app/verification/clip-edit/demo/index.tsx` | 2 | 固定 demo 验证窗口，记录 |
| `app/verification/design-surfaces.tsx` | 6 | 固定组合验证尺寸，不是产品默认，记录 |
| `app/verification/footer/demo.tsx` | 2 | 固定验证窗口，记录 |
| `app/verification/footer/measure.tsx` | 6 | 测量夹具输入尺寸，记录 |
| `app/verification/footer/states.tsx` | 8 | 状态矩阵固定画布，记录 |
| `app/verification/lane/demo.tsx` | 2 | 固定验证窗口，记录 |
| `app/verification/timeline/layout-smoke.tsx` | 2 | 固定原生 smoke 画布，记录 |
| `app/verification/tracks/appearance-smoke.tsx` | 2 | 固定外观验证视口，记录 |
| `app/verification/tracks/demo.tsx` | 2 | 固定独立验证窗口，记录 |
| `app/verification/tracks/render-cost.tsx` | 2 | 固定性能测量画布，记录 |
| `gallery/states.tsx` | height 210 | C2 已批准的 Gallery 夹具，记录 |
| `project/adapters/fixtures.ts` | color literals | C4 纯测试 fixture 调色板，不是产品组件旁路，记录 |
| `project/defaults/template.ts` | paddingBars 16 | 单位为小节的 canonical 初值，不是 CSS 像素，记录 |

## 错题

- 只把几何值接入一个消费者，显式 layout 覆盖仍会产生两套 border。原生回归必须同时检查 Row、resize 与 meter。
- 把配置数值写进 effect 依赖会重建长期 owner。配置变化应更新同一受控来源并取消活动手势。
- wrapper 与内部组件可有同 testId。断言命中 wrapper 时，内部变异会存活；直接渲染被测消费者并检查实际结果。
- 以 core 为 cwd 启动 Bun 会漏掉 app `bunfig.toml` preload，创建事务前提不完整。不要靠测试顺序补全配置。
- `grab` 字符串锚点会同时命中 `grabbing`，格式化也会改变跨行锚点。变异必须验证唯一锚点、实际应用和消费者失败。
- 原始截图与更新共享来源后的截图不能直接全图归因。保留原图，重采原 SHA，并另用匹配共享来源的独立参考区分文案与迁移。
- Orca check 重播未 ack 的 delivery。处理完整 batch 后 ack，否则新通知被旧批次挡住。

## 已验证做法

- 用真实 hook、native backend、实际控制器手势证明 owner、选择、取消和事务行为，不 mock hook 返回值。
- 用消费者 bounds、paint 和输入提交证明来源联动，不测源码文本，也不测 props 转发。
- 变异在 loader 内存中执行，原文件 hashes 校验不变，避免与其它会话共享 stash。
- 同当前 renderer 的自有 detached 参考隔离 HOME/XDG，验证后立刻删临时 worktree。
- Gallery 与业务组合少量整图比较。可比较的最终参考严格字节差 0，不加 ±1 容差。
- 所有 capture 使用命名 service，等 finally 清理完成后释放，不保留后台窗口。

## 进程清理

本轮所有自有 named capture 服务均已释放。两个临时 worktree 与复制的验证入口已删除，没有停止其它会话的进程。

最终运行 `ps -axo pid,etime,command`，对完整输出用 `bun .*--hot|cargo run|gallery|demo` 过滤。实测输出为 `No matches found`。进程证据为 `artifact://325`，过滤没有匹配残留窗口或 demo。
