# 统一配置契约

2026-10-16 用户要求：主题、多语言、样式布局、行为默认值都要从统一入口来，业务代码不写死。盘点见 `docs/reviews/2026-10-16-hardcode/`（样式布局 60 组、文案 33 组、行为 59 组，各附位置与归类）。

## 五个来源

每个可变值只属于下面一个来源。业务代码只经各自的读取入口取值，不 import 数据文件，不写字面量。

| 来源 | 放什么 | 数据位置 | 读取入口 | 谁能改 |
| --- | --- | --- | --- | --- |
| **主题 Theme** | 颜色与混色配方、透明度状态、边框与线宽、圆角、间距、字体族/字重/字号、图标尺寸、动效时长与缓动、阴影 | `shared/theme`：预设数据、`design-tokens.ts`、`metrics/control-metrics.json` | `useTheme()` | 主题预设；以后用户导入主题 |
| **布局 Layout** | 面板默认/最小/最大尺寸、轨道与标尺高度、浏览器列宽、编辑器几何、首页内容宽、浮层偏移 | `shared/theme` 下的 `layout` 分组（与 design 同级，可由 provider 覆盖） | `useTheme().layout` | 主题/密度预设；用户调整的面板尺寸另存工作区 |
| **文案 Text** | 所有用户可见文字、aria 名称、错误与状态消息、默认名称、单位与数值/时间格式 | `app/locales/**`（中英双语） | 组合根注入 `labels`；共享组件不带英文默认值 | 语言设置 |
| **行为默认 Defaults** | 新工程/轨道/片段初值、网格与缩放上下限、手势阈值、滚轮灵敏度、电平显示范围与衰减、MIDI 默认、历史容量、窗口默认尺寸、目录根 | `project/defaults`（工程模板与编辑策略）、`platform/settings`（用户偏好） | 工程模板函数；`usePreference(key)` | 工程模板；用户偏好设置 |
| **快捷键 Keymap** | 所有键位与命令绑定 | `platform/keyboard` keymap 数据（K1） | 命令注册表 | 以后用户 keymap |

用户偏好（设置窗口能改的东西）只经 `platform/settings`，Rust 侧 `crates/native/src/settings.rs` 与 TS 侧类型共用一份 schema，带版本号与迁移。

## 规则

1. 业务与共享组件里出现颜色、尺寸、时长、透明度、字号字面量，视为违反本契约。允许的例外只有下面的“真正常量”。
2. 共享组件不内置英文默认文案；文字一律由调用方经 `labels`/`children`/aria props 注入。
3. 同一个值在多处出现，只能有一个来源；派生关系（例如“控件高度的一半”）写在来源里，不在使用处乘倍数。
4. 主题 provider 能在运行时覆盖 `colors`、`design`、`layout`、`control`、`transportControl`、`project` 全部分组；每个 prop 接受完整对象，不做 partial 合并。`colors` 使用包含全部派生语义角色的 `Theme["colors"]`，传入后直接采用；省略时仍按 preset/scheme 与配方缓存或派生。其余分组省略时使用集中默认值；省略 `layout` 时由当前 `control`、`project` 经 `createLayoutTokens()` 解析几何。Provider 不持有第二份可写配置，调用方以新对象替换受控值，不原地修改。
5. 工程模板（新工程的初值）与持久化的工程值分开：模板改了不影响已保存的工程。

## 真正常量（留在代码）

协议与 schema 版本、数学常量、音频 DSP 公式、protocol 上限（帧格式、遥测缓冲容量）、测试夹具尺寸、验证脚本里的离屏视口。每处在代码旁用一句话说明为什么是常量。

## 运行时主题与纯几何接口

- `shared/theme/design-tokens.ts` 的 `DEFAULT_DESIGN_TOKENS` 组合控件形状、字体字重、状态、指针、动效、浮层、空态、通知几何与 `colorRecipes`；明暗混色、语义别名及 MIDI 力度配方由 `color-recipes.ts` 定义。配方只经 `Theme.design.colorRecipes` 传给使用者。
- `presets.data.ts` 的完整语义 palette 包含 `success`、`arrangementClipSelected`、`arrangementClipPaper`。预设可分别覆盖；未声明时由该文件集中填入默认语义色。`getThemePreset().baseColors` 是派生输入，`colors` 是默认配方的缓存结果；Provider 覆盖配方时重新派生，不改写预设。
- `shared/theme/layout-tokens.ts` 的 `LayoutTokens` 拥有 `project.panels`、`home`、`track` 与 `arrangement`（标尺、Clip、命中几何）。窗口初始尺寸属于用户偏好，由 settings 迁移维护，不在布局与设置各存一份。
- 轨道控制列总宽只有 `layout.track.controlsWidth` 一份来源，`project` 不保留同义总宽。identity/routing 子列仍取 project，Mixer 的剩余宽度由总宽减两个子列宽派生；core viewport、整行与 resize 外框读取相同的解析几何，原生回归核对三列之和。非轨道组件暂借该总宽的旧行为由 C2 迁到各自语义来源，不恢复旧字段或兼容别名。
- 应用组合根把 `theme.layout` 注入 `createSceneStore(geometry)`，并在运行时调用 `setGeometry(geometry)`；`ArrangementScene.geometry` 只保存这份只读引用。纯 core 从 scene 获取几何；以 tracks/viewport 为输入的纯函数显式接受解析后的 `TrackGeometry`，不读取 JSON 或 React context。
- `trackHeight(track, geometry)`、`trackControlRows(track, geometry)`、`resizeTrackHeight(track, deltaY, geometry)` 不再提供静态默认参数或旧常量导出。行与 Clip 投影携带同一 `trackGeometry` 引用，使绘制、命中、滚动与 resize 共用度量；几何切换不重写已保存的 `heightPx`。
- 新建轨道/分组的 `heightPx` 由 UI 组合调用方注入编辑命令；adapter 不再导入静态 theme 度量。业务来源接线由各拥有切片完成，不把“字段已存在”称为“所有调用已迁移”。

## 门禁

review scan 与 lint 增加规则：产品代码（排除 tests、verification、demo、gallery、locales、主题数据文件本身）出现颜色字面量、样式数值字面量、JSX 文本或 aria 英文字面量即 HARD。规则落地前，各迁移切片自查。
