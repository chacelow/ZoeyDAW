# W1c：Windows 补丁让生成的 index.d.ts 与补丁序列一致（返工）

`3ab868e2` 已合入主干又被撤回（`d8dca240`）。原因是共享 vendor 用完整补丁序列在 macOS 上从干净状态重建时，`check.mjs --record` 报 “Vendor must contain exactly the checked-in ordered patch series”。

## 已查证

- 补丁全部能应用（`git apply --cached` 逐个通过），zed 的 5 个补丁与实际一致。
- 不一致只出现在生成文件 `packages/native/index.d.ts`：`napi build` 重新生成后出现了两次 `init(options?: WindowOptions | undefined | null): void`（第 39 和 41 行）。来源：`windows-ui-bridge.patch` 把 `init` 拆成两个 `#[napi] pub fn init`（`#[cfg(not(target_os = "windows"))]` 一个，`#[cfg(target_os = "windows")]` 一个，后者多一个 `env: Env` 参数）。NAPI-RS 生成类型声明时不看 cfg，两个都会输出。而补丁里写进去的 `index.d.ts` 只有一份，所以构建后的树和“补丁序列应用后”的预期不一致。
- 你的独立 vendor 当时没撞到这个问题，多半是因为生成的 `.d.ts` 恰好被补进了 patch，或者构建顺序不同；共享 vendor 是从干净 checkout 按序列重建的。

## 要做

1. 只保留一个 `#[napi] pub fn init`，平台差异放到函数体里（例如签名统一带 `env: Env`，非 Windows 平台不使用它），让 NAPI 只生成一条声明。不要用后处理去删生成文件里的重复行。
2. 重新生成 `index.d.ts`，把生成结果写进补丁，保证“干净 checkout → 按序列应用补丁 → `napi build` → `check.mjs --record`”这条路径一致。
3. 自证：在你的独立 vendor 根上，从干净 checkout 跑一遍 `bash scripts/gpuix-main/build.sh`（`GPUIX_VENDOR_ROOT` 指向你自己的副本），`check.mjs --record` 和 `--resolution` 都要通过。把命令和输出写进报告。
4. `git merge gpuix-migration`（主干已经含撤回提交 `d8dca240`；合并时以你的分支内容为准，重新带回全部 W1 改动），跑轻量检查，再发 `merge_ready`。

worktree 和终端保留。
