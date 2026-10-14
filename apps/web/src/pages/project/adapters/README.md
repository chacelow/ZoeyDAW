# Project state adapter

`index.ts` is the UI's project data interface. `useProjectState(selector)` reads the composed Zustand root; `projectActions` issues synchronous, optimistic domain commands. `document` contains authored project data, `workspace` contains view geometry and editor preferences, and `session` contains playback, selection, meters, backend status and undo availability.

## Backend registration and lifecycle

`model/backend.ts` defines the engine port and DTOs. `createProjectRuntime({ store, backendFactory?, createProject? })` constructs a coordinator around a store's `getState`/`setState` capabilities; separate stores produce separate editing/resource owners. Construction and public module import do not open a backend. `context.ts` composes the current single-project instance; it does not contain another implementation.

`configureProjectBackend(factory, options?)` installs an implementation and returns an idempotent cleanup. Registrations form a stack; removing an older registration does not replace the active one. While idle, registration and hydration only update data/configuration. With an acquired runtime they replace the connection, cancelling temporary edits and preserving the committed document. A factory creates a fresh backend for each engine session.

`options.createProject(projectId)` returns a synchronous `ProjectSeed` containing `document` and `workspace` for a new route. Without that callback an external registration starts with the empty store defaults, including only Main. The built-in mock registration supplies demo tracks and media. Switching registrations does not silently discard an already-open project. Load parsed project data with `hydrateProject(json)` after any asynchronous file read.

`setProjectStorageId(projectId)` isolates editing ownership and snapshot keys on route changes; it does not auto-load a snapshot. The project view explicitly acquires `startProjectRuntime()` after route initialization. First acquisition opens/subscribes; the last release cancels unfinished edits, retains independent authored recording, stops playback and disposes the backend. Idle authored edits and undo do not acquire an engine; recording and acknowledged snapshot saving require an active, accepted runtime.

`session.editEpoch` is a subscribable editing identity independent of engine `sessionId`. Tokens, controls and Canvas use it while live or idle; hydration/open/release invalidate old ownership. Engine acknowledgements and telemetry retain their protocol/session fences. `runtime/` owns the coordinator; `backend/connection/` exposes the connection interface and keeps protocol validation and interpolation in separate pure files.

The default `createMockProjectBackend()` produces a musical clock and deterministic visual stereo levels. It produces no audio, loads no sample files and imports no Rust/Tauri API. Demo `mock://` references are fixtures only. Newly created audio clips have no source, not a fabricated file reference.

## Commands, confirmation and recovery

`apply(request)` returns a `BackendResult` synchronously or asynchronously. Requests carry protocol version 1, `sessionId`, monotone `sequence`, `baseRevision`, target `revision`, stage, optional edit ID and a complete effective `BackendState`. The connection serializes requests, coalesces queued previews for the same edit, and removes those queued previews on cancellation.

| Stage       | Applied state                                         | Durable revision       |
| ----------- | ----------------------------------------------------- | ---------------------- |
| `open`      | Initial project and transport control                 | Starts at zero         |
| `preview`   | Temporary effective project                           | Unchanged              |
| `commit`    | Authored edit, undo or redo                           | Advances on acceptance |
| `cancel`    | Project without the temporary edit                    | Unchanged              |
| `transport` | Play, record, seek or held-note control               | Unchanged              |
| `recover`   | Last accepted project plus retained independent edits | Advances on acceptance |

The implementation applies a request atomically before acknowledging it. An accepted result echoes the session and sequence and reports the accepted revision. A rejection leaves the previous accepted state intact. Promise rejection or a thrown `apply` becomes a connection failure; malformed or mismatched results become protocol failures. There is no automatic timeout or generic retry policy.

On failure the runtime drops queued dependent edits, restores the accepted document and history, preserves current viewport/preferences and independent recording edits, and sends a recovery state. `session.backend` exposes phase, pending count, accepted revision and error; the Arrangement toolbar displays pending/error feedback. Successful recovery permits saving again while retaining the error indication until a later commit succeeds. `whenProjectBackendIdle()` waits for the current session's queue to settle and returns false for an unrecovered failure or disposed session.

