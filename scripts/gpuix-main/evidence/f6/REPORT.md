# F6：原生 ARIA toggled

## 范围与实现

- 固定 gpuix `6a5c7c142ac32f9eb0caefe0121be995cfc18631`；独立源码根 `/Volumes/PSSD/code/_vendor/f6-gpuix`。未修改共享 vendor、zed、业务控件或依赖。
- `aria-toggled.patch` 排在 `resume-frame.patch` 后。HostProps、VirtualListShared 与 UNIVERSAL_PROPS 同步支持 `aria-pressed` / `aria-checked`。
- boolean 映射 True / False，`"mixed"` 映射 Mixed；checked 优先，包括显式无效 checked 不回退 pressed。沿用 `bool_prop`，字符串 `"true"` / `"false"` 不解析为 boolean。
- 每次 render 从当前 custom props 计算 toggled；现有 null 删除 mutation 移除 prop。没有额外状态、缓存或清理分支。

## 已执行验证

| 命令 / 场景 | 结果 |
| --- | --- |
| `GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f6-gpuix bash scripts/gpuix-main/build.sh` | 通过；12 个补丁源身份及 native / JS host / React 构建通过；native 23,948,960 bytes |
| `pnpm install --frozen-lockfile` | 通过 |
| `pnpm --dir apps/gpuix exec tsc --noEmit -p ../../scripts/gpuix-main/aria-toggled/tsconfig.json` | 通过 |
| `bun test scripts/gpuix-main/aria-toggled/aria-toggled.test.tsx` | 1 pass，13 assertions；真实原生 AccessKit tree，覆盖 false / true / mixed、优先级、删除 checked 恢复 pressed、删除所有状态 |
| vendor `cargo check --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders` | 通过 |
| vendor `cargo test --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders --lib` | 313 passed；使用 `CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target CARGO_BUILD_JOBS=6` |
| 原生像素 smoke | `createTestRoot` + `captureScreenshot`；`offscreen.png` 实际可见 Pressed / Checked，AccessKit 同帧为 Button True / CheckBox Mixed；临时脚本已删除 |
| 后台真实窗口 | `GPUIX_BACKGROUND=1 bun --hot scripts/gpuix-main/aria-toggled/window.tsx`；stdin 驱动 false → true → mixed → remove；AX 原文与属性见本目录；窗口启动 44 秒内关闭 |
| `GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f6-gpuix pnpm verify:gpuix` | 通过；tsc 0 error、ESLint 0 warning、architecture 80 passed、Bun 1199 pass / 1 todo / 0 fail；真实后端 Home → project → resume first present，释放后 idle；UI map current |
| 根目录 `CARGO_BUILD_JOBS=6 cargo check && CARGO_BUILD_JOBS=6 cargo test` | 通过；51 passed（4 suites） |

Rust 变异均在独立 vendor 实现上执行并恢复，运行相同 accessibility 单测过滤命令：

| 变异 | 被捕获的测试 | 结果 |
| --- | --- | --- |
| true → False | toggled_boolean_and_mixed_states | exit 101 |
| false → True | state test、deletion test | exit 101 |
| mixed → True | state test、deletion test | exit 101 |
| pressed 优先 | checked_overrides_pressed、deletion test | exit 101 |
| absent → False | absent_state_has_no_toggled、deletion test（删除后仍带 False）、invalid token test | exit 101 |

## macOS 实际 AX

| 宿主 prop / role | false → true | mixed | remove |
| --- | --- | --- | --- |
| button / aria-pressed | AXRole=AXCheckBox；AXSubrole=AXToggle；AXRoleDescription=toggle button；AXValue=`false` → `true` | AX 树显示 `true` | 恢复 button，无 value |
| checkbox / aria-checked | AXRole=AXCheckBox；AXSubrole=AXUnknown；AXRoleDescription=checkbox；AXValue=`false` → `true` | AX 树显示 `true` | checkbox 保留，无 value |

证据：`ax-false.txt`、`ax-true.txt`、`ax-mixed.txt`、`ax-removed.txt`、`attributes-false.json`、`attributes-true.json`。`window.png` 是实际后台截图，客户区全黑；它不作为视觉通过证据。`offscreen.png` 是有效像素 smoke，PNG 按仓库规则忽略、不提交。

Mixed 在 AccessKit 原生 tree 是 `Mixed`，但本机 macOS AX 读取显示 `true`；没有把平台表现冒充三态朗读验证。当前 button 已暴露 toggle，无需改成 switch / checkbox；若业务要求 VoiceOver 区分 Mixed，需另行验证系统朗读及 AccessKit macOS adapter，不在此切片改变业务 role。

## 产品规则 → Live 观察 → 实现 → 差异/未验证

| 产品规则 | Live 只读观察 | 实现 | 差异 / 未验证 |
| --- | --- | --- | --- |
| 状态不拼进名称，独立暴露值 | 当前 Live 窗口 AX 中“显示过滤器视窗”“浏览器文件预览”为 checkbox，值 `1`；“优化 Arrangement 高度/宽度”为 checkbox，值 `0` | 名称稳定，toggled 独立映射；button 由 macOS 映射 toggle button | Live 用 0/1，本机 AccessKit AX 用 false/true；未操作 Live，未验证其三态 |

## UI 规范第 13 节

| 检查 | 结论 / 证据 |
| --- | --- |
| Gallery 与业务整体布局 | 未改可见布局；R1c 业务消费方由协调者合入后复验，不宣称本分支已验其整体 |
| 跨区域对齐与居中 | 不涉及，renderer 只接状态语义 |
| 间距与内边距 | 不涉及，无业务样式修改 |
| 统一设计入口 | 不涉及，无 token / 组件变体改动 |
| 尺寸与紧凑感 | 不涉及；最小探针不是产品 Gallery |
| 深浅主题与中英文 | 不涉及名称与布局；未执行视觉矩阵 |
| 状态与键盘 | false/true/mixed/remove 原生状态已验证；未更改键盘逻辑，不宣称验证 Tab / Space |
| 拖动、滚轮、弹层与性能 | 不涉及，未做性能声明 |

## 错题

- 错：直接 `use accesskit::Toggled`；当前 renderer 没有直接 accesskit 依赖，构建失败。
- 对：使用已有 `gpui::accesskit::Toggled` re-export，不新增依赖。
- 错：假设后台窗口截图能证明像素正确；实际客户区为黑。
- 对：后台窗口只验真实 AX；像素用 createTestRoot 离屏 capture，并实际打开图片确认。
- 根工具链 tsc 是 TS6，应用使用 TS5；探针类型检查使用应用的 tsc，避免把根配置的 deprecation 当成切片故障。

## 已验证做法

- 一个原生 helper 直接读取当前 props，不缓存 toggled；删除 checked 后回到 pressed，再删除 pressed 清空，Rust、真实 AccessKit tree 与系统 AX 三条链路一致。
- 用 stdin 驱动后台验证组件的状态，不依赖前台输入、不获取桌面控制、不使用定时轮询；获取证据后立即关闭命名 service。

## 进程清理

已关闭唯一自启窗口 `f6-aria-ax`，临时像素脚本执行后 unmount 并退出。交付前运行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空，grep exit 1（无匹配）；未停止用户进程。
