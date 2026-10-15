# A1 core-port:工程核心迁入 gpuix

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-a1-core-port`(分支 `gpuix-a1-core-port`)。把 `apps/web/src/pages/project/{model,stores,adapters,layout}/**` 与 `pages/project/types.ts` 迁入 `apps/gpuix/src/project/{model,stores,adapters,layout}/**`、`project/types.ts`。

## Change

1. 原样迁移约 90 个文件与 29 个测试。这层与 DOM/React/Tauri 的耦合已审计:model 0、stores 0、layout 0、adapters 仅 2 个文件(`snapshots.ts` 用 `localStorage`,`useProjectEditGesture.ts` 用 React hook)。
2. 把 `@/pages/project/...` 别名导入改为相对路径(共 13 处);`layout` 的 `@zoeymind/ui/metrics` 改为从 `shared/theme` 暴露的度量读取(`useTheme().project` 是 hook,layout 是纯函数,请在 `project/layout` 内直接 import `@zoeymind/ui/metrics` 的 `CONTROL_METRICS/PROJECT_METRICS`——这是 layout 层唯一允许的度量入口,其余 UI 一律经 `useTheme()`)。
3. `snapshots.ts`:`localStorage` 改为注入的存储端口 `SnapshotStorage { get(key): string|null; set(key, value): void }`,默认实现留给 A2 的 `platform/storage`;你只定义端口与内存实现(测试用),不要自己写文件 IO。
4. 测试 `vitest` → `bun:test`:`import {...} from "vitest"` 换 `bun:test`;`vi.useFakeTimers/advanceTimersByTime/useRealTimers/getTimerCount` → `jest.*`(已实测 `jest.getTimerCount()` 可用),`vi.setSystemTime` → `setSystemTime`(从 `bun:test` 导入)。**不改任何断言**。`// @vitest-environment jsdom` 注释与 `@testing-library/react` 的 2 个测试(`runtime.test.ts` 相关与 `useProjectEditGesture.test.tsx`)改用 `@gpuix/react/testing` 的 `createTestRoot`,保留测试意图。`grid.test.ts` 引用了 `sections/ArrangementPanel/**` 的两个模块,这两个模块属于后续切片:把该测试里依赖它们的断言保留,但对应被引用函数若在 sections 里,先把那两个纯函数(`Timeline/useArrangementKeyboard` 与 `Grid/geometry` 中被测的部分)评估是否属于 model;若属于,迁入 `project/model`,否则该测试标记 `test.todo` 并在报告写明,等 Arrangement 切片接手。
5. `zustand` 保持原版本;不新增依赖。`useProjectState.ts` 的 `import { create } from "zustand"` 是 React 绑定,保留。
6. `ProjectBackend` 端口(`model/backend.ts`)保持不变——Rust 引擎将来实现它。`createMockProjectBackend` 保留,仅供纯逻辑测试。

## Constraints

- 不改 `apps/gpuix/src/shared/**`、`ui/**`、`crates/**`。
- 不改 `apps/web/**`(只读源)。
- 不得为了通过测试而放宽、删除或重写断言;若某断言在 bun 下行为不同,先定位原因,必要时 ask。

## Ownership

`apps/gpuix/src/project/{model,stores,adapters,layout}/**`、`apps/gpuix/src/project/types.ts`。

## Observable acceptance

- 在 `apps/gpuix` 下 `bun test src/project` 全部通过,通过数不低于原 29 个测试文件在 vitest 下的用例总数(先在 `apps/web` 跑 `pnpm --filter @zoeydaw/web test -- pages/project/model pages/project/adapters pages/project/stores` 记录基线用例数,报告里给出对比)。
- `tsc --noEmit` 通过。
- `grep -rE "react-dom|@tauri-apps|document\.|window\.|localStorage" apps/gpuix/src/project` 在非测试文件中无命中。
