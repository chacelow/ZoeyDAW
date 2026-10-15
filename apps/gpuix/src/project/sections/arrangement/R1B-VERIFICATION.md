# R1b 架构修复验收

2026-10-16。范围为 `arrangement/**` 与 Arrangement 组合契约。工作分支 `chacelow/gpuix-r1b-arrangement`，起点 `a04be5a`。规格历史基线 `d0db74c` 之后已有大量合入，本轮审查只比较 `a04be5a...HEAD`。

## 实现

| 规格 | 改动 | 证据 |
| --- | --- | --- |
| lane 时间选区预览不被 timeline 全量同步覆盖 | SceneStore 保留 committed 输入，`setTimeSelectionPreview` 单独管理 lane 暂态，`timeSelection` 优先显示预览；取消清除预览，释放先提交再清除 | `lane/interactions/controller.test.tsx` 的 `keeps a live time-range preview` |
| 折叠 Group 不重复扣 `controlsWidth`，只保留 lane 摘要 | 删除 `tracks/GroupOverview`，TrackRow 始终挂载可见 lane；删掉不再使用的 viewport、descendants 入参和摘要标签 | `tracks/Row/group-lane.test.tsx` 检查 800px 与 200px 时间视口最右侧 20px 的摘要 |
| ruler 不镜像写工程投影 | 删除原 `rulers/controller.ts` 第 36、98、123、136 行四处写入；独立 ruler fixture 改用正式 TimelineController | ruler、timeline 与组合行为测试保持通过 |
| 网格 quad 打包唯一实现 | `core/rulers/grid-quads.packGridQuads` 统一半开范围裁剪、局部坐标与分批；普通细线共用 `MINOR_GRID_OPACITY = 0.55`；Clip uniform 分批不改变线宽 | 纯几何边界测试及原生 div 像素 oracle |
| edge auto-scroll 纯计算唯一实现 | `core/viewport/edge-scroll.edgeScroll` 共用速度、固定轨道边界、48ms 上限与滚动夹取；两个 controller 仍各自持有手势生命周期 | 纯函数边界测试及既有自动滚动行为测试 |
| 快捷键契约 | +1、+2、+4 为当前支持，+3、+5 标为未实现 | `gpuix-arrangement-composition.md` 与 Live 只读菜单 |

ruler 原来的镜像写入在正式组合中由 SceneStore 去重，没有独立的用户可见失败。协调者通过 Orca 明确要求按删冗余处理，禁止调用次数接线测试，并豁免此项的红绿与变异要求。

## 修前红与修后绿

| 回归 | 修前结果 | 修后结果 |
| --- | --- | --- |
| 时间选区拖动中切换 Snap | 预期 `7.25..9.25`，实际回到 committed `8..9` | Snap 更新仍保持预览，Escape 恢复 committed，释放提交正确范围 |
| 折叠 Group 的 800px 时间视口 | `Collapsed group bypassed lane summary` | 摘要 bounds 为 `x=780,width=20` |
| 折叠 Group 的 200px 时间视口 | 同上 | 摘要 bounds 为 `x=180,width=20` |
| 拖动后 hydrate 工程再释放 | 预期新工程 target `12..14`，实际残留 source `7.25..9.25` | LaneController 在 epoch 失效时仍清除局部预览，不执行旧工程 gesture.finish；session 与显示保留新选区 |

初次运行因 worktree 未初始化缺少 React 与 native 包，按 setup 完成 build/install/native:build 后才取得以上行为失败；依赖错误不计为红例。

## 变异

入口为 `bun apps/gpuix/src/project/sections/arrangement/timeline/verification/mutations.ts`。18 项全部触发预期断言失败，其中本轮新增 6 项。

| 新增变异                                  | 失败测试数 |
| ----------------------------------------- | ---------: |
| committed 覆盖 range preview              |          1 |
| 取消 epoch 失效手势时不清理 range preview |          1 |
| 折叠 Group 绕过 lane slot                 |          2 |
| 摘要再次扣除 controlsWidth                |          2 |
| 网格打包不转换局部坐标                    |          1 |
| edge-scroll 不排除固定轨道区域            |          1 |

## 实际运行的验证