The engine DTO excludes names, colors, view geometry, waveform caches and PCM buffers. It includes timing, routing, mixing, automation, source windows, MIDI/Pattern content and fade metadata. `BackendAudioClip.sourceId === null` denotes an empty, silent clip. Other source IDs refer to entries in `project.sources`, currently keyed by URI. Musical coordinates are one-based bars; MIDI beats use the document meter-beat convention. Fade metadata is not an implemented DSP algorithm.

## Editing and rendering

Canvas gestures use `beginPreview()`, `previewTracks()` / `previewMarkers()` / `previewLoop()`, then `commitPreview()` or `cancelPreview()`. The runtime owns the effective edit and backend stream. `getEffectiveDocument()` projects the current temporary state; Canvas Scene consumes that projection rather than owning a second editable document. Shared Clip move/resize and automation projections keep preview and commit placement identical.

Continuous controls use `useProjectEditGesture(onChange)`, which owns a session-scoped token and guards value updates as well as `beginEdit`, `endEdit` and `cancelEdit`. Rejected or stale gestures cannot turn later pointer movement into unowned commits. A stale component cleanup cannot commit or cancel another control's edit. A completed gesture creates one undo entry; cancellation restores authored values without resetting viewport movement. Explicit workspace toggles are undoable, but pan/zoom/scroll, playback, selection and edit focus are not. Undo/redo uses the same backend commit path and preserves a surviving Clip editor.

## Telemetry and native integration

`subscribe(listener)` publishes `BackendTelemetry` with its own monotone sample sequence and `appliedSequence` identifying the applied command. The connection validates clocks and finite stereo dBFS levels, buffers telemetry arriving before its acknowledgement, and rejects stale sessions, samples and seek/play control generations. `readProjectTelemetry()` and `readTransportBar()` expose this same accepted stream to playhead, meters, Follow and recording. Display interpolation is capped at 250ms and wraps at the accepted loop; it does not create a second engine clock.

A provider can report a musical clock or a sample clock with frame and sample rate. Rust and third-party integrations implement this port behind their own transport, parsing IPC data at that boundary. The provider owns realtime processing, decoding, media resolution and cancellation/disposal of its resources. Emit silence as finite dBFS values. Never publish PCM or synchronously invoke WebView work from an audio callback. The Canvas `audio/project-telemetry.ts` writer adapts runtime frames to local display slots; these slots are not a verified native shared-memory protocol.

Keyboard note input uses the same transport control and accepted clock. Armed tracks retain simulated monitoring. `readRecordingBar()` permits short authored MIDI notes only while play/record and the seek generation are accepted; input during an unconfirmed seek does not write a note at the optimistic UI position. Independent recorded notes survive a cancelled control edit, including a Clip drag that returns to its origin before continuing. This remains a Web prototype, not audible MIDI or audio recording. Native audio, plugin hosting, device configuration and file persistence are not implemented by this change.

## Snapshots and source data

`serializeProject()` returns version-2 JSON containing committed `document` and `workspace` only. Temporary numeric edits and Canvas previews do not leak into saves. `hydrateProject(json)` validates and clones the complete payload before replacing state and resetting session/history. Invalid JSON, version or schema leaves the current project intact.

Toolbar Save and Cmd/Ctrl+S capture the current committed revision and wait for its backend acceptance before writing the route's localStorage snapshot. A newer edit is not marked clean by that older save. Project switching cancels the pending save. Toolbar Load returns false and sets `session.snapshotError` for missing, invalid or unavailable storage. These are prototype snapshots, not `.zdaw` files or background autosave.

Restore requires exactly one Main output with ID `main`. Audio tracks own audio clips; MIDI tracks own MIDI or Pattern clips. Group, Return and Main cannot own clips. Commands and snapshot validation share `acceptsClip`.

