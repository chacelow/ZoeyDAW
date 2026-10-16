# Project state adapter

`index.ts` is the UI's project data interface. `useProjectState(selector)` reads the composed Zustand root; `projectActions` issues synchronous, optimistic domain commands. `document` contains authored project data, `workspace` contains view geometry and editor preferences, and `session` contains playback, selection, meters, backend status and undo availability.

The model remains DOM-free. The project adapter reaches Rust through `platform/engine.ts`; it does not decode media or move PCM through JavaScript. The application must install a snapshot-storage port separately before saving.

## Backend registration and lifecycle

`model/backend.ts` defines the engine port and DTOs. `createProjectRuntime({ store, backendFactory?, createProject? })` constructs a coordinator around a store's `getState`/`setState` capabilities; separate stores produce separate editing/resource owners. Construction and public module import do not open a backend. `context.ts` composes the current single-project instance; it does not contain another implementation.

`configureProjectBackend(factory, options?)` installs an implementation and returns an idempotent cleanup. Registrations form a stack; removing an older registration does not replace the active one. While idle, registration and hydration only update data/configuration. With an acquired runtime they replace the connection, cancelling temporary edits and preserving the committed document. A factory creates a fresh backend for each engine session.

`options.createProject(projectId)` returns a synchronous `ProjectSeed` containing `document` and `workspace` for a new route. Without that callback, runtime defaults and external registrations start with empty store defaults containing only Main. Tests explicitly register demo fixtures through `test-setup.ts`; production composition does not import or select a mock backend. Switching registrations does not silently discard an already-open project. Load parsed project data with `hydrateProject(json)` after any asynchronous file read.

`setProjectStorageId(projectId)` isolates editing ownership and snapshot keys on route changes; it does not auto-load a snapshot. The project view explicitly acquires `startProjectRuntime()` after route initialization. First acquisition opens/subscribes; the last release cancels unfinished edits, retains independent authored recording, stops playback and disposes the backend. Release and same-project backend replacement drain recording journals exactly once before resetting connection state, including after preview and recovery both reject; hydration or project switching discards the previous project's journal. Idle authored edits and undo do not acquire an engine; recording and acknowledged snapshot saving require an active, accepted runtime.

`session.editEpoch` is a subscribable editing identity independent of engine `sessionId`. Tokens, controls and Canvas use it while live or idle; hydration/open/release invalidate old ownership. Engine acknowledgements and telemetry retain their protocol/session fences. `runtime/` owns the coordinator; `backend/connection/` exposes the connection interface and keeps protocol validation and interpolation in separate pure files.

`runtime/project-runtime.ts` assembles the unchanged public API around one `RuntimeOwner` in `runtime-state.ts`. That owner holds all mutable runtime state; `runtime-backend.ts` coordinates leases, acknowledgements, recovery and transport, `runtime-editing.ts` applies edits, history, previews and recording journals, and `runtime-saving.ts` confirms saved checkpoints. These modules share the same owner rather than synchronizing separate managers. `history.ts` and `effective-document.ts` contain value-only checkpoint/history flags and preview projections.

`context.ts` installs `createNativeBackend` through `runtime/backend-registration` as the application's default. This registration performs no native call and opens no device. The first runtime lease constructs the native session; the last release disposes it. An isolated `createProjectRuntime()` still has no implicit factory and throws `ProjectBackendNotConfiguredError` if acquired before configuration. Pure-logic tests explicitly inject `createMockProjectBackend()`, which reports a finite silence floor and never synthesizes levels. `mock://` references remain test fixtures and are rejected by the native media loader.

`workspace.metronome` is a persisted UI preference, changed through `projectActions.setMetronome()`. Missing fields in older snapshots default to `true`; invalid explicit values reject the snapshot. The Transport animation derives its phase from accepted playback position. This switch does not enable click audio: the engine currently has no metronome DSP.

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

Submitted recording entries remain pending until a commit or recovery containing them is accepted. Consecutive commit/recovery rejection replays them over the accepted checkpoint without consuming the journal, so last release and reopen retain the authored recording without duplicating it.

The engine DTO excludes names, colors, view geometry, waveform caches and PCM buffers. It includes timing, routing, mixing, automation metadata, source windows, MIDI/Pattern content and fade controls. `BackendAudioClip.sourceId === null` denotes an empty, silent clip. Other source IDs refer to entries in `project.sources`. Musical coordinates are one-based bars. Audio source offsets are signed, rounded to sample frames, and wrapped modulo decoded source length, including left extensions and exact cycle multiples. Empty PCM is silent. Rust applies clip gain and the same rational fade curve defined by the UI's anchor position and curve value.

