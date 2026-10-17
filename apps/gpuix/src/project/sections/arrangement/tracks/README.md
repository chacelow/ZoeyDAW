# Arrangement tracks

## Routing legality

`project/model/track-routing.ts` owns `canRouteTrack(sourceId, destinationId, tracks)` and `routingDestinations(track, tracks)`. Both the routing menu and `adapters/runtime/track-routing.ts` use the same decision. Internal targets must be Group or Main, cannot be the source or its descendant, and cannot close an output cycle. `none` and `external` remain legal terminal destinations. Checking candidates does not alter the document.

Candidate projection builds one ID index and descendant set per source, then shares the same indexed predicate with authored route validation. The component memoizes unchanged inputs; there are no repeated linear track searches inside candidate walks.

## Shared Arrangement colors

The shared `DerivedThemeColors` owns Arrangement colors. Headers use `arrangementSurfaceAlt`, lanes use `arrangementSurface`, borders use `arrangementLine`, authored content ink uses `arrangementClipInk`, and Mixer fill uses `arrangementVolume`. Meter RMS and translucent instantaneous peak use `arrangementMeterGood`; hold lines use `arrangementMeterPeak`. An overloaded channel lights its entire above-zero region with saturated `arrangementMeterClip`. The unlit well uses `muted`. TrackMeter integrates RMS in the power domain using `meter.rmsIntegrationMs` on the existing telemetry frame driver, and resets RMS and hold on session changes. Main Out embeds main-track telemetry in the dropdown leading slot. Cue Out stays silent because the engine has no cue bus.

Authored track/group/clip colors remain token strings. Menus consume the shared `CONTENT_PALETTE`; drawing consumes `resolveContentColor` / `contentFill`, so the stored token survives a theme switch and the rendered identity follows the new theme.

## Native stereo meters

`meter/TrackMeter.tsx` reads only the injected `TelemetryReader` (`() => BackendTelemetry | null`). Missing tracks and disconnected telemetry stay at the display floor; the engine's −120 dBFS silence is clamped for display by the shared `meterDb` function. Peak state is local, non-serialized and reset on backend session changes. Hold and fall reuse `core/meters/meter-peak.ts`.

`TrackTelemetryProvider` owns one accepted-level subscription and one shared meter driver for the track surface. It drives decay through `useAnimationFrame`, subscribing only while peaks remain above the floor. Reader callbacks stay in a committed ref, so callback identity changes do not reset held peaks; track, backend or driver lifetime changes do. The driver consumes frame timestamps directly and never advances a separate clock.

The MIDI mixer activity display replaces the audio meter for MIDI tracks because the current `Device` union contains only effects and utility devices, none of which produces audio. Its dot matrix follows `session.activeMidiNotes`, which is driven by computer-keyboard and PianoKeys note events; clip playback MIDI is not exposed as per-track note telemetry and does not drive this indicator.

`TrackRows` appends the fixed `layout.track.dropZoneHeight` to core's scroll extent, so the final drop-zone area scrolls with ordinary tracks. The label is localized and pointer-transparent because existing track reorder and lane interactions do not expose file/device drops. The sticky Return/Main boundary and row columns use `design.shape.separatorWidth` and `colors.arrangementLine`.

`TrackLabels` 注入文案与 `DisplayFormats` 纯端口。唯一文本数据在 `app/locales/sections/tracks.ts`，组合根通过 `createTrackLabels(locale)` 构造标签并在自身生命周期内复用。project 组件不导入 app、不持有第二份语言状态。Mixer 的 dB/Pan 显示和解析、Meter 声道朗读、monitor mode 文案都消费这份输入。

Mixer 使用 `formats.pan(value, "control")`；自动化 ValueEditor 使用 `"automation"` 变体，并通过 `formats.db(value, { unit: true })` 保留单位。中心 `C` 是跨语言协议表示，文案来源由共享 formatter 统一拥有，不在业务组件另加 locale 特例。

## Track header controls

`TrackIdentity`, `TrackRouting`, `TrackMixer` and `TrackMenu` consume the existing project selectors, commands and session-fenced edit gestures. Names edit inline; ordinary selection does not open another panel. Routing candidates reuse the shared model predicate. Group reserves a non-interactive arm slot, Return exposes Pre/Post and disables its self-send, Main exposes independent cue level/output, and MIDI retains volume/pan by the explicit product decision.

Header geometry uses the shared 304px control column: identity 100px, routing 74px, and the remaining 130px for Mixer. Each region owns its own token padding; the overall header has none. Sends fill three equal-width columns before a new row. Native raster allocation may divide a 97px row as 32/33/32; tests require width conservation and each column within 1px of the ideal fraction.

The composite row uses explicit full-size column/stretch layout on the `ContextMenu` root so the host does not shrink the row to content width. Dark-track title ink uses the theme's dark surface color so it stays readable on lightened authored track colors.

Routing and automation selectors use shared `fill`; plain level/send/pan controls pass no icon, while Main cue keeps its Headphones icon. Shift+F10 opens the track menu. Owned resize keys consume their events.

## Track gestures

`useTrackResize` uses only `project/layout`'s height, step and reveal thresholds. Ordinary tracks resize from the bottom; Return/Main resize from the top with reversed vertical direction. The separator is a transparent hit region with a resize cursor, not a hover card. Continuous authored height changes use the existing session-fenced edit gesture; Escape, blur, application deactivation and unmount cancel its preview. Application activation is injected through the existing `PanelEnvironmentProvider` port.