Audio `waveformPeaks` are derived visual data and are omitted from snapshots and engine DTOs. Known demo references regenerate previews; unknown sources and empty clips display no generated waveform. Clip trim/split retains authored source data and changes `sourceOffsetBars`; MIDI notes, Pattern phase and preview share that window. Fade duration, offset, curve and midpoint fields remain saved metadata with the existing interval constraints.

`session.drawModeOverride` represents a held B key independently of the latched `workspace.drawMode`. `model/interaction-mode.ts` resolves the effective mode for Header, Toolbar, automation and MIDI editing. Holding B during a gesture creates no preference undo entry. Undo and redo preserve an open clip editor if its clip survives the restored document; removing that clip closes the editor.

## Timeline geometry

`../model/selectors.ts` derives the document's timeline extent from every clip end, marker, loop boundary, and automation point. The minimum view is 128 bars, with 16-bar rounding and trailing editing room. The viewport controller also accommodates the current playhead and time selection. Extent is derived data and does not enter snapshots.

`../sections/ArrangementPanel/Timeline/Viewport/useTimelineViewport.ts` shares measured zoom and logical scroll with MiniMap and both rulers. `TimelineCanvas.tsx` composes the viewport, toolbar, painters, headers and editors. `canvas/layout.ts` supplies row positions to painting, hit testing and headers. Normal tracks scroll together; Return and Main stay above the bottom ruler. MiniMap retains source Clips when groups fold. Its percentage-based frame maps logical musical bars, not a document-wide DOM canvas or physical scrollbar. Extreme zoom and far-bar navigation still allocate only the visible canvas size.

`workspace.grid` stores adaptive density or explicit fixed bars. `deriveGridPlan()` projects preference, zoom and meter into `scene.gridPlan`; drawing and snapping share `cellBars`. Ctrl/Cmd+1 and +2 change the stored grid choice. Numbered ruler ticks define the independent major-line layer; remaining lines come only from current grid cells, without unconditional beat or bar subdivisions. Background shading remains independent. Version 2 snapshots store the union; version 1 `gridBars` values migrate at the input boundary.

The MiniMap frame resizes independently from either edge, pinning the opposite musical boundary. Body dragging pans horizontally and shrinks the frame on downward travel or expands it on upward travel. Zoom preserves the pressed position's horizontal ratio inside the frame, rather than always anchoring its center. Clicking outside centers it at the click; double-click fits the project. The gesture uses a fixed pointer-down baseline and frame-coalesced updates. Browser Pointer Lock or the existing native cursor-positioning API hides and anchors the cursor. Native release waits for the last recenter, then restores the original location before revealing it. A pending restore prevents another drag from accepting input until its warp settles. Escape, blur, cancellation and unmount restore the initial viewport.

The overview spans the full Arrangement width without a separate debug area. It retains Group and empty source-track rows, including children of folded groups, and excludes Return and Main. Solid Clip bands, row dividers, locators and the transport position use the same bar coordinates. Semantic `--arrangement-overview-*` tokens in `project.css` inherit the shared theme and distinguish these elements without brightening the timeline grid. Canvas and DOM share those tokens.

The overview height uses the shared resizable `Group`, `Panel`, and `PanelDivider`. Its default and minimum are 32px, its maximum is 90px, and the timeline retains at least 160px. The separator supports pointer dragging and keyboard resizing without starting a MiniMap navigation gesture.

Canvas backing-store resize and repaint occur synchronously in `ResizeObserver` for the scene, playhead, and track meters. Unchanged pixel dimensions do not reset the backing store. The shared scheduler still coalesces ordinary state changes.

Clip titles select cards, set their playback origin to the Clip start, and initiate movement. Only the half-transparent Ghost is visually active during movement; the source remains in place and inactive until release. Movement and Fade gestures retain their last valid preview on invalid destinations or capture interruptions; Escape cancels. Resizing preserves its cancellation behavior. See the [rendering architecture](../../../../../../docs/architecture/rendering.md) for Canvas projection and the native telemetry boundary.