## Editing and rendering

Canvas gestures use `beginPreview()`, `previewTracks()` / `previewMarkers()` / `previewLoop()`, then `commitPreview()` or `cancelPreview()`. The runtime owns the effective edit and backend stream. `getEffectiveDocument()` projects the current temporary state; Canvas Scene consumes that projection rather than owning a second editable document. Shared Clip move/resize and automation projections keep preview and commit placement identical.

Continuous controls use `useProjectEditGesture(onChange)`, which owns a session-scoped token and guards value updates as well as `beginEdit`, `endEdit` and `cancelEdit`. Rejected or stale gestures cannot turn later pointer movement into unowned commits. A stale component cleanup cannot commit or cancel another control's edit. A completed gesture creates one undo entry; cancellation restores authored values without resetting viewport movement. Explicit workspace toggles are undoable, but pan/zoom/scroll, playback, selection and edit focus are not. Undo/redo uses the same backend commit path and preserves a surviving Clip editor.

Track duplication treats each selected root and its descendants as one branch. Original rows remain contiguous; the complete copied branch is inserted after the original branch, with copied routing and child membership remapped. Selecting a group and one of its descendants copies that descendant only once.

## Telemetry and native integration

`subscribe(listener)` publishes `BackendTelemetry` with its own monotone sample sequence and `appliedSequence` identifying the audio callback's applied command. The connection validates clocks, finite stereo dBFS levels, and the required `outputLatencyFrames` field. It buffers telemetry arriving before its acknowledgement and rejects stale sessions, samples and seek/play control generations through `appliedSequence`. The latest requested control fence is monotone within a session, including while older queued requests dispatch. Missing latency fields are invalid; unavailable latency is explicitly `null`. Display interpolation is capped at 250ms and wraps at the accepted loop; it does not create a second engine clock.

The native provider reports a sample clock from the Rust `Transport`, not Firewheel's continuously advancing graph clock. A custom Firewheel PCM node reads its allocation-free loop segments, so a paused block consumes no source frames and a new seek starts at the requested sample. Prepared routing and PCM ownership cross threads through a triple buffer. Atomic snapshots carry instantaneous per-channel peaks and internal RMS to the control thread; only peaks are published as `levels`, with silence at -120 dBFS. Meter peak hold and decay remain UI drawing state. Rust throttles telemetry to about 30Hz before the napi `ThreadsafeFunction` call. Disposal drops the device and callback; the TS adapter ignores already-queued frames after disposal.

Keyboard note input, authored MIDI recording and accepted recording clocks retain their existing project-state behavior. MIDI/Pattern clips and held notes are stored and participate in transport telemetry but produce no audio. MIDI synthesis, plugin hosting and native recording are not implemented. Automation lanes are retained in the protocol but are not applied to DSP by this backend.

### Native session API

`@zoeydaw/native` exports the following engine functions. The adapter uses only the platform re-export. Views read waveforms through `readProjectPeaks` (a `PeakReader` from `model/backend`): the runtime forwards to whichever backend its connection currently owns, so peaks come from the same session as transport and meters, and the engine handle never leaves the adapter. With no open backend it returns an empty array.

| Export | Result and lifetime |
| --- | --- |
| `openSession(): number` | Opaque handle. The Rust control thread owns the CPAL stream and session. |
| `apply(handle, requestJson): string` | `BackendResult` JSON. Missing devices, decoding failures, invalid routing and sample-rate faults return `kind: "rejected"`. |
| `subscribeTelemetry(handle, callback): void` | Callback receives telemetry JSON. The Rust queue is bounded to one pending sample; callback failures do not panic the engine. |
| `dispose(handle): void` | Idempotent release; joins the control thread and closes its output stream. |
| `readPeaks(handle, sourceId, startFrame, endFrame, pixels): Float32Array` | Exact visible-range envelopes, never PCM. Frame coordinates are source-rate frames (the decoded sample rate reported by `sourceInfo`), not device frames. Musical ranges use `readPeaksAtBars`. |
| `sourceInfo(handle, sourceId): { sampleRate, frames, channels } \| null` | Decoded source metadata; `null` for an unknown source. |
| `readPeaksAtBars(handle, sourceId, startBar, endBar, pixels, contentOffsetBars): Float32Array` | Peaks for a musical range. Bar-to-frame conversion, the signed content offset and wrapping past the source end all happen in Rust (`source_offset_frame`, shared with the mixer). |

