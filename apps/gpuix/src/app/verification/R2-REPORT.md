# R2-app 工程打开与离开修复

2026-10-16。范围为 UPA-01、UPA-02、UPA-03、UPA-08。源码基线为切片创建时的 `ea11b3f1`，报告中的 diff 不包含此前已合入主干的迁移历史。

## 实现

| 项目 | 行为与边界 |
| --- | --- |
| UPA-01 | recent、启动路径和历史返回在取得 runtime lease 前调用 `openProjectSnapshot(projectId)`，使用现有 parser 校验并 hydrate；新建路由携带一次性的 `openMode: "new"`，不读快照。缺失快照为空工程且无错误。 |
| 损坏/读取失败 | 使用现有 `snapshotError` 显示，保持引擎可用。保存入口检查 failed-open key fence，不能用默认数据覆盖原始字节。`canSaveSnapshot()` 是 arrangement Save 按钮使用的只读 selector。 |
| 修复后的 Restore | 显式 Restore 成功才清 fence 与错误；失败仍保护原 key。成功后编辑、保存正常。 |
| UPA-02 | 唯一 router owner 在 navigate、replace、back 提交前调用 leave guard，复用窗口关闭的 save/discard/cancel 状态机与对话框。Cancel、保存失败不改变路由或 undo。保存成功后才离开；并发请求不替换正在处理的决定。 |
| UPA-03 | 语言读取失败使用显式 initialLanguage 或 DEFAULT_LOCALE 并记录诊断；写入失败记诊断，保留已选内存语言，`changeLocale` 不因持久化失败 reject。 |
| UPA-08 | console/native sink 分流前统一展开 Error 并递归脱敏，覆盖大小写、数组、Error 自定义字段及 context。cause 递归共用 `redact` 的 WeakSet，循环输出 `[Circular]`；不修改输入对象。 |

所有权扩展均经协调者批准：`project/adapters/index.ts` 新入口导出；`snapshots.ts` failed-open fence、identity 切换清 fence、Restore 成功清 fence。未改快照校验规则。Save 按钮 disabled 接线归 R2-arrangement，不在本切片修改。

## 红绿与变异

| 回归 | 修前结果 | 修后结果与变异 |
| --- | --- | --- |
| 保存 → recent/启动恢复 | 保存 BPM151，重开得到 BPM120；内容不一致 | 实际 native backend 下 recent 与重新挂载序列化结果等于保存值；跳过 hydrate 变异失败 |
| 损坏快照 | 没有 snapshotError | 显示错误，保存后原字节不变；移除 fence 变异失败 |
| 新建、缺失、同 id 重开 | 缺失基线已无错误；同 id discard 后重开仍残留 BPM177 | 新建不读 throwing storage；缺失仅 Main；同 id 重开恢复空工程；新建读存储与保留旧数据变异失败 |
| dirty Back/replace/navigate | 三条路径直接离开，没有决策 | Cancel 保留 BPM142 及 undo；replace 先保存 BPM143；存储失败保留 BPM144/dirty，discard 可离开；绕过 guard、失败保存仍离开两个变异失败 |
| 语言 I/O | 3 个测试失败，settings unreadable/unwritable 沿启动或 changeLocale 抛出 | 独立子进程隔离 singleton，5 pass；读边界、写边界两个变异失败 |
| console/sink 脱敏 | JSON/formatted 两个 sink 泄露原始字段 | 两种输出一致脱敏，保留诊断字段；raw sink 变异使 4 个测试失败 |
| Restore 恢复保存 | Restore 成功后保存仍保留 BPM120，目标163未落盘 | 保存163且 dirty 清除；遗漏成功清 fence 变异失败 |
| 循环 Error.cause | JSON/formatted 均 Maximum call stack size exceeded | console/sink 输出完整诊断与 `[Circular]`，输入不变；恢复递归 normalizer 变异使2个测试失败 |

命令均在 `apps/gpuix` 运行，除特别注明：

```sh
bun test src/app/project-lifecycle.test.tsx src/app/window/unsaved-close.test.ts src/app/router/router.test.ts src/app/AppShell.test.tsx
bun test src/app/project-lifecycle.test.tsx src/platform/log/logger.test.ts --timeout 30000
bun test src/platform/i18n src/platform/log
bun src/app/verification/mutations-r2.mjs
bun src/platform/i18n/verification/mutations-r2.mjs
bun src/platform/log/verification/mutations-r2.mjs
```