The insertion point is independent from moving transport position. Space starts from that anchor. Stopped insertion draws a track-local line and ruler marker; playing draws the full-height transport line. `paintClipAlignment` independently adds a neutral full-height editing guide, at the Ghost's left edge during movement or the grabbed edge during resizing. It does not seek or replace playback. Resizing commits its playback origin at the Clip's left start, regardless of the grabbed edge. Simulated ticks never overwrite the insertion point.

Space is claimed before focused buttons and menus in capture phase; native keydown/keyup activation is suppressed, repeat does not toggle transport twice, and focus is released from non-editable controls. Text fields, contenteditable, IME, modifiers and Enter retain their existing behavior.

Normal card activation, creation and rename update selection/focus without opening Clip View. `session.editingClipId` retains a single Clip editor focus through undo; `session.clipEditorRequest` separately signals explicit Open Clip View or close requests. Footer derives none/multiple/single selection and dispatches a single editor by kind. Clip and Device visibility belong to the shell, not document/history, and neither acquires another backend. The old 190px editor embedded in Timeline is removed.

Audio `audioSettings` stores independent playback Start/End markers (`startMarkerBars`/`endMarkerBars`), independent source-loop position/length, warp mode/source BPM, pitch metadata and reverse/loop flags. Start/End markers edit only this metadata; they never move, trim, or resize the Arrangement Clip's `startBar`, `lengthBars`, `sourceOffsetBars`, or its fades. Musical positions format as one-based bars.beats.sixteenths using the clip's actual numerator/denominator (sixteenths-per-beat = 16/denominator, so a 4/8 meter has 2 sixteenths per beat); durations are zero-based. MIDI retains complete source notes across the full 0–127 pitch range; viewport/Fold/zoom/selection stay local, and pointer edits use the existing session-fenced transaction. Shared held-B and computer-keyboard releases remain globally owned.

Track `devices` is an optional ordered, typed chain of Utility, Filter, Delay and Reverb metadata. Add/remove/order/bypass/fold/parameter edits use public track commands and normal history; validation rejects malformed values or duplicate IDs within a chain. Snapshots roundtrip both device and Audio settings. These fields describe Web prototype authoring only: the engine DTO still excludes device DSP, warp/pitch/reverse processing, PCM and media-file loading.

`canvas/clip-geometry.ts` supplies shared painting and hit geometry. `../layout` derives `TRACK_LAYOUT`, collapsed/title heights, resize steps, control-column width and row capacity from the public `@zoeymind/ui/metrics` configuration. Its CSS counterpart is generated from the same JSON and drift-checked. Timeline maps that layout to scoped variables; DOM, Canvas and hit testing share the result. Domain timeline-extent selectors remain in model. Routing progressively reveals rows that fit; folded tracks expose no body or Automation targets.

Ordinary tracks resize from their bottom boundary. Return and Main tracks resize from their top boundary, so downward motion shrinks them toward the fixed bottom edge and upward motion expands them. Keyboard arrows follow the same directions. The outer track owns both top and bottom borders, including the first ordinary track and the Return section.

`canvas/interactions/controller.ts` owns pointer capture, drag threshold, clipboard routing and autoscroll. Each autoscroll frame recomputes the preview from the current viewport. Automation mode preserves Clip-title movement while bodies edit automation. Keyboard commands in that mode do not operate on a hidden Clip selection. When Clips move in Automation mode, their interval's breakpoints move through the shared `model/clip-automation.ts` projection in both preview and commit.

Clip clipboard payloads are versioned and parsed at the input boundary. Copy, cut, paste and duplicate preserve source windows and relative lane/bar offsets while assigning new clip IDs. Clip, automation and MIDI-note clipboard codecs share one raw-text mirror; unrelated pasted text cannot revive an older clip payload. Text inputs and MIDI editors retain their native clipboard events.

Locators support snapped movement, Shift snap bypass, rename, delete and navigation. Double-click starts playback from a locator without stopping an already-running transport. Arrow keys move the selected locator rather than seeking. Loop body movement preserves length; either edge resizes independently, and Cmd/Ctrl+L creates a loop from the selected time range.

