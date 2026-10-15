# Native bridge

Build with `pnpm native:build` from the repository root. Engine exports and lifetime are documented in [the project adapter contract](../../apps/gpuix/src/project/adapters/README.md#native-session-api).

## Window diagnostics

`windowDiagnostics(windowTitle: string): WindowDiagnostics | null` reads the first exact-title AppKit window without changing window state. It returns `isKeyWindow`, `isMainWindow`, `occlusionVisible`, `isMiniaturized`, `isVisible`, and `appIsActive`. `occlusionVisible` is the `NSWindowOcclusionState.Visible` bit, not a synonym for `isVisible`.

Call synchronously from Bun's main thread after renderer initialization; napi workers are rejected. Missing titles or an uninitialized `NSApp` return null. Non-macOS calls fail explicitly. This diagnostic export is for measurement probes, not a polling-based platform visibility subscription.