第一组在首次修复后33 pass；审查边界修复后第二组20 pass、0 fail、85 assertions；platform 初次聚合15 pass。最终变异为 app7、i18n2、log2，全部抓住并恢复原文件。

## 实际运行证据

真实 native backend 的业务 smoke：

```sh
B2_EVIDENCE_DIR=/tmp/zoeydaw-r2-app-evidence bun \
  --preload ./src/app/verification/native-fixture.ts \
  src/app/verification/r2-lifecycle.tsx /tmp/zoeydaw-r2-app-evidence
```

实际输出：

```json
{
  "output": "/tmp/zoeydaw-r2-app-evidence",
  "restoredBpm": 151,
  "corruptBytesPreserved": true,
  "restoreRecovered": true,
  "nativeBackend": "ready"
}
```

脚本执行首页新建、修改、dirty 离开保存、recent 恢复、损坏 key 保存拒绝、修复后 Restore 再次保存163，并在 finally 卸载 root。证据目录包含4张完整业务组合图及对应 AX，不提交生成图片。

直接运行实际 logger 的循环 Error smoke 输出 `cause:"[Circular]"`、`token:"[REDACTED]"`，sink 输出 `sink sanitized cycle`。不是 console mock 的结果。

后台真实窗口用命名 service `r2-app-window` 启动：

```sh
GPUIX_BACKGROUND=1 HOME=/tmp/zoeydaw-r2-app-home \
ZOEYDAW_ROUTE=/project/window-smoke bun --hot src/main.tsx
```

观察到原生 `created native window`、`mount complete`，窗口 PID32241、1280×800、未聚焦。只读 AX 保存于 `/tmp/zoeydaw-r2-app-evidence/background-window.ax.txt`。后台 AX 仅暴露窗口和3个系统按钮，未把它当业务绘制证据；service 在19.3秒时关闭。未获取桌面控制，未操作用户服务。

## UI 规范第13节

| 检查 | 证据与结论 |
| --- | --- |
| Gallery 与业务整体布局 | 既有 Gallery evidence 入口输出6个完整组合、errors=[]；业务 `leave-en-US-dark.png`、`leave-zh-CN-light.png`、`restored-zh-CN-light.png`、`corrupt-zh-CN-light.png` 保留工具栏/Browser/Arrangement/Footer关系。已查看完整 Gallery、离开对话框与恢复/错误业务图。 |
| 跨区域对齐与居中 | 复用 ModalDialog 居中；按钮同一右对齐行，文字未见裁切。Gallery manifest 110项测量、0失败，未新增单个实例尺寸。 |
| 间距与内边距 | UnsavedCloseDialog 仍用 `theme.design.popover.gap/inset`，没有新间距。Gallery 原生测量全部通过。 |
| 统一设计入口 | 复用 `Button`、`ModalDialog`、已有错误呈现；业务没有新增圆角/边框/间距覆盖。 |
| 尺寸与紧凑感 | 对话框仍取 `theme.project.controlsWidth` 与共享控件度量。未新增业务控件几何。Live 同场景完整像素密度比较未做，协调者前台收尾验收。 |
| 深浅主题与中英文 | 业务有英文深色、中文浅色离开提示；Gallery涵盖default深浅中英文及flat/spacious英文深色。现有 snapshotError 仍为英文原文，未扩展错误本地化范围。 |
| 状态与键盘 | 真实 native keystrokes Enter 选择 save/discard/cancel；回归断言路由、文档、dirty、undo。既有窗口关闭与设置键盘测试通过。AX有Dialog及Cancel/Don't save/Save三个命名Button。 |
| 拖动、滚轮、弹层与性能 | 本切片不改拖动/滚轮/动画。Gallery既有操作及110项测量通过；完整门禁真实后端resume smoke执行并释放idle。未声称前台帧性能已验收。 |

Gallery复跑命令为 `bun src/gallery/verification/evidence.tsx /tmp/zoeydaw-r2-app-gallery`，输出 `{"output":"/tmp/zoeydaw-r2-app-gallery","errors":[],"overviews":6}`。

## 产品规则与 Live 观察

只读观察现有 Live 窗口“无标题”，未点新建/打开/保存，未改 Live 工程或用户数据。

