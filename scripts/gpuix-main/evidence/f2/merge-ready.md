# F2 原生 context-menu 交付

2026-10-15。基线同步到 `e76dd6b`，实现提交 `26fc039`。独立 vendor 为 `/Volumes/PSSD/code/_vendor/f2-gpuix/6a5c7c142ac32f9eb0caefe0121be995cfc18631`，Cargo target 为 `/Volumes/PSSD/code/_vendor/target-f2`。补丁顺序为 H1 后接 F2，最终八补丁构建通过。没有改共享 vendor、zed、消费方控件或工程逻辑，没有新增依赖，没有 push。

原生能力完成。完整应用测试仍有且仅有一个失败：`secondary click on an interactive title opens its track context menu`。`ContextMenuTrigger` 尚未改用 `onContextMenu`，接入归 A3b。协调者明确批准先合入 F2，再重建 vendor、通知 A3b，并在 A3b 合入时重跑该用例作为最终集成验收。本报告不声称全套全绿。

## A3b 端口交接

`HostProps.onContextMenu?: (event: EventPayload) => void` 已通过 native host 类型传入 `@gpuix/react` 的 `Props`。用于 `<div>`、`<text>`。右键按下时选择包含鼠标点的最近声明作用域，只通知一次；重叠的独立作用域选择 GPUI 绘制顺序最前者。交互后代不会阻断通知，后续兄弟和 deferred anchored 遮挡仍阻断。先发送既有 descendant `mouseDown`、`mouseDownOutside`，再发送 `contextMenu`；不停止原传播。