| 命令或场景 | 结果 |
| --- | --- |
| `bash scripts/gpuix-main/build.sh`，`pnpm install --frozen-lockfile`，`pnpm native:build`，renderer resolution check | 通过，未改依赖声明或 lockfile |
| `bun test apps/gpuix/src/project/sections/arrangement` | 249 pass，0 fail，653477 expect |
| `pnpm --filter @zoeydaw/gpuix-prototype typecheck` | 通过 |
| mutation runner | 18 项捕获 |
| 临时 createTestRoot 组合 smoke | 深浅主题 × 中英文共 4 pass，16 expect；截图后移除临时测试文件 |
| `pnpm verify:gpuix`，自审修复后重跑 | `verify:gpuix passed`；1177 pass，1 todo，0 fail；tsc 0 errors，eslint 0 warning，scan 15 source/7 test、0 hard/0 warn，地图 current |
| verify 内真实后端离屏应用 smoke | Home → project → resume first present 通过；nativePlaying=true，frames=21，恢复前首帧视口已同步 |
| 自审修复后的 `lane/interactions/controller.test.tsx` | 15 pass，0 fail，71 expect |

未修改 Rust，未另跑 cargo check/test。套件原有 1 todo 不属于本轮改动。

## 产品规则与 Live 观察

本轮只读 Live 窗口 AX、截图与菜单，没有点击或修改用户工程。窗口为 1463×1049，截图显示为 1250×896；不推断未知显示器缩放。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 车道在左，表头在右，紧凑轨道布局 | 当前 Arrangement 截图可见右侧表头、路由与 Mixer | 组合 screenshot 保持同一方向与紧凑结构 | 未在用户 Live 工程中创建或折叠 Group |
| 时间选区属于编辑预览 | AX 可见当前插入标记与 Arrangement | native 鼠标拖动生成 `7..8.5` 预览，Snap 切换后保留 | 未对 Live 执行时间选择手势，避免改用户工程状态 |
| +1 缩窄、+2 加宽、+4 吸附 | 只读“选项”菜单确认 Cmd+1、Cmd+2、Cmd+4；也列出 Cmd+3 三连音与 Cmd+5 固定网格 | 契约列当前支持项，标注 +3/+5 未实现 | 未扩展快捷键功能 |
| 网格层级弱于内容 | Live 当前界面有细网格与交替区域 | lane 和 timeline 普通细线共享 0.55 | 未把 opacity 数值声明为 Live 实测 |

## UI 规范第 13 节

协调者通过 Orca 要求本轮使用离屏 `createTestRoot` 与 `captureScreenshot`，不安排后台桌面输入时段。真实窗口前台视觉由协调者收尾统一验收；以下均明确为原生离屏证据，不称为真实窗口截图。

证据目录 `/tmp/zoeydaw-r1b-evidence`。截图未加入 Git。业务整体 `arrangement-{dark,light}-{en,zh}.png`，预览 `selection-{dark,light}-{en,zh}.png`，共享 Gallery `gallery-{dark,light}-{en,zh}.png`。

| 检查 | 结论与证据 |
| --- | --- |
| Gallery 与业务整体布局 | 已观察完整 Gallery dark/en、light/zh 与业务组合；折叠 Group 使用 lane 第一行色带，固定返送与 Main 在底部 |
| 跨区域对齐与居中 | 轨道右侧表头、路由与 Mixer 保持同一行高；Group 边框覆盖行外框；原生 bounds 回归验证右侧 20px 摘要 |
| 间距与内边距 | 未新增业务 gap/padding 或尺寸字面量；保留共享轨道度量与 lane preview inset/band token |
| 统一设计入口 | 未改共享 token；删除 tracks 第二套摘要，唯一呈现入口为 lane，普通网格材质同源 |
| 尺寸与紧凑感 | 业务截图保持工作站紧凑行高，未增加卡片容器；与只读 Live 截图比较布局方向和信息密度，不声称像素等同 |
| 深浅主题与中英文 | 四组原生组合 smoke 通过；已复核 light/zh 业务预览与 Gallery、dark/en 业务与 Gallery |
| 状态与键盘 | 原生鼠标拖动、Snap 状态变更、Escape 清预览通过；已有键盘、折叠、焦点组合回归在全套保持绿色；未改共享控件状态样式 |
| 拖动、滚轮、弹层与性能 | 拖动与取消已由 native simulation 实测；grid PNG parity 继续通过；单组合记录 536 nodes、976×734 时间视口；未测前台帧耗时，不把 verify 的 21 frames 称为本轮性能指标 |

