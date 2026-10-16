# 渲染器：固定 gpuix 主干自建

## 决策

固定 `remorses/gpuix` `6a5c7c142ac32f9eb0caefe0121be995cfc18631` 与其 zed 子模块 `c2e9f882030ca95cee55d206512a0a3ee6cd72b0`，在仓库外构建，应用通过 `.gpuix-main` 链接消费 `@gpuix/native` 与 `@gpuix/react`。不使用 npm 0.10.0：它缺 `onLayout` 等主干已有能力，上游发布时间不可预测。版本唯一来源是 `scripts/gpuix-main/config.json`。

## 构建与解析

- macOS：`bash scripts/gpuix-main/build.sh`；Windows x64：`node scripts/gpuix-main/build-windows.mjs`。两者按 `config.json` 的顺序应用 `scripts/gpuix-main/patches/` 下的补丁，构建 native、JS host 与 React，并写入产物 manifest。
- 产物位于 `GPUIX_VENDOR_ROOT/<revision>`，默认是主仓库同盘的 `_vendor/zoeydaw-gpuix`；Cargo target 默认在同一基目录。已验证的产物只链接、不重建。外置 `.build-lock` 保证同一 vendor 只有一个构建 owner。
- 根 `pnpm-workspace.yaml` 用 `link:.gpuix-main/packages/...` 覆盖两个包，`apps/gpuix` 直接链接 vendor React，使应用、renderer、react-reconciler 与 Zustand 共用一个 React。`node scripts/gpuix-main/check.mjs --resolution` 校验实际解析路径。
- 干净 checkout：先构建渲染器，再 `pnpm install --frozen-lockfile`、`pnpm native:build`、`check.mjs --resolution`。缺少 `.gpuix-main` 时 `pnpm:devPreinstall` 直接失败，不回落到 npm renderer。

## 补丁序列

| 补丁 | 作用 |
| --- | --- |
| `close-guard` | 同步关闭否决，未保存工程先确认 |
| `frame-callback` | 原生帧回调，驱动播放头与电平 |
| `input-select-all-on-focus` | 数值输入获焦全选 |
| `anchored-center` | 弹层居中定位修正 |
| `window-active-change` | 窗口激活事件 |
| `window-appearance-close` | 系统外观观察与程序化关闭 |
| `context-menu` | 原生 `onContextMenu` |
| `quad-batch` | 批量矩形绘制，设备像素吸附与描边 |
| `autofocus-focus-event` | autoFocus 发出 focus 事件 |
| `resume-frame` | 恢复后首帧同步提交最新场景 |
| `aria-toggled` | `aria-pressed` / `aria-checked` |
| `test-window-scale-factor` | 离屏测试窗口 scale |
| `windows-ui-bridge` | Windows 帧、恢复、关闭、光标与 scale 桥 |
| `windows-renderer-cleanup` | 每 Env 一个 registry，幂等注销 |
| `test-window-teardown` | 离屏窗口 owner-checked 释放 |
| `zed-production-no-sync-draw` | 生产构建不走测试同步重绘 |
| `zed-offscreen-window-bounds` | 离屏窗口不受屏幕边界夹取 |
| `zed-test-window-scale-factor` | 离屏 scale 在 GPUI 侧的参数链 |
| `zed-windows-resume-offscreen` | Windows 恢复门控与离屏渲染 |
| `zed-windows-successful-presents` | 只统计成功的 DXGI Present |
| `zed-windows-offscreen-teardown` | 离屏 HWND 同步释放 |

修改序列中间的补丁时，共享 vendor 要从该补丁起逆序回退再重放，见 LESSONS。

## 升级到新 SHA

1. 核对上游 native、JS host、React、zed、Cargo.lock、bun.lock 与 Rust 工具链变化。
2. 更新 `config.json` 的两个 SHA，在新的外置目录构建，不覆盖旧目录。
3. 逐个核对补丁是否已被上游替代；仍需要的在新基线重做。
4. 运行构建、frozen install、`pnpm native:build`、`check.mjs --resolution`、`tsc --noEmit`、`bun test`、ESLint 与受影响的 Rust 测试。
5. 真实窗口检查布局事件、Space、关闭否决与允许。
6. 只提交 SHA、补丁与构建配置，不提交第三方源码或二进制；保留上游许可证与 `THIRD_PARTY_NOTICES`。

## 已知约束

- napi、native JS 与 React 必须一起构建，不能只替换 `.node`。
- macOS 无完整 Xcode 时使用 `gpui_platform/runtime_shaders`。
- 文本 `onLayout` 报告的是 border box，不是 glyph 宽度；未挂载文本不能等待该事件。
- 上游主要由单人维护，固定 SHA 与 lockfile 是唯一的稳定性来源。
