# zoeydaw

Web-UI DAW。音频核心、插件 host、Mixer 用 Rust，前端走 Tauri 2 + React。

当前阶段：**Web 交互原型**。已有首页、单项目面板、参考 Ableton Live 的 Browser 与编排时间线。编排使用 adapter 提供的模拟轨道、音频波形、MIDI 与 Pattern 数据，支持总览导航、轨道分组、片段编辑、自动化曲线和模拟播放电平。本地快照保存到浏览器 localStorage，不是音频工程文件。没有接入文件系统、插件扫描或音频引擎。

## 开发

```bash
pnpm install
pnpm --filter @zoeydaw/web dev     # 只跑 web
pnpm tauri:dev                     # 带原生壳
```

需要 Node ≥22、pnpm 10、Rust ≥1.77、Tauri 2 平台依赖。

## 结构

```
apps/web/           React 前端（Vite + Tailwind v4）
packages/ui         共享 UI 组件库（shadcn 风格 + Storybook）
packages/i18n       zh-CN / en-US i18n
packages/logger     浏览器 / Node 彩色日志
packages/shared     跨包 zod schema / 类型
src-tauri/          Tauri 2 Rust 外壳（原子写文件 + 日志 + 自更新 + 托盘）
```

Web 源码使用 `@/` 指向 `apps/web/src`，跨越两层及以上目录的导入由 ESLint 限制；组件内部保留 `./` 和 `../`。共享 UI 使用 package-private `#lib/*`、`#components/*` 等现有别名，不能复用 Web 的 `@/`，避免不同 workspace 的解析冲突。

## 编排与状态结构

- `apps/web/src/pages/project/sections/ArrangementPanel` 由 Timeline 组装 Toolbar、Viewport、TrackHeaderViewport 和独立 painter 生命周期。`canvas/interactions` 分开 Clip、标尺和 Automation 输入；`Clip/Detail` 分开 Audio、MIDI 和 Pattern 编辑器。
- `apps/web/src/pages/project/model` 定义工程类型、领域操作与版本化快照边界。
- `apps/web/src/pages/project/stores` 将工程文档、视图工作区和临时会话组合成一个项目 store。
- `apps/web/src/pages/project/adapters` 是界面的数据与命令入口，负责演示数据、模拟时钟和本地快照。后续 Rust 接入替换这一边界，不在页面内分散调用原生指令。
- `packages/ui/src/controls` 提供共享数字编辑、拖动调整、下拉、开关、图标槽位和尺寸 token。音量推子、电平表及声像组件也由 UI 包导出。

保存内容包括音乐数据、轨道路由和视图偏好，自适应网格保存模式与密度，不保存随缩放派生的格值。播放、录制、插入光标、播放头、选区、即时电平、按下的 MIDI 音符和撤销历史不进入快照。详细边界见 [Store 结构](apps/web/src/pages/project/stores/README.md) 与 [Adapter 结构](apps/web/src/pages/project/adapters/README.md)。

编排中 `A` 切换自动化，轻按 `B` 切换绘制，按住 `B` 拖画时临时切换。绘制作用于自动化和 MIDI 音符，不拖画 Arrangement 卡片。`M` 切换电脑 MIDI 键盘。Ctrl/Cmd+1、+2 调整自适应网格密度；网格按缩放保持可见格宽，最细到 `1/16384`。Ctrl/Cmd+E 分割选中 Clip。空格统一从插入点播放或停止，不激活已聚焦按钮；文字输入保留正常空格。`Home` 回到起点。Follow 开启后，播放线到编排 Canvas 中线即保持居中，轨道内容连续滚动；右侧操作栏不计入中线宽度。

时间线正文和空白轨道使用默认箭头，Clip 实色标题悬停显示抓手，下半部透明透出网格。点击正文或空白轨道建立轨道内插入光标，拖动选择时间；不会同时高亮右侧操作栏。右侧表头只高亮名称身份区，不加选中边框，也不改变路由和混音控件。卡片操作不展开底部编辑器，重命名在标题内进行，右键临时编辑器只用于原型验证。普通轨道折叠后不绘制正文或淡变控件。Group 折叠同时收起自身和后代，保留摘要与首行控件。

## 下一步

音频引擎 / CLAP + VST3 host / 工程持久化 / Ableton `.als` 导入都放在后续迭代，按界面需求再立 crate。

License: Apache-2.0。
