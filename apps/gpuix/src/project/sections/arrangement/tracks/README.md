# Arrangement tracks

Stage 1 integration is not final acceptance. [VERIFICATION.md](VERIFICATION.md) records the migration inventory, Live comparison, visual checklist, independent reviews and actual gates. TypeScript, slice lint/scan and Rust pass. One shared nested-context-menu regression remains enabled; actual numeric fill/bipolar geometry, wheel ancestor isolation and complete per-state visuals still block acceptance. Verification continues after A3b's second increment; no `worker_done` is claimed.

## Routing legality

`project/model/track-routing.ts` owns `canRouteTrack(sourceId, destinationId, tracks)` and `routingDestinations(track, tracks)`. Both the routing menu and `adapters/runtime/track-routing.ts` use the same decision. Internal targets must be Group or Main, cannot be the source or its descendant, and cannot close an output cycle. `none` and `external` remain legal terminal destinations. Checking candidates does not alter the document.

Candidate projection builds one ID index and descendant set per source, then shares the same indexed predicate with authored route validation. The component memoizes unchanged inputs; there are no repeated linear track searches inside candidate walks. A standalone 2002-track / 2001-target scenario completed 200 projections in 41.38ms; no before-version timing or speedup factor is claimed. Both descendant and cycle mutations were rerun against this indexed implementation and each failed one test before restoration.

Initial 0.10-renderer verification (not the final main-build gate):

