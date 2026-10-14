# Native Clip rendering

`components/ClipTimeline.tsx` owns demo tracks, the horizontal viewport and the active gesture. `TrackRow` filters each track's `Clip[]` before mounting `ClipBlock`. Shared model/theme files and `main.tsx` remain unchanged.

- Positions use zero-based fractional `startBar` and `lengthBars`; the ruler displays one-based bars at 24 pixels/bar. Fractions represent beats within a bar (the demo displays 4 beats/bar).
- A body drag changes `startBar` on every move. Release applies the final pointer coordinate and clears the gesture without restoring the initial geometry.
- A left-edge resize keeps the original right edge fixed; a right-edge resize keeps the original start fixed. Length is bounded below by 0.5 bars, start by zero, and end by the 256-bar demo extent. Minimum-length Clips keep usable edge handles.
- Visible Clip ranges intersect the viewport inclusively. Partially visible Clips remain mounted and are clipped by the lane; wholly off-screen Clips are not mounted.
- Track chart colors and UI metrics come from `useTheme()`; styles use `sx`. The title strip is solid track color, the body translucent. The fixture includes audio, MIDI and pattern Clips, without audio playback or decoded media previews.
- The gesture snapshot stores press-time geometry, not a second editable Clip copy. The live track state remains the rendered source of truth. A new press replaces stale gesture state, and unpressed movement ends it without changing the last live position.

## Run

From `apps/gpuix`:

```sh
bun --hot src/features/clip-render/demo.tsx
```

## Native smoke evidence

The repeatable native interaction entry initializes an actual gpuix window and sends pointer events through gpuix's native automation backend, not mocked React handlers:

```sh
bun --hot src/features/clip-render/smoke-entry.tsx
```

Run it as a fresh process; unlike `demo.tsx`, the smoke entry creates its own renderer and should not be edited while it is running. It prints a JSON `PASS` after verifying live movement before release, persistence afterward, both resize edges, minimum-length recovery, zero-start clamping, unpressed hover stability, and off-screen unmounting. Stop its managed terminal after inspecting the result.

Verified via Orca-managed terminal `term_7a898ef2-b5dc-46a1-86af-3bd630682f6e`, using:

```sh
orca terminal create --worktree path:/Users/caishilong/orca/workspaces/zoeydaw/gpuix-clip-render --title gpuix-clip-render-final --command "cd /Users/caishilong/orca/workspaces/zoeydaw/gpuix-clip-render/apps/gpuix && bun --hot src/features/clip-render/smoke-entry.tsx" --json
pnpm --filter @zoeydaw/gpuix-prototype typecheck
```

Observed native geometry for Kick Loop: initial `(x=116,width=96)`, released drag `(x=188,width=96)`, right resize `(x=188,width=144)`, left resize `(x=212,width=120)`. After panning, mounted Clips changed from 7/13 to 3/13 and Kick Loop's node count became zero.

Screenshots are outside the source tree:

| Evidence                     | Path                                                |
| ---------------------------- | --------------------------------------------------- |
| Initial colored Clips        | `/tmp/gpuix-clip-render-proof/01-initial.png`       |
| Released horizontal drag     | `/tmp/gpuix-clip-render-proof/02-dragged.png`       |
| Right-edge resize            | `/tmp/gpuix-clip-render-proof/03-resized-right.png` |
| Left-edge resize             | `/tmp/gpuix-clip-render-proof/04-resized-left.png`  |
| Panned visible-range culling | `/tmp/gpuix-clip-render-proof/05-culled.png`        |

Desktop inspection separately confirmed the real native window (window `44250`, process `83617`) and its 3/13 mounted-Clip readout. OS-level drag automation was unavailable/unreliable during concurrent desktop activity; the successful interaction proof uses native gpuix synthetic pointer input. No shared-foundation gap was needed for this slice.