If telemetry registration throws after opening a native session, backend construction disposes that handle before propagating the failure; no incomplete backend escapes.

Peak output is channel-major, then pixel-major `[min, max]`: `[leftMin0, leftMax0, …, rightMin0, rightMax0, …]`. Mono sources are duplicated to stereo, so output length is `pixels * 4`. Ranges are half-open, integer and nonnegative; `pixels` is 1–16384. The source bounds crop the requested range; empty pixels contain `[0, 0]`. Local filesystem paths and `file:///` URIs are supported, with Symphonia decoding mono/stereo media and Rubato converting rates off the realtime thread. Unsupported multichannel media is rejected.

`outputLatencyFrames` comes from Firewheel's CPAL `process_to_playback_delay`, rounded to device frames. macOS measured 284 frames at 48kHz on the verification host. Platforms or callbacks without a playback timestamp report `null`; no buffer-size guess substitutes for unavailable latency. A device fault or changed sample rate is terminal for that session and rejects subsequent applies; reopening requires a new session.

## Snapshots and source data

`serializeProject()` returns version-2 JSON containing committed `document` and `workspace` preferences only; the current non-transactional pan/zoom/scroll viewport is retained. Temporary numeric edits and Arrangement previews do not leak into serialization or saves. `hydrateProject(json)` validates and clones the complete payload before replacing state and resetting session/history. Invalid JSON, version or schema leaves the current project intact.

Snapshot bar positions (loop endpoints, clip starts, markers and automation points) are finite and at least 1. Durations remain strictly positive and may be less than one bar; source offsets retain their signed coordinate semantics. Invalid restore leaves the current document and undo history intact.

`setSnapshotStorage(storage)` installs the synchronous `SnapshotStorage` port (`get(key): string | null`, `set(key, value): void`); passing `null` disconnects it. The platform/application composition root supplies the durable implementation. There is no default storage or filesystem access in this layer. `createMemorySnapshotStorage()` creates an isolated test implementation.

Save captures the committed revision, its storage instance and route key, then waits for backend acceptance before writing. A newer edit is not marked clean by that older save. Project switching cancels the pending save. Restore returns false and sets `session.snapshotError` for missing, invalid or unavailable storage; failed reads or writes preserve authored data and dirty state. These are prototype snapshots, not `.zdaw` files or background autosave.

Restore requires exactly one Main output with ID `main`. Audio tracks own audio clips; MIDI tracks own MIDI or Pattern clips. Group, Return and Main cannot own clips. Commands and snapshot validation share `acceptsClip`.

Waveforms come exclusively from the native session peak reader; clips, history and snapshots contain no generated waveform cache. Clip trim/split retains authored source data and changes `sourceOffsetBars`; MIDI notes, Pattern phase and preview share that window. Fade duration, offset, curve and midpoint fields remain saved metadata with the existing interval constraints.

`session.drawModeOverride` represents a held B key independently of the latched `workspace.drawMode`. `model/interaction-mode.ts` resolves the effective mode for Header, Toolbar, automation and MIDI editing. Holding B during a gesture creates no preference undo entry. Undo and redo preserve an open clip editor if its clip survives the restored document; removing that clip closes the editor.

## Arrangement and editor composition

Current geometry, controller ownership, lane projection and keyboard routing are defined by the [Arrangement composition contract](../../../../../docs/architecture/gpuix-arrangement-composition.md). Native controls, scrolling, cursor capture and focus follow the [gpuix UI standards](../../../../../docs/architecture/gpuix-ui-standards.md); module and platform boundaries follow the [gpuix architecture](../../../../../docs/architecture/gpuix.md). There is no separate Web/Tauri viewport or keyboard implementation in this adapter.

`session.editingClipId` owns the open Clip editor; `session.clipEditorRequest` signals explicit open/close requests. Clip and Device panel visibility belong to the shell, not document/history, and neither acquires another backend.

Audio playback Start/End markers, source-loop settings, warp/pitch/reverse metadata and device chains remain authored data validated at the snapshot boundary. They do not imply connected DSP: see the backend capability limits above.