| Command / scenario | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` in `apps/gpuix` | 0 diagnostics |
| `bun test src/project/model/track-routing.test.ts src/project/model/project.test.ts` | 17 pass, 0 fail, 185917 assertions |
| Authored command smoke with Group and Audio | Audio routes into Group; invalid Group-to-Audio route is rejected; Group candidates contain only Main |
| Fixed-seed random grouping trees | 200 trees, 17 tracks each; candidate membership agrees with command acceptance; input tracks unchanged |
| Mutation: accept a descendant | 1 failing test; restored |
| Mutation: accept an output cycle | 1 failing test; restored |

The routing increment does not connect an engine or create a second project state owner.

## Shared Arrangement colors

The shared `DerivedThemeColors` owns Arrangement colors. Headers use `arrangementSurfaceAlt`, lanes use `arrangementSurface`, borders use `arrangementLine`, authored content ink uses `arrangementClipInk`, and Mixer fill uses `arrangementVolume`. Meter signal/peak colors consume `arrangementMeterGood/Warn/Danger/Peak`; zero-dB and stereo cutouts use the same `arrangementSurfaceAlt` as the header. The unlit meter well keeps Web's `muted` background. Local base color fields and their redundant wiring assertions have been deleted.

Authored track/group/clip colors remain token strings. Menus consume the shared `CONTENT_PALETTE`; drawing consumes `resolveContentColor` / `contentFill`. The local token table and 68/32 mixing helper have been deleted. A native menu/snapshot/theme-switch regression proves the stored token survives and the rendered identity follows the new theme; a literal-write mutation fails that regression.

The coordinator-provided Live frames show routing input activity but no illuminated output meter bars; yellow/red, peak strips and output-meter separator widths cannot be sampled reliably from them. They are not evidence of a Live meter-color match.

## Native stereo meters

`meter/TrackMeter.tsx` reads only the injected `TelemetryReader` (`() => BackendTelemetry | null`). Missing tracks and disconnected telemetry remain at the existing B1 display floor. C1's −120 dBFS silence is clamped for display by the shared `meterDb` function; no simulated levels or second transport clock are introduced. Peak state is local, non-serialized and reset on backend session changes. Hold and fall behavior reuse `core/meters/meter-peak.ts`.

`TrackTelemetryProvider` owns one accepted-level subscription and one shared meter driver for the track surface. It drives decay through F1 `useAnimationFrame`; all timer code and the old default singleton are deleted. Frame subscription is active only while peaks remain above the floor and ends on silence or unmount. Reader callbacks stay in a committed ref, so callback identity changes do not reset held peaks. Track/backend/driver lifetime changes do reset them.

The driver consumes F1 callback timestamps directly. Wakeups only request a frame for a live signal/held peak; they do not advance a separate clock. The optional test driver and `now` injection have been deleted. Meter tests exercise this same provider/hook/driver path through the canonical `AnimationFrameSource`; disabling the production subscription produces two failures.

`TrackLabels` is injected, with paired Chinese/English resources in `locales.ts`; no i18n dependency or second language state was added to project components.

### Exercised proof

- `bun test src/project/sections/arrangement/tracks/meter`: 6 pass, 0 fail, 40 assertions, covering production frame activation, native timestamp hold/fall, silence/unmount unsubscribe and inline-reader preservation.
- Initial C1 window, before F1 frame integration: AX playback changed Stopped → Playing; Audio reported L −23.0 / R −27.0 dBFS, Group L −26.0 / R −28.5, Return L −38.0 / R −45.0. A real authored Clip gain change to 24 dB produced Audio L +1.0 / R −1.8 dBFS while Main remained at low output level.
- Evidence: `evidence/2026-10-15-real-meter-playing.ax.txt` and `evidence/2026-10-15-real-meter-overload.ax.txt`.
- The display layout changed during this run; screenshots were black and a display capture reported `InvalidCoordinateFrame`. AX proves the command/telemetry path, not the missing meter pixels. The service was killed after 1m55s; visual meter-state verification remains pending.
- Production-frame smoke at `8d34ed1`: AX changed Stopped → Playing → Stopped, but all meters stayed at the floor and window capture was black despite granted permissions and an unlocked/awake display. The service was killed after 1m25s. This attempt does not prove live signal or peak-decay pixels; see `evidence/2026-10-15-production-frame-smoke.ax.txt` and the matching black screenshot.
- The later G1 slot produced a clear real-WAV meter image and native cursor restore readback at exactly the press anchor. The background-frame state is not classified: key/main, occlusion and callback counts were not recorded. Peak-decay visuals remain incomplete. Exact results and the late-shutdown incident are in [VERIFICATION.md](VERIFICATION.md).

## Track header controls

`TrackIdentity`, `TrackRouting`, `TrackMixer` and `TrackMenu` consume the existing project selectors, commands and session-fenced edit gestures. Names edit inline; ordinary selection does not open another panel. Routing candidates reuse the shared model predicate. Group reserves a non-interactive arm slot, Return exposes Pre/Post and disables its self-send, Main exposes independent cue level/output, and MIDI retains volume/pan by the explicit product decision.

Header geometry uses the shared 304px control column: identity 100px, routing 74px, and the remaining 130px for Mixer. Each region owns its own token padding; the overall header has none. Sends fill three equal-width columns before a new row. Native raster allocation may divide a 97px row as 32/33/32; tests require width conservation and each column within 1px of the ideal fraction.

Native screenshot inspection caught a context-menu host shrinking the composite row to content width. Explicit full-size column/stretch layout on the existing `ContextMenu` root fixed it; the width regression changed from 360px to the full 1000px viewport. Dark-track title ink was corrected to the theme's dark surface color so it remains readable on lightened authored track colors. Initial and repaired images are in `evidence/2026-10-15-initial-width-defect.png` and `evidence/2026-10-15-layout-fixed.png`.

The first A3b increment is consumed: routing and automation selectors use shared `fill`; plain level/send/pan controls use shared `hideIcon`, while Main cue retains its Headphones icon. NumericPad actual inner-width fill/bipolar geometry, wheel ancestor isolation and secondary-click/ancestor-key menu activation still need A3b's second increment. Shift+F10 menu access works. Owned resize keys consume their events; shared failure regressions remain enabled. Final screenshots and system interaction checks are still pending.

## Track gestures

`useTrackResize` uses only `project/layout`'s height, step and reveal thresholds. Ordinary tracks resize from the bottom; Return/Main resize from the top with reversed vertical direction. The separator is a transparent hit region with a resize cursor, not a hover card. Continuous authored height changes use the existing session-fenced edit gesture; Escape, blur, application deactivation and unmount cancel its preview. Application activation is injected through the existing `PanelEnvironmentProvider` port.

`useTrackReorder` holds only pointer baseline, source/target IDs and drop highlight. It consumes B1's drag threshold and the renderer's native `getElementBounds`; product code and tests do not add 0.10 padding/border compensation. The whole hovered row selects the existing insert-before target, not separate before/after half-rows. Document order changes only on release through `projectActions.reorderTrack`. Escape and application deactivation clear the gesture without a history entry. Group moves preserve their branch and routing through the existing command.

Native behavior checks: captured reorder, cancellation and Group branch moves passed 3 tests with 8 assertions. Cmd removal and Shift range selection passed a separate regression. `onFocusTrack` reports inline editor focus only; invoking it after ordinary additive selection had incorrectly reselected a just-removed track and was removed from that path.

The hook contract regression renders a synthetic test container through the real native renderer, with border 3 and padding 12. Drops one pixel above and below an adjacent-row boundary must produce two distinct non-original document orders. The production `TrackRows` container has no padding or border, so removing its legacy shim does not change its current geometry. The regression protects the native-coordinate contract; the eight repaired geometry assertions concern the old test helper. No Main/list-end semantics were changed.

Selection/editing handlers consume Enter/F2, resize consumes its arrow keys, and active cancellation consumes Escape. Name input keeps its keys inside the native editor; Space on non-editable controls remains available to the trailing window transport owner. Native name-input isolation and Tab order passed 2 tests with 7 assertions. Native mixer wheel, captured commit/cancel and disabled self-send passed 3 tests with 10 assertions; wheel simulation uses 16 pixel units per shared step, not line units.

Native rename opts into F1 `selectAllOnFocus`. Direct typing after F2 now replaces the existing name without synthesizing Cmd+A. The autofocus/input-Space/Tab subset passes 3 tests with 8 assertions.

Container Enter actions check native focus ownership, not `event.elementId`: native ancestor callbacks report the handler node's ID. Fold controls and lane-slot children therefore keep their own selection behavior. A native slot test proves Cmd click and Enter preserve child-controller selection; the real lane implementation remains a cross-slice integration check. Rows read full topology only inside range-selection handling rather than subscribing to every track edit.

`Row/interaction.test.tsx` is slightly over 600 lines because one native-root fixture covers the migrated Web matrix and the capture/selection/keyboard/slot transitions. Keeping the fixture local avoids exporting test-registration side effects or duplicating project hydration. Production modules remain below the threshold; no file approaches 1000 lines.

All icons now use `ui/controls/Icon` (`Headphones`, `Circle`, `ChevronDown`, `ChevronRight`); there is no locally authored SVG markup or font-glyph icon. Keyboard focus uses the native `focusVisible` inset outline without changing track geometry.

## 公共接口

`index.ts` exports `TrackRows`, `TrackRowsProps`, `TrackResizeOverlay`, `TrackResizeOverlayProps`, `TrackLabels`, `TelemetryReader`, `TrackRowGeometry` and the paired `trackResources`. The combination contract is `docs/architecture/gpuix-arrangement-composition.md`; tracks do not import lane or timeline.

`TrackRow` 对所有可见行（包括折叠 Group）始终挂载 `renderLane` 提供的内容。Group 摘要仅由 lane 绘制；tracks 不再拥有独立摘要实现或重复扣除 `controlsWidth`。屏外保焦点的表头仍不挂载 lane。

```ts
TrackRows({ scene, viewport, focusedTrackId, onFocusTrack, telemetry, renderLane, labels })
TrackResizeOverlay({ scene, viewport, labels })
```

- `scene` / `viewport`: the existing B1 `ArrangementScene` / `ArrangementViewport`; no second writable viewport or project is created.
- `renderLane(row)`: the composition root supplies lane-only content. Geometry is the existing `core/layout.TrackRow` (exported here as `TrackRowGeometry`); lane content must not draw track borders.
- `focusedTrackId`: preserves one offscreen header while its lane content remains unmounted. `onFocusTrack(id)` reports inline-name editing focus; ordinary lane/header selection remains owned by `projectActions.selectTracks` and its explicit surface.
- `telemetry`: accepted backend telemetry reader; `labels`: immutable translated strings supplied by the composition root.
- Mount `TrackRows` inside F1 `AnimationFrameProvider` using `createAnimationFrameSource(renderer)` at the composition root. The demo also injects native activation through `createWindowPlatform(renderer).subscribeApplicationActive`; no sampled activation singleton remains.
- `TrackResizeOverlay` 与 `TrackRows` 在同一个 Scene 坐标父节点中显式组合，Y 原点包含标尺，宽度为 `viewport.width + controlsWidth`。组合根把它放在稳定 lane 输入层之后，只有分隔条矩形接收命中，没有覆盖整面的 wrapper。
- `TrackRows` 与 overlay 共用 `useTrackRowLayout`。空闲条只挂载边界的可见交集。活动 resize 保留按下时的透明 hitbox 和唯一 hook，直到释放或取消；即使边界或行随拖动离屏，也不销毁捕获。普通轨道从底部、Return/Main 从顶部调整，Escape、blur、失活和 epoch 仍取消。

`TrackRow` owns the whole track: lane on the left, then colored identity, routing and Mixer on the right, following the observed Live order. It owns the single outer top/bottom border. Group frames span the visible branch, rails are painted above row borders, expanded groups do not duplicate descendant previews, and folded groups render a shared-geometry descendant overview.

Group frame calculation indexes last descendant rows in one memoized pass over row ancestry, then reads the result for visible group IDs. A parent header can unmount while its frame still wraps visible descendants. There is no per-frame-group scan of all tracks and no second hierarchy model or shared API.

Collapsed Audio fade masks belong to Clip titles in lane's `ClipFades`, using B1's real fade metadata and hidden folded handles. `TrackIdentity` has no independent static fade decoration. Older layout screenshots are historical geometry evidence, not current fade or theme acceptance.

Visibility and reorder hit candidates share one projection. Return/Main remain bottom-anchored; when they exceed the available height, the pinned viewport is clipped below the reserved top gap and hidden pinned headers unmount. No offscreen lane content is retained solely to preserve an editor.

Native test windows can be smaller than requested: a requested 1200px height was accepted as 1021px after the display change. Behavior tests now obtain the accepted size through `useWindowSize`, just like the real demo, so pinned controls are not falsely tested outside the native hit region.

## Prototype cutover

The ten files under `features/track-mixer` are removed. LSP reference checks found no external consumers of its exported controls or formatters. Its captured-drag lifetime, controlled toggle state, volume fill and bipolar pan behavior are now provided by the shared A3 controls consumed above, rather than retained as a second UI family. The old demo's independently writable `Track[]` is not carried forward: the new verification entry authors the real project store and acquires the native backend explicitly.

## Verification entries

From `apps/gpuix` after the repository's native build:

```sh
bun --hot src/project/sections/arrangement/tracks/demo.tsx
bun src/project/sections/arrangement/tracks/verification/render-cost.tsx
bun test src/project/sections/arrangement/tracks
```

The demo is a composition root, not another project implementation. It authors the project store, acquires the real native backend and uses the repository's real probe WAV. Its lane slot is a read-only Clip projection for verifying track geometry, not an implementation of the separate clip-lane slice. Main is attenuated for validation; the overload button edits real Clip gain through the public command. Theme and language controls only affect the verification surface. Use a named service and kill it immediately after capturing AX/screenshots.

The temporary stdout telemetry and cursor-readback wrapper used for the G1 slot have been removed after evidence collection. They are not current demo features. The existing Frame stats button only displays native frame statistics, and the composition root injects `nativeCursorLock` directly. Historical readbacks remain in `evidence/`. Reserve foreground access through the coordinator before a desktop slot; do not request interactive `computer.control.acquire` inside a bounded slot.

`render-cost.tsx` runs the native test renderer, measures actual draw statistics and retained/mounted nodes for 20 versus 2000 source tracks, and asserts all nodes are released after unmount. The current first-increment run confirms clipping keeps node counts independent of source count. Exact frame timings and raw evidence are in [VERIFICATION.md](VERIFICATION.md); this single run is not a speedup or stable-frame-rate claim.