可重跑行为入口为上面的 arrangement tests 和 mutation runner。正式前台入口为 `src/main.tsx` 与 `src/gallery/controls.tsx`，由协调者统一验收。没有新增用户可见功能缺口。

## 错题

- 错：持久选区与正在拖动的范围共用一个 setter。对：分开 committed 投影和 lane 预览，显示优先取预览。因：任意 workspace 同步都可能覆盖尚未提交的范围。
- 错：折叠 Group 另写摘要并重复扣除 controlsWidth。对：tracks 只负责复合行，摘要交给 lane，时间宽度直接使用 viewport.width。因：两套实现既破坏 slot 契约，也隐藏右缘可见内容。
- 错：用重复写调用次数证明 ruler 修复。对：对无行为差异的冗余删除保留真实组合行为回归。因：调用计数只检查接线，不检查用户结果。

## 已验证做法

- 原生组合回归同时检查暂态、session committed 与取消/释放结果，能捕获全量同步覆盖问题。
- 正常与窄时间视口都在最右侧放置相交内容，能捕获重复扣除表头宽度。
- 变异经 Bun preload 在内存替换源码，不动 worktree 文件；18 项均由断言失败证明捕获。
- 正式 TimelineController fixture 保持单一工程投影 owner，ruler 无需独立兼容同步。

## 自审结果

扫描命令为 `node scripts/gpuix-review-scan.mjs`，首次与自审修复后的完整验证均为 0 hard、0 warn。两路只读 `pstack-reviewer` 分别审 Standards 与 Spec，完整 diff 命令为 `git diff a04be5a...07e5c9d -- apps/gpuix/src/project/sections/arrangement docs/architecture/gpuix-arrangement-composition.md docs/architecture/gpuix-ui-map.md`，并纳入未提交的废弃双语标签清理。

初审提交列表为 `e6c07a1`、`ee6bf0b`、`0688d98`、`07e5c9d`。Standards 轴明确包含 gpuix 架构文档的代码质量底线，未发现硬性违规或判断性问题。Spec 轴发现一个 epoch 失效预览泄漏，已复现并修复。原 Spec reviewer 复核 working-tree 增量后确认 P2 解决，release、interrupt、step、dispose 均经共同 finish 清理，不提交旧工程动作。

自审修复提交为 `a3319fb`。对应增量命令为 `git diff 07e5c9d..a3319fb -- apps/gpuix/src/project/sections/arrangement`，包括 epoch 清理回归、变异与废弃标签删除。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| hydrate 改变 editEpoch 后跳过 gesture.finish，导致暂态选区残留 | 必修 | 清理移到 LaneController.finish 生命周期收口，工程提交仍受 epoch guard 保护；增加红绿回归与变异 | `clears invalidated time-range preview` 修前红、修后绿，变异捕获 1 fail；Spec reviewer 复核通过 |
| ruler 镜像没有独立行为红例 | 汇报仲裁 | 协调者要求删冗余，不加调用次数测试，不要求此项变异 | Orca 回复及原生组合行为套件 |
| 删除 GroupOverview 使生成 UI map 变化 | 汇报仲裁 | 协调者授权生成产物不受 ownership 限制；pre-commit 自动更新 | 地图 current，删除旧 testId |
| 后台遮挡窗口不出帧 | 汇报仲裁 | 协调者改为离屏像素证据，前台整体视觉由其统一验收 | 4 组 native composition smoke 与仓库外截图 |
| 文件体量与原测试规模 | 记录 | 没有把文件推过 1000 行；原有 >600 行 TrackRow 行为测试本次缩减，不做无关拆分 | Standards 只读审查 |

## 进程清理

本轮没有启动长驻窗口或 service。所有 createTestRoot 都在 finally 中 unmount，真实后端 smoke 释放 lease。

交付前命令 `ps -axo pid,etime,command | grep -E 'bun .*--hot|cargo run|gallery|demo'` 的输出为 `(no output)`，退出码 1，零匹配进程。
