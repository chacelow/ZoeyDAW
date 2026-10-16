# 2026-10-16 与 Zed 对比

对照对象是 vendor 里固定版本的 Zed（`.gpuix-main/zed`）。三路只读对比，分片报告每条都附双方 `path:line`：[输入与焦点](input.md)、[UI 与渲染](ui.md)、[工程流程](engineering.md)。我们经 React → gpuix 原生宿主渲染，Zed 的 Rust 级 API（`Styled`、`cx.notify`、`uniform_list` 闭包、`#[gpui::test]`）不能直接拿来用；下表只列能迁移的做法。

## Zed 做得好、我们做得不好

| 方面 | Zed | 我们 | 影响 | 可迁移做法 |
| --- | --- | --- | --- | --- |
| 命令与快捷键 | 具名 action 加声明式 keymap（JSON），快捷键与命令分离 | 快捷键写死在各 keyboard controller 的 if 分支里 | 加快捷键要改业务代码；无法给用户重绑定 | 建一个命令注册表（id、标题、处理函数）和一份 keymap 数据，controller 只做分发 |
| 键位上下文 | key context 谓词（`Editor && mode == full`）决定哪个绑定生效 | 靠 text lease、keystrokeId、if 顺序推断目标 | ARR-04（Clip 编辑区 Cmd+S 被吞）这类问题会反复出现 | keymap 绑定带上下文条件，由焦点链算出当前上下文 |
| 事件消费 | action 处理后默认停止传播，放行要显式写 | 控件要手动 preventDefault/stopPropagation，漏一处就冒泡 | UPA-05/06/07 三个控件都漏过，各修了一次 | 共享键处理 helper 默认消费，未处理才返回放行 |
| 命令发现 | 命令面板与菜单、快捷键提示共用同一数据源 | 快捷键提示是各处独立字符串 | 提示与实际行为会漂移 | 命令注册表同时驱动菜单项、提示文本和以后的命令面板 |
| 列表虚拟化 | `uniform_list` / `list` 是现成元素，业务直接用 | 原生已有 `<virtual-list>`，但 React 层没有通用封装，业务各自做窗口化 | lane、Browser、MIDI 各写一套可见范围计算 | 在 `ui/` 提供一个虚拟列表组件，复用原生 `<virtual-list>` |
| 组件预览 | 组件注册进预览系统，可搜索、按组件看全部状态 | Gallery 是手写示例页 | 新控件的状态覆盖靠自觉 | Gallery 改为注册制，每个控件导出自己的状态示例 |
| 更新粒度 | entity 级 `cx.notify`，视图缓存 | lane 订阅整个 scene，靠 memo 挡 | 大工程下 React 重算多 | 按切片缩小 selector，并分清 React memo 与原生缓存 |
| 帧诊断 | 失效、绘制、呈现、输入延迟成链路 | runner 测得到绘制和上传，缺输入到上屏的完整链路 | F7 这类问题要靠前台手测才发现 | 在 window-profile 里接上输入时间戳与 present 序号 |
| 确定性测试 | 确定性执行器、随机种子、模拟时间 | 部分组合测试用固定 sleep，异步完成条件不统一 | 不稳定测试与超时（AppShell 5s） | 统一用受控帧源推进时间，等具体状态而不是等时间 |
| 测试环境与真实桌面分层 | 测试平台完全离屏，尺寸不受屏幕限制 | `createTestRoot` 建的原生窗口会被屏幕夹尺寸 | GitHub CI 上 1800 宽窗口变 1024，6 个测试失败 | 在 vendor 里让测试窗口不按屏幕可见区域夹取（TD-10 正在查） |
| CI 分层 | 静态检查、clippy、测试分 job 并行，按改动范围跳过 | 一个 job 先构建 renderer 和 native，再跑所有检查 | 文档错误也要等 8 分钟构建 | 拆出不需要 native 的快检查 job，Rust 的 test/clippy/fmt 进门禁 |
| 设置契约 | 默认值 JSON、schema、用户/项目分层、版本迁移 | Rust 与 TS 各定义一份设置类型，修复靠零散 repair | 字段漂移、迁移不可见 | 设置 schema 单一来源，生成 Rust/TS 类型，迁移按版本号执行 |
| 依赖治理 | license 与依赖检查进 CI | 没有 | 引入新依赖无人把关许可证 | 加 cargo-deny 与 npm license 检查 |

## 我们不差或更好

- 真实原生渲染的 UI 测试：测试经真实 native renderer 布局与绘制，Zed 的测试平台大多跳过真实绘制。
- 变异检查：每个修复都要求“还原修复时测试失败”，Zed 没有这层约束。
- 构建身份：补丁序列、产物清单逐文件校验，命中时只建链接。
- 设计 token：圆角、间距、数值字体由共享 token 拥有并有覆盖测试。
- 后台窗口与真实桌面证据的边界写得清楚。
- DAW 特有的输入状态（按住 B 临时绘制、MIDI noteOn/noteOff、epoch 变化释放）有明确 owner。

## 建议顺序

1. 命令注册表加 keymap 数据加默认消费：一次解决三类键盘问题，后面加快捷键不再改业务分支。
2. 测试窗口不受屏幕夹取（TD-10 进行中），加上 CI 快检查分流与 Rust 门禁。
3. 通用虚拟列表组件与 Gallery 注册制。
4. 设置 schema 单一来源与版本迁移。
5. 帧链路诊断、依赖与 license 检查。
