# Native bridge

Build with `pnpm native:build` from the repository root. Engine exports and lifetime are documented in [the project adapter contract](../../apps/gpuix/src/project/adapters/README.md#native-session-api).

## Window diagnostics

`windowDiagnostics(windowTitle: string): WindowDiagnostics | null` reads the first exact-title AppKit window without changing window state. It returns `isKeyWindow`, `isMainWindow`, `occlusionVisible`, `isMiniaturized`, `isVisible`, and `appIsActive`. `occlusionVisible` is the `NSWindowOcclusionState.Visible` bit, not a synonym for `isVisible`.

Call synchronously from Bun's main thread after renderer initialization; napi workers are rejected. Missing titles or an uninitialized `NSApp` return null. Non-macOS calls fail explicitly. This diagnostic export is for measurement probes, not a polling-based platform visibility subscription.

## Engine and atomic-save ownership

Each N-API Env registers one cleanup owner. Its set contains only active Session IDs; explicit `dispose` removes the ID and joins the control thread, while Env teardown disposes any remaining sessions. Entering and leaving projects does not accumulate per-session cleanup hooks.

Telemetry reserves one in-flight delivery before preparing its JSON. Completion, including a throwing JS listener, releases that reservation. Replacing the subscriber keeps the same reservation; a terminal N-API delivery failure stops that subscriber rather than retrying allocations.

Atomic saves create unique same-directory temporary files and remove only their own temporary file on failure. They do not scan or delete another process's temporary files. Crash leftovers remain untouched because a filename or PID mismatch does not prove an abandoned transaction.

## Settings schema and defaults

`settings.rs` owns settings version 1 and migration from unversioned files. Reads normalize legacy data in memory without changing the file. Unsupported versions, invalid preferences, and unreadable existing files reject writes before atomic replacement.

`settings/preferences.rs` defines the Rust `Preferences` schema. The existing napi build generates the TypeScript interfaces and enum unions in `index.d.ts`. Default data lives once in `apps/gpuix/src/project/defaults/preferences.json`; Rust loads that file with `include_str!`, and the pure TypeScript entry reads the same JSON. Its module declaration references the generated `Preferences` type instead of repeating the shape.

`preferencesDefaults()` returns the validated preference defaults. `settingsDefaults()` returns the complete versioned settings object. `settingsGet(configDir)` and `settingsSet(configDir, json)` retain their JSON-string transport. `openSession(configDir?)` reads the selected configuration before creating the control thread and passes the audio-device preferences to `DeviceSessionConfig`.

`Preferences.arrangement` stores sparse overrides, not another default table. Its fields follow the bounds documented in `project/defaults/arrangement.ts`; omitted fields remain absent after persistence. Shared pointer defaults stay in the JSON source.

## Resource regressions

Set `CARGO_TARGET_DIR` to an absolute private build directory, then run `node crates/native/verification/resources.mjs`. It builds with the default-off `verification` Cargo feature and copies the library to that target's `verification/zoeydaw-native.node`. It never replaces the packaged `.node`. `CARGO` can select an explicit Cargo executable; otherwise the runner derives its path from the user's Cargo installation directory. The real N-API tests block the JS thread, throw from the consumer, repeatedly dispose sessions, and tear down Worker Envs. `engineVerificationResources()` and its counters exist only in that verification build; normal `pnpm native:build` does not enable them.

`node crates/native/verification/mutations.mjs` reruns the Rust/N-API regressions with each defect restored, then restores the source in `finally`. Run it without concurrent edits or builds to these owned sources. For Rust commands, use the same private `CARGO_TARGET_DIR`.