`useTrackReorder` holds only pointer baseline, source/target IDs and drop highlight. It consumes core's drag threshold and the renderer's native `getElementBounds`. The whole hovered row selects the existing insert-before target, not separate before/after half-rows. Document order changes only on release through `projectActions.reorderTrack`. Escape and application deactivation clear the gesture without a history entry. Group moves preserve their branch and routing through the existing command.

`onFocusTrack` reports inline editor focus only, so additive selection never reselects a just-removed track.

Selection/editing handlers consume Enter/F2, resize consumes its arrow keys, and active cancellation consumes Escape. Name input keeps its keys inside the native editor; Space on non-editable controls remains available to the trailing window transport owner. Mixer wheel simulation uses 16 pixel units per shared step.

Native rename opts into `selectAllOnFocus`, so direct typing after F2 replaces the existing name.

Container Enter actions check native focus ownership, not `event.elementId`: native ancestor callbacks report the handler node's ID. Fold controls and lane-slot children therefore keep their own selection behavior. Rows read full topology only inside range-selection handling rather than subscribing to every track edit.

All icons use `ui/controls/Icon`. Keyboard focus uses the native `focusVisible` inset outline without changing track geometry.

## 公共接口

`index.ts` exports `TrackRows`, `TrackRowsProps`, `TrackResizeOverlay`, `TrackResizeOverlayProps`, `TrackLabels`, `TelemetryReader` and `TrackRowGeometry`. Locale data is not re-exported from project. The combination contract is `docs/architecture/gpuix-arrangement-composition.md`; tracks do not import lane or timeline.

`TrackRow` 对所有可见行（包括折叠 Group）始终挂载 `renderLane` 提供的内容。Group 摘要仅由 lane 绘制；tracks 不再拥有独立摘要实现或重复扣除 `controlsWidth`。屏外保焦点的表头仍不挂载 lane。

```ts
TrackRows({ scene, viewport, focusedTrackId, onFocusTrack, telemetry, renderLane, labels })
TrackResizeOverlay({ scene, viewport, labels })
```

- `scene` / `viewport`: the core `ArrangementScene` / `ArrangementViewport`; no second writable viewport or project is created.
- `renderLane(row)`: the composition root supplies lane-only content. Geometry is the existing `core/layout.TrackRow` (exported here as `TrackRowGeometry`); lane content must not draw track borders.
- `focusedTrackId`: preserves one offscreen header while its lane content remains unmounted. `onFocusTrack(id)` reports inline-name editing focus; ordinary lane/header selection remains owned by `projectActions.selectTracks` and its explicit surface.
- `telemetry`: accepted backend telemetry reader; `labels`: immutable translated strings supplied by the composition root.
- Mount `TrackRows` inside `AnimationFrameProvider` using `createAnimationFrameSource(renderer)` at the composition root. The demo also injects native activation through `createWindowPlatform(renderer).subscribeApplicationActive`; no sampled activation singleton remains.
- `TrackResizeOverlay` 与 `TrackRows` 在同一个 Scene 坐标父节点中显式组合，Y 原点包含标尺，横向用 `width: 100%`/`right: 0` 跟随父节点原生布局，不用 JS 测得的 `viewport.width` 推算总宽，否则面板拖动时轨道头会比时间线晚一帧对齐。组合根把它放在稳定 lane 输入层之后，只有分隔条矩形接收命中，没有覆盖整面的 wrapper。
- `TrackRows` 与 overlay 共用 `useTrackRowLayout`。空闲条只挂载边界的可见交集。活动 resize 保留按下时的透明 hitbox 和唯一 hook，直到释放或取消；即使边界或行随拖动离屏，也不销毁捕获。普通轨道从底部、Return/Main 从顶部调整，Escape、blur、失活和 epoch 仍取消。

`useTrackRowLayout` 向 core 传入完整 `scene.geometry`，上下边界使用其中的 arrangement ruler 几何；固定轨道高度仍只依赖 track 几何。Group frame 使用 `design.shape.controlBorderWidth`，Group rails 使用 `design.editor.dividerStrokeWidth`，插入线使用 `design.editor.insertionLineWidth`，名称字重使用 `design.typography.weights.medium`。拖动与 resize 的 cursor 经 `design.cursors` 解析，其中 resize 保留原来的 `ns-resize`，读取 `verticalResize`。

轨道行、Identity 与 resize separator 的焦点环读取 `design.shape.focusRingWidth`，内缩 offset 由该宽度取负。轨道上下边框仍平分 `project.trackBorder`，焦点环不再借用轨道边框宽度。

`TrackRow` owns the whole track: lane on the left, then colored identity, routing and Mixer on the right, following the observed Live order. It owns the single outer top/bottom border. Group frames span the visible branch, rails are painted above row borders, expanded groups do not duplicate descendant previews, and folded groups render a shared-geometry descendant overview.

Group frame calculation indexes last descendant rows in one memoized pass over row ancestry, then reads the result for visible group IDs. A parent header can unmount while its frame still wraps visible descendants. There is no per-frame-group scan of all tracks and no second hierarchy model or shared API.

Collapsed Audio fade masks belong to Clip titles in lane's `ClipFades`, using core's fade metadata and hidden folded handles. `TrackIdentity` has no independent static fade decoration.

Visibility and reorder hit candidates share one projection. Return/Main remain bottom-anchored; when they exceed the available height, the pinned viewport is clipped below the reserved top gap and hidden pinned headers unmount. No offscreen lane content is retained solely to preserve an editor.
