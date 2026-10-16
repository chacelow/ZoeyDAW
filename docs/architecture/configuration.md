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
4. 主题 provider 必须能在运行时覆盖 `design`、`layout`、`control`、`project` 全部分组，不能有只读静态 JSON 绕过 context 的路径（现状 `ThemeProvider.tsx` 只允许覆盖 `design`，`project/layout/track.ts` 直接读 JSON）。
5. 工程模板（新工程的初值）与持久化的工程值分开：模板改了不影响已保存的工程。

## 真正常量（留在代码）

协议与 schema 版本、数学常量、音频 DSP 公式、protocol 上限（帧格式、遥测缓冲容量）、测试夹具尺寸、验证脚本里的离屏视口。每处在代码旁用一句话说明为什么是常量。

## 门禁

review scan 与 lint 增加规则：产品代码（排除 tests、verification、demo、gallery、locales、主题数据文件本身）出现颜色字面量、样式数值字面量、JSX 文本或 aria 英文字面量即 HARD。规则落地前，各迁移切片自查。