Automation uses a normalized envelope with optional per-segment curvature. Its painter and simulated meters share `model/automation-curve.ts`, including held head/tail values and empty-lane defaults. Point and segment gestures preview before committing; B draws every crossed grid cell. Numeric editing accepts parameter-specific values and shifts selected points relatively. Enter commits, Escape cancels, and menu dismissal preserves input focus.

The Arrangement lower-right label shows the effective grid, including when Automation is off. Adaptive Narrowest reaches `1/16384` notes at maximum zoom with an 8px cell in both 4/4 and 4/8. For meter `n/d`, a `1/N` note occupies `d / (n * N)` bars. All viewport and MiniMap zoom paths share the limit, while logical scroll can exceed 16 million pixels without allocating an equally large canvas. The ruler adds readable bar, beat and sixteenth labels independently of the finest grid. Clip duration floors and Float64 simulated playhead storage preserve fine positions at distant bars.

## Track control states

`session.selectedTrackIds` identifies active tracks; `session.trackSelectionSurface` distinguishes Arrangement focus from header focus. Lane, Clip and automation clicks mark Arrangement focus: the row is highlighted but no right-side identity, routing or mixer area is highlighted. Header clicks mark header focus: only the colored name/identity area uses the shared selection tint, while routing and mixer controls keep their normal appearance. There is no selection border, shadow or whole-header overlay. Clicking a lane clears any previous identity tint, including when the same track remains active. `useSceneSync` projects active IDs for row drawing; header selection does not seek the insertion point. Focus and selection remain transient and are not saved.

The track-selection command requires an explicit surface, so a new input path cannot silently reuse header-focus styling for an Arrangement click.

| Track kind | Full expanded controls | Short expanded priority | Collapsed controls |
| --- | --- | --- | --- |
| Audio | Input type/channel, monitor, output type/channel, activation, Solo, arm, volume, pan and sends | Output type/channel and first two mixer rows; input and monitor hidden | Activation, Solo, arm and meter; empty routing cell |
| MIDI | Input type/channel, monitor, output type/channel, activation, Solo, arm, volume, pan and sends | Monitor/output and available mixer rows | Activation, Solo, arm and meter; empty routing cell |
| Group | Output type/channel, activation, Solo, volume, pan and sends; reserved empty arm slot | Output type/channel, activation, Solo, reserved arm slot, volume and pan | Activation, Solo, reserved arm slot, meter and descendant overview; empty routing cell |
| Return | Output type/channel, lettered activation, Solo, Pre/Post, volume, pan and sends | Output type/channel and first two mixer rows; sends hidden | Lettered activation, Solo, Pre/Post and meter; empty routing cell |
| Main | Cue output, main output, main level, headphone-marked cue level and pan; no activation, Solo or arm | Both output rows, main/cue levels and pan | Main output, main level, cue level and meter |

Internal destinations leave the secondary output row blank and disabled. Return self-send is displayed disabled to prevent feedback. Input/output channels, cue output/level, per-return sends and Pre/Post are document state and survive snapshot roundtrips. Old Audio input channel IDs migrate to the external input route plus a separate channel at the snapshot boundary. These controls edit the Web prototype; they do not imply a connected audio engine or hardware routing.

`trackControlRows` derives control capacity from the same row-height unit as resizing. Routing progressively restores input and secondary-output rows as height increases. Send controls render only when they fit, so hidden rows cannot retain keyboard focus outside their track. The state smoke captures full, short and collapsed states for all five track kinds.

Group's arm slot is empty and non-interactive; its activation width matches Audio and MIDI rather than expanding into that slot. Track meters share the compact-control width and read existing stereo dBFS telemetry. The Canvas painter shows −60 to +6 dB, a 0 dB line, a green-to-yellow gradient below unity, and red overload above unity. Per-channel peak markers hold for 600ms and then fall at 24 dB/s, including after playback stops. Peak state is local to each meter and never serialized.