| 产品规则 | Live 观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 新建、打开、recent 是不同入口 | 文件菜单存在“新建 Live Set”Cmd+N、“打开 Live Set...”Cmd+O、“打开最近的工程”子菜单 | 首页新建不读；recent/启动恢复保存的快照 | 本产品仍是prototype snapshots，不是 `.als` 或 `.zdaw` 文件选择器 |
| 保存使用 Cmd+S | 文件菜单“保存 Live Set”Cmd+S、“另存 Live Set 为...”Shift+Cmd+S | 保留现有保存命令，失败打开 key 在公共保存入口拒绝覆盖 | 损坏修复交互用既有 Restore；不新增 Save As |
| dirty 离开需要保存决定 | 只读菜单确认相关入口；未对用户 Live 做dirty离开实验 | 窗口关闭及路由离开共用save/discard/cancel | Live dirty提示文案与默认焦点未实测，不宣称一致 |

## 自审结果

独立只读代理 `R2AppReview` 按 Standards/Spec 两轴审查。主差异命令为：

```sh
git diff ea11b3f1..HEAD -- apps/gpuix/src/app apps/gpuix/src/platform/i18n \
  apps/gpuix/src/platform/log apps/gpuix/src/project/adapters/index.ts \
  apps/gpuix/src/project/adapters/snapshots.ts
```

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| Restore 成功没有解除failed-open fence，P1 | 汇报仲裁 | 协调者明确授权成功分支清除；新增红绿/变异与真实smoke | `d126008c`；回归保存163、dirty=false；app第7个变异失败 |
| Error.cause循环在独立normalizer中溢出，P2 | 必修 | normalizer改私有浅展开，统一递归owner | `31bd2cae`；两个回归红→绿、循环变异失败 |
| verification/r2-lifecycle.tsx的1280×800 root，WARN px-literal | 记录 | 固定测试视口输入，不是产品样式或token副本，保留 | 扫描0 HARD、1 WARN |
| Standards轴 | 记录 | 没有独立规范发现 | reviewer初审及定向复核；两项发现复核均关闭，无新增Standards/Spec发现 |
| 既有grid.test.ts:66 todo | 记录 | 非本切片新增，不修改project/model所有权 | 首次完整门禁1226pass、1todo、0fail |

## 完整门禁与环境

首轮在worktree根执行 `pnpm verify:gpuix` 全部通过：renderer身份、native构建、tsc0错误、eslint0warning、architecture80pass、文档路由9项、bun1226pass/1既有todo/0fail、scan0HARD/1WARN、UI map current、真实后端resume smoke released idle。审查边界修复后的 app-local `pnpm exec tsc --noEmit` 也通过。

最终复跑目前被共享renderer manifest格式阻断。共享manifest新增 `buildMode:"runtime"` 和完整outputs，当前切片旧check.mjs不认识新结构；已向协调者请求相容tooling提交，未修改或重录共享vendor。后续最终门禁结果由本节更新。

根目录直接 `pnpm exec tsc --noEmit -p apps/gpuix` 曾命中全局TS6并报baseUrl弃用；正确入口是在apps/gpuix运行 `pnpm exec tsc --noEmit`，完整门禁也采用这个入口。未以修改配置掩盖命令选错。

## 错题

- 错：failed-open保护只在重新打开时清除，漏掉显式Restore成功。对：恢复成功的每个公开入口都完成保存能力状态转换。因：新增保护状态必须检查现有恢复路径，而不只是新入口。
- 错：Error先递归展开，再交给脱敏的循环检测。对：normalizer只展开当前Error字段，全部递归由同一个WeakSet控制。因：两套递归使循环保护晚于栈溢出。
- 错：在worktree根调用未本地锁定的tsc。对：使用app-local工具链或verify:gpuix。因：根目录可解析到宿主全局TypeScript版本。

## 已验证做法

- 用真实native backend验证保存/离开/重开，断言落盘字节、文档、dirty和undo；不靠内部调用次数。
- 故障恢复回归必须经过失败打开、修复存储、成功Restore、再次编辑保存，能抓住永久禁用的状态残留。
- 变异脚本恢复原始缺陷并要求行为断言失败，finally恢复源码；本轮11个变异均被抓住。
- 新建意图只存在当前历史入口，离开后消费，避免历史返回把已保存工程当成新建。
- 背景窗口只验证启动与释放；视觉取证用真实原生离屏组合，前台性能/像素审查留给协调者。

## 进程清理

验证窗口已关闭，离屏root均在finally卸载。执行用户指定命令：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空，退出码1，即没有匹配的残留进程。未停止其他Session或用户进程。
