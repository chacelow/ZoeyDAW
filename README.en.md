# zoeydaw

A native DAW. `apps/gpuix` combines React logic with gpuix native rendering; `crates/native` provides Rust napi platform capabilities, and `crates/engine` owns audio playback. gpuix is the only product entry point. The legacy Web, Tauri, and shared-package workspaces have been removed.

The app includes Home, project panels, Browser, Arrangement, and Audio/MIDI/Pattern editors. Project adapters connect to the real native backend; projects save as `<Name> Project/<Name>.zdaw` with automatic backups, and settings and logs use native storage. See [product scope](docs/product-prototype.md) for implemented and outstanding capabilities; plug-in hosting and Ableton `.als` import are not claimed as complete.

## Develop

Initialize a new checkout from the repository root:

```bash
bash scripts/gpuix-main/build.sh
pnpm install --frozen-lockfile
pnpm native:build
pnpm verify:gpuix
```

Open the development window:

```bash
pnpm --filter @zoeydaw/gpuix-prototype dev
```

See [setup](docs/agents/setup.md) for the pinned renderer build, toolchain, hot reload, and native restart rules. Node requirements and the pnpm version are defined in the root `package.json`. The current self-built renderer is verified on macOS arm64.

## Layout

```text
apps/gpuix/src/app/          Application shell, routing, composition root
apps/gpuix/src/project/      Domain model, stores, adapters, business panels
apps/gpuix/src/ui/           Shared native controls and panels
apps/gpuix/src/shared/theme/ Theme, presets, shared measurements
apps/gpuix/src/platform/     Native ports, i18n, logging
crates/native/              Rust napi bridge and platform capabilities
crates/engine/              Audio engine
```

Cross-directory imports use `@/` for `apps/gpuix/src`. ESLint enforces the dependency direction documented in the [gpuix architecture](docs/architecture/gpuix.md).

## Project and arrangement

[Stores](apps/gpuix/src/project/stores/README.md) own document, workspace, and transient session state. [Adapters](apps/gpuix/src/project/adapters/README.md) define editing, playback, and persistence boundaries. The [Arrangement composition contract](docs/architecture/gpuix-arrangement-composition.md) defines timeline, tracks, lane, and core ownership. Shared layout and appearance follow the [panel contract](docs/architecture/project-panels.md).

License: Apache-2.0.
