# TD-10：createTestRoot 窗口在 hosted runner 上被夹到屏幕尺寸

## 已查证

GitHub Actions run 38860591211（main 072180db，macos-15 hosted）`verify:gpuix` 失败 6 个测试，本机全绿。完整日志：`gh run view 38860591211 --repo chacelow/ZoeyDAW --log-failed`。

- `transport/index.test.tsx` 的 Header 测试：`expect(viewport.width).toBe(1800/1070)` 实际都是 1024；居中偏差 257.5。
- `arrangement/tracks/Row/interaction.test.tsx:322`：`Missing track-send-a-apply-3-audio`，测试窗口 height 1600 被夹，行没有挂载。
- `scripts/gpuix-main/ci-geometry/probe.tsx` 在 CI 上：`transport-scroll` bounds 宽 1024；sends 场景 `Missing resize fixture`。

推断：hosted macOS 的虚拟显示器约 1024×768，`createTestRoot` 创建的原生测试窗口被按屏幕可见区域夹住。不是字体问题（前一位 worker 已排除）。

## 要做

1. 在 vendor 里找到测试窗口的创建路径（`.gpuix-main/packages/native/src/test_renderer.rs`、`packages/react/src/testing.ts`，以及 GPUI 的 test/headless 平台窗口），确认夹取发生在哪一层（AppKit `constrainFrameRect`、GPUI bounds 计算、或 gpuix 自己按 display 取最小值）。先 ask 报根因与方案，等 reply 再改。
2. 优先方案：测试窗口尺寸严格等于请求尺寸，不受屏幕限制（离屏测试本不该依赖真实显示器）。如果必须改 vendor，做成新补丁登记进 `scripts/gpuix-main/config.json`（gpuix 或 zed 序列），用独立 vendor 根构建，不碰共享 vendor。
3. 本地复现：在本机构造一个比请求尺寸小的显示约束（或在测试里请求超过本机屏幕的尺寸，例如 4000×3000）复现夹取，修前红、修后绿，加一个变异。
4. 不放宽断言、不跳过测试、不在 CI 里改虚拟分辨率来掩盖。

## 验收

- 本机回归：请求超过屏幕的测试窗口尺寸，viewport 等于请求值。
- `pnpm verify:gpuix` 通过。报告写明 CI 需要的验证方式（合入后协调者推 main 看 CI）。
- 按 `common.md` 自审，先 merge_ready。