payload 为 `elementId`、`eventType="contextMenu"`、窗口坐标 `x/y`、`button=2`、`clickCount`、`isRightClick=true`、`modifiers`。键盘字段不填。macOS 已由 GPUI 把 ctrl-left 归一化为 Right，并清掉 control，消费方不要再加 ctrl 分支。将现有 ContextMenu 的右键入口改用此 prop，并复用现有弹层定位与键盘策略。完整机制与上游 PR 草稿见 [研究记录](../../../../docs/research/gpuix-main-build.md#f2-原生-contextmenu)。

最小用法，在应用已有的 `ThemeProvider` 内运行：

```tsx
import { useState } from "react"
import type { EventPayload } from "@gpuix/react"
import { Button } from "@/ui/controls/Button"

function ContextScopeExample() {
  const [context, setContext] = useState<EventPayload | null>(null)
  return (
    <div onContextMenu={setContext}>
      <Button>Child action</Button>
      <text>{`${context?.x}, ${context?.y}`}</text>
    </div>
  )
}
```

## 实跑命令

| 位置与命令 | 结果 | 证据 |
| --- | --- | --- |
| 根 `GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f2-gpuix CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f2 bash scripts/gpuix-main/build.sh` | 八补丁构建及 source/output manifest 校验通过。最终 native 增量构建 15.63s | 自建日志在 vendor 根 `build-reproduce.log` |
| vendor `CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f2 CARGO_BUILD_JOBS=6 cargo check --release --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders` | 通过，保留上游既有 warnings | `renderer-cargo-gates.txt` |
| vendor 同 feature 的 `cargo test --release --manifest-path packages/native/Cargo.toml --lib` | 281 pass，包含 F2 七项 GPUI 回归 | `renderer-cargo-gates.txt` |
| 根 `pnpm native:build` | H1 合入后重新构建真实 `@zoeydaw/native` 成功 | 本次命令退出 0 |
| 根 `cargo check && cargo test` | 通过，49 tests，4 suites | `workspace-rust-gates.txt` |
| `apps/gpuix` 下 `pnpm exec tsc --noEmit && bun test` | tsc 通过；bun 825 pass、1 todo、1 fail，唯一失败为上面的 A3b 接入用例 | `application-gates.txt` |
| 根 `apps/gpuix/node_modules/.bin/tsc --noEmit -p scripts/gpuix-main/context-menu/tsconfig.json` | 通过，使用应用固定的 TypeScript 5.9.3 | 本次命令退出 0 |
| 根 `bun test scripts/gpuix-main/context-menu/context-menu.test.tsx` | 8 pass，0 fail。真实 Button、DragPadNumber、最近作用域、primary click、遮挡、隐藏及监听移除、hover/scroll、捕获后重绘 | `passing-after.txt` |
| 根 `node scripts/gpuix-main/check.mjs --resolution` | native、host、React 解析到同一 F2 vendor，八补丁与新增 mutations 产物校验通过 | 本次命令退出 0 |
| 根 `node scripts/gpuix-review-scan.mjs` | 0 hard，0 warn。0 app source、1 test；扫描不覆盖补丁中的 vendor Rust | `review-scan.txt` |
| source commit 的 Ultracite pre-commit | 通过，无 `--no-verify` | `26fc039` 的提交过程 |
| 命名 service `bun --hot demo.tsx` | 真窗口取证完成，启动时设 UTC 截止退出，取证后主动关闭。临时 probe 已删除 | `native-window-events.txt`、下方截图与 AX |

首次 cargo 门禁误用了 `.gpuix-main/packages/native/Cargo.toml` 符号链接路径，Cargo 将它解释成本仓 workspace 成员而拒绝执行。之后从 vendor 的真实路径运行，上表两个 vendor 命令均通过，没有为此修改 Cargo 配置。

运行 TS 入口前需要本地依赖链接，链接已存在时不重复创建：

```sh
ln -s ../../../apps/gpuix/node_modules scripts/gpuix-main/context-menu/node_modules
apps/gpuix/node_modules/.bin/tsc --noEmit -p scripts/gpuix-main/context-menu/tsconfig.json
bun test scripts/gpuix-main/context-menu/context-menu.test.tsx
```

`node_modules` 链接不提交。没有安装第二份 React 或新增包。根目录直接 `pnpm exec tsc` 会找到不同的工具版本，因此该入口明确使用应用的 5.9.3 binary。

## 失败前与变异

补丁前的真实 Button 只收到 `down:2`，祖先没有 context 通知；数值控件和内层作用域也没有通知。原始最小套件 1 pass、3 fail，见 `failing-before.txt`。补丁后扩展到八个行为测试，见 `passing-after.txt`。

| 变异 | 被抓住的行为 | 结果与证据 |
| --- | --- | --- |
| probe 提前到 child prepaint 之前 | Button 的 BlockMouseExceptScroll、数值控件的 BlockMouse | 两项原生回归失败，均只剩 mouseDown，`mutation-descendants.txt` |
| 作用域 registry 去掉反向选择 | 最近作用域 | 发送 `[10,10]` 而非 `[20,20]`，`mutation-nearest.txt` |
| Right 过滤改成 Left | 左键不能触发 | primary click 回归发现 context owner 10，`mutation-primary.txt` |
| probe bounds 错用整窗口 | bounds 外不能触发 | outside 回归发现 owner 10，`mutation-bounds.txt` |
| 只按 bounds，不检查 GPUI 遮挡和 content mask | deferred anchored 遮挡、祖先裁切 | 两个回归失败，其余五项通过，`mutation-occlusion-mask.txt` |
| 更改生成的 `dist/mutations.js` 一个字节 | 事件名映射产物完整性 | `check.mjs --resolution` 拒绝旧 manifest，`mutation-generated-map.txt`。恢复后通过 |

所有变异均已恢复。最终 vendor source 精确匹配八补丁，完整原生套件通过。没有 skip、删除或放宽 tracks 的失败断言。

## 真实窗口及 UI 规范第 13 节

F2 没有新增产品控件或修改共享样式，验收对象是原生事件能力。示例复用已经合入的 Button、DragPadNumber；界面布局不作为新的产品 UI 交付。

| 检查 | 结论与证据 |
| --- | --- |
| 每个控件与状态放大图 | 已检查示例的默认、鼠标聚焦、右键、内层作用域、遮挡和明暗主题。`controls-dark-zoom.png`、`controls-light-zoom.png`；完整图为 `button-right-dark.png`、`inner-and-control-dark.png`、`button-number-light.png`、`occluded-dark.png`。未修改 disabled、pressed 等其它视觉状态，不声称重新验收整套画廊 |
| 间距 token | AX 三个控件 y 为 442、462、482，高均 13，垂直 gap=7，与示例使用的 `project.panelGap=7` 一致。未改产品间距 |
| 文字、数值、图标居中 | 放大图显示既有 Button 和数值内容未新增裁切。F2 不改文字、图标或数值排版 |
| 尺寸 | Button 为 186×13，数值为 34×13，inner Button 为 186×13。高度等于 `CONTROL_METRICS.default["--spacing-control-track"]=13`，字号 token 为 9。没有新增图标控件 |
| 紧凑感与 Live 对照 | 未新增产品布局，未操作用户的 Live。对照已合入的紧凑共享控件及上述 token，不把临时探针容器当成产品密度验收 |
| 深浅及中英文 | 深浅截图均包含中英标签，取证时只切换探针 ThemeProvider，未改系统外观。没有修改语言切换或 i18n 行为 |
| 键盘与焦点 | Tab 从 Button 到数值控件，Space 后值仍为 120、Contexts 仍为 5。`native-keyboard.ax.txt`。专用菜单键继续由 A3b 的原键盘路径处理，F2 不接键事件 |
| 动态交互与弹层 | 右键 Button 后 Contexts 0→1，数值右键 1→2 且值 120，inner 2→3 只报 inner，ctrl-left 3→4 报 button=2、ctrl=false；遮挡时保持 4；light 下 primary 点击只增加 clicks，随后数值右键 4→5。`native-right-click.ax.txt`、`occluded-dark.ax.txt`、`native-light.ax.txt`、`native-window-events.txt`。实际菜单视觉与其内部拖动归 A3b，未宣称已接入 |
| 性能与可见范围裁剪 | 无新增 LayoutId；probe 使用 Normal hitbox，不更改原 hitbox 资格。未改虚拟列表裁剪、帧调度或动画，未做性能基准，不作帧率声明。content mask 与捕获后重绘由行为回归覆盖 |

ctrl-click 的后台修改键输入被 computer 明确拒绝后，才对同一自启窗口重试 `takeover:true`；随后 AX 及真实 payload 证明正确归一化。没有操作其它窗口。

## 自审结果

独立 `pstack-reviewer` 子代理 `F2Review` 完成 Standards 与 Spec 两轴审查。Standards 0 项，Spec 首轮 1 项 P2 必修，恢复完整证据后经同一 reviewer 只读复核确认关闭。最终没有未关闭发现，没有新增代码或行为缺陷。审查及复核原文见 `independent-review.txt`。

审查使用的提交列表为 `26fc039 feat(renderer): notify the nearest native context-menu scope`，基线 `e76dd6b`。完整变更可用以下命令复核：

```sh
git diff e76dd6b...HEAD -- eslint.config.js scripts/gpuix-main docs/research/gpuix-main-build.md
git log --oneline e76dd6b..HEAD
```

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| 必须扫描 | 记录 | 0 hard、0 warn；vendor Rust 另由独立审查覆盖，未把 app-only 扫描当作 native 审查 | `review-scan.txt` |
| 测试 callback 返回 Array.push 的数字违反既有 lint | 必修 | AST 改为 void block，8 tests 与类型检查通过，pre-commit 通过 | `26fc039` |
| scripts 测试的依赖 owner 被 ESLint 误判为 root | 汇报仲裁 | 协调者批准精确 test glob 的 packageDir 使用 root 和 apps/gpuix；规则仍为 error，无新增依赖；ReactNode 改用 Props["children"] | `eslint.config.js`、`26fc039` |
| 事件名映射生成文件原本未进入 manifest | 必修 | 将 `mutations.js`、`.d.ts` 纳入 SHA-256，变异确认拒绝陈旧文件 | `check.mjs`、`mutation-generated-map.txt` |
| 唯一 tracks 失败属于消费方未接入 | 汇报仲裁 | 协调者批准先合 F2，A3b 接入后协调者重跑最终验收 | `application-gates.txt`、本报告开头的集成边界 |
| 原生门禁日志保存时只取了前 300 行，报告无法复核 281 pass | 必修 | 从已完成运行的 artifact 精确分页恢复全部日志，补上实际命令；确认含 check 完成、七项回归和 281 passed 汇总。不重跑门禁 | `independent-review.txt`、恢复后的 `renderer-cargo-gates.txt` |
| 研究记录原本已达 934 行 | 记录 | 最小用法和完整命令留在本报告，研究记录保留契约与 PR 草稿，未从低于 1000 行推过 1000 行 | `docs/research/gpuix-main-build.md` |

## 进程清理

自有 service 只有 `f2-context-menu-verification`，pid 65636。取证后立即关闭，当时运行 2m51s。没有启动或停止用户已有应用，未保留临时 demo。

实际运行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

stdout 为空，grep 返回 1 表示无匹配。原始输出见 `process-cleanup.txt`。
