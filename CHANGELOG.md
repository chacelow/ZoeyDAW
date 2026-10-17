# Changelog

## 0.1.0 - unreleased

### Live-style level meters and smooth icon hover (2026-10-17)

- Level meters follow Ableton Live 12: a measured non-linear dB scale shared by meters and the Fader, a position-based red → yellow → green body gradient (0, −9, −17.5 dB), RMS fill with a translucent peak extension and a hold line, and an overload cap that stays visible on collapsed tracks. The Main track turns its whole meter red on overload. Tick marks and dB numbers appear as a meter grows taller; bar widths stay compact. Mixer meters add a latching, click-to-reset peak readout. Main Out shows an inline meter in its dropdown; Cue Out stays at the floor because the engine has no cue bus yet.
- Telemetry carries per-track `{ peak, rms }` in dBFS. The engine's RMS is one render block (≈5.3 ms), so the meter integrates it in the power domain over `rmsIntegrationMs` (300 ms).
- Audio input-channel options show per-channel peak and RMS meters, including the selected hardware channel in the closed control. The optional CPAL input stream falls back to output-only playback when no input device is available or input startup fails; macOS may request microphone permission on first open, and denial leaves input meters unavailable without stopping playback.
- Icon hover growth is a paint-only GPU scale: the renderer patch `svg-scale-motion` adds `scale` to style and motion and `motion.svg`, so the glyph rasterises once and animates without re-layout or re-rasterisation.
- Gallery: the Meters page has a variant × state matrix with a Main row and a resizable demo; large Layout demos put their label above full-width content.
- Hardware input-channel meters: the engine opens the default input device on its own cpal stream (best effort, never blocks playback) and publishes `inputLevels` for the routing ids `1-2`, `3-4`, `1`, `2`. Input-channel dropdown options show a live inline meter. Compact meters (inline, collapsed) turn fully red on overload.
- Icon-only buttons show state on the glyph only: hover brightens and enlarges the icon instantly, active fills it; no background highlight or animation.
- Hovering a control no longer re-renders the window: the status info lives in a small external store read only by the status text (hover dropped from ~80 ms to ~19 ms in the full Gallery).
- Native `input` supports `disabled` (not focusable, not-allowed cursor) and `readOnly` (no caret, arrow cursor) via the renderer patch `input-disabled`; the Input hit shield is gone.
- Fader drags use the shared DragPad step sensitivity again.
- Tests that mount full native sessions share a 15 s budget for slower CI runners.

### Dock workspace, component catalog and theme editor (2026-10-17)

- The project workspace is a dock layout (dockview-style model, FlexLayout look): Browser, Arrangement, Clip Edit and Affect Chain are registered panels with tabs, edge/center/tab-strip drops, maximize and a menu to show hidden panels. Transport and the status bar stay fixed. The layout is saved per project as versioned JSON and never marks the document dirty. Groups carry no highlight border; header actions show only for the active or hovered group.
- The Gallery is a dock workspace with categories, a scrollable preview and the theme editor. Each component appears in exactly one category, one variant per row with its states side by side; only the selected category is mounted, so a full window flush stays at or under 8 ms per category (was ~66 ms).
- New shared controls: Switch, Knob, LevelMeter (TrackMeter now renders through it), a Live-style Fader with a triangle beside the meter, Checkbox with a mixed state, Chip, TreeRow, Breadcrumb, DeviceHeader and TruncatedText (ellipsis plus a tooltip only when truncated). Buttons gain `tone` (solo, arm, activator); ToggleGroup gains a segmented variant.
- Controls size to whole multiples of the control row height. Labels never stretch a layout: a control takes the smallest multiple that fits its text and truncates only when space runs out.
- Menus and dropdown lists follow Live: full-width separators, one row height, a check column, right-aligned shortcuts, group headings and option grids for rhythm values and colours.
- A theme editor shared by the Gallery and Settings creates custom themes over every colour, radius, spacing and size field, with import/export; themes persist in native settings (`themeLibrary`).
- Control text, row height and icons are 2 px larger, changed once in `control-metrics.json`. Radio dots and dropdown chevrons are centred through IconSlot; numeric pads no longer draw a default icon.
- Windows CI: the GPUI first-present gate test runs on the production frame path, and runners without an audio output skip only real-audio cases while reporting the WASAPI smoke as unverified.

### Drag cursor (2026-10-17)

- Value drags (BPM, numeric pads) and the Minimap hide and pin the cursor the way Live does, so a drag keeps working past the screen edge. The renderer gains `beginRelativeDrag`/`endRelativeDrag`: macOS disassociates the cursor and accumulates `NSEvent` deltas; Windows warps the cursor back to its anchor after every move, matching a Frida trace of Live 12. Numeric pads release the cursor where the press started; the Minimap releases it where the selection actually moved.
- Dragging past a value limit discards the extra travel, so reversing changes the value immediately.
- Remove the native `cursorPosition`/`cursorHide`/`cursorRestore`/`windowPointToScreen` exports and the renderer's Windows-only `hideCursorForDrag`/`restoreCursorAfterDrag`.

### Project files (2026-10-17)

- Save projects the way Live saves sets: `<Name> Project/<Name>.zdaw` (version-2 JSON) in a folder chosen in a Save As dialog, defaulting to Documents/ZoeyDAW. Each overwrite first copies the previous file to `Backup/<Name> [YYYY-MM-DD HHMMSS].zdaw`, keeping the newest `projectBackupCount` (default 10).
- Save (Cmd/Ctrl+S) writes the opened file, or opens Save As for a never-saved project; Save As (Cmd/Ctrl+Shift+S) and Open (Cmd/Ctrl+O) are new commands. Home "Open…" and the toolbar Open button use the system file picker; the toolbar Restore snapshot button is removed.
- Recent projects are file paths stored in settings and appear after the first successful save; the title bar shows the file name. Leaving an unsaved project with Save asks for a location and stays put on cancel.
- A file that fails to read or validate blocks Save so its bytes are never overwritten; Save As to a new location recovers. Remove the per-route `dataDir/snapshots` store and its `snapshotGet`/`snapshotSet` napi exports.

### Windows and repository cleanup (2026-10-17)

- Add Windows x64: renderer UI bridge and cleanup patches, DirectComposition offscreen lifecycle, native clipboard, cursor, window geometry and reduced motion on Windows, a Windows build driver, `verify-windows.mjs`, a Windows CI job and an NSIS release matrix entry.
- Respect the macOS titlebar double-click preference and mark the transparent titlebar as a native drag region; Windows handles caption double-clicks itself and Settings stays outside the drag region.
- Move clip editor header and ScrollArea default heights into layout tokens; size DropdownButton triggers with the icon gap only when an icon is present.
- Fix the Arrangement flash when Clip Edit expands or collapses: flexible panels lay out with native flex weights, so a container resize redistributes them in the same draw.
- Release a hidden-cursor minimap drag at the point the grabbed selection moved to; cancelling still returns to the press point.
- Start Browser drag previews from the painted row: drag sources can hand their mouse handlers to the element that receives hits.
- Drop the Select Space renderer patch; DropdownButton ignores Space-driven open toggles itself.
- Development is single-agent: delete the orchestration scripts, slice specs and coordination rules.
- Delete committed verification evidence, slice reports, one-off probes, unused verification harnesses and mutation runners, stale research notes and source comments. Rewrite the renderer, Windows and engine research notes as current references.

### gpuix native rewrite (2026-10-14 – 2026-10-15)

- Replace the Web + Tauri application with the gpuix native app (`apps/gpuix`, React logic on gpuix native elements) and Rust crates `crates/native` (napi) and `crates/engine` (real audio engine). Delete `apps/web`, `src-tauri` and `packages/**`; theme metrics, i18n and logging now live inside `apps/gpuix`.
- Build the renderer from the pinned `vendor/gpuix` recursive submodule. ZoeyDAW-specific native, GPUI, React and Zed changes are committed to the `chacelow/gpuix` and `chacelow/zed` `zoeydaw` forks rather than replayed from a local patch series; the renderer commit is pinned by the parent repository's gitlink.
- Port the project core (model, stores, adapters, runtime) with a real engine backend: session-fenced telemetry, monotone control fence, committed-only saves, and recording journals that survive backend teardown.
- Add native shared controls and panels (Button, Input, Menu, Popover, DragPad, PanControl, MotionTabs, ScrollArea, ListRow, SettingsShell; Panel, Group and resizable dividers) and a single design-token entry `theme.design` with 43 theme presets; business surfaces no longer invent radii or spacing multiples.
- Rebuild Arrangement as tracks, lane, timeline and core around one TimelineController and one keyboard owner. Lane, grid, waveform and MIDI notes draw through native quad batches; scrolling moves position hosts without re-rendering clip content.
- Rebuild the bottom Clip editors (MIDI, Audio, Pattern) with an ID-only editor slot, one geometry for Pattern drawing and hit-testing, and full-scale production p90 under 4ms for Audio zoom/scroll.
- Split project runtime assembly from its single mutable owner, backend lifecycle, editing and save confirmation; split AudioWaveform into one view/drag hook and stateless ruler, waveform and overview components without changing public APIs or behavior.
- Consume handled arrow keys in RadioGroup and Separator so they no longer seek the timeline. Express toggle state through `aria-pressed` (macOS exposes a toggle button with a live value) and inject locale names instead of hard-coded English on/off suffixes. Treat a panel as fixed only when its min and max are authored in the same unit, so small viewports shrink flexible minima instead of crashing the project page.
- Recover the latest playhead and meters on the first frame after a background window becomes active again.
- Add `pnpm verify:gpuix` (renderer identity, native build, tsc, eslint, architecture rules, doc routes, bun test, review scan, UI map, real-backend offscreen smoke; fails closed), `GPUIX_BACKGROUND=1` background launch for every entry, a generated UI map, and lint rules that encode recurring lessons (no JS timers for native events, no appearance override, no invented business shape).
- Known limits: visible-window visual and full-scale 16ms acceptance, physical drag/wheel/focus, and background-window playback still need a serial foreground pass; device DSP, warp/pitch processing and real Browser resource placement remain metadata-only.

### Web prototype (before the rewrite)

- Add independent bottom Clip and Device views with simultaneous display, remembered collapse restoration, a resizable Clip editor and binary fixed-height Device divider based on observed Live behavior.
- Replace the temporary embedded editor with a full-range MIDI piano roll, pitch keyboard, source ruler, velocity lane and cancellable source-coordinate note editing. Preserve held-key releases and correct viewport fit after row-height commits.
- Add Audio independent playback Start/End markers, musical-position inputs using the clip's actual meter, source/loop editing with independent loop bounds, waveform zoom/pan, gain/fades and authored warp/pitch/reverse metadata. Keep unknown sources empty and processing explicitly visual-only.
- Add per-track ordered device metadata with insertion, bypass, folding, parameter gestures, keyboard/drag ordering and undo. Validate and roundtrip new detail metadata in snapshots.
- Move prototype performance readouts to the Header and correct shared Progress indicator flex growth so its width reflects the actual percentage.
- Own project runtime state per injected store and acquire backends explicitly. Keep imports/configuration/hydration idle, isolate editing identity from engine sessions, and retain independent recording across temporary-edit teardown.
- Split Connection into public exports, coordinator, protocol validation and telemetry interpolation; share one dispatch path for opening and queued requests.
- Scope control hover, warnings and mapping by provider. Isolate gallery demos from the application environment and remove shared UI dependencies on project-private stores; inject the project title at route composition.
- Derive shared CSS and project display geometry from one public metric configuration, with generated-artifact drift checks. Preserve existing control variants and Panel visuals while making selection/paper colors root-configurable.
- Separate MIDI note operations from local input lifecycle and rendering; keep keyboard, pointer, clipboard, cancellation and undo behavior.
- Adopt Ultracite v8 as the shared check/fix/doctor toolchain, retain project architecture/token rules, and replace cross-directory script chains with named package tasks.
- Preserve MotionTabs external selection resets across repeated user tab changes; synchronize committed callbacks and observer cleanup without changing shared control dimensions.
- Keep AGENTS.md short and route to setup, module, Panel, prototype and lessons documents instead of embedding all evolving contracts.
- Add a replaceable project backend port with versioned full-state requests, serialized acknowledgement, preview coalescing, rejection recovery and session-fenced telemetry. Keep the default implementation visual-only; no audio engine dependency is added.
- Route Canvas previews, continuous controls, commit/cancel and undo/redo through the same runtime. Share accepted playback telemetry across playhead, Follow, meters and prototype recording; isolate gesture tokens and retain independent recording edits.
- Wait for accepted committed revisions before writing local snapshots. Keep viewport changes out of undo and prevent stale saves, callbacks and component cleanup from affecting another project or edit.
- Initialize external-backend projects from empty defaults or a registration-owned project seed. Represent unsourced audio clips as silent instead of injecting demo file references.
- Remove inherited release workflows and obsolete ZoeyMind Windows/macOS document associations from the DAW baseline. Keep legacy screenshots local-only and retain upstream Apache attribution.
- Quit directly from the native tray instead of emitting an unhandled exit event. Use the zoeydaw browser title and initialize recent projects without a redundant mount effect.
- Replace fixed-only Arrangement grids with five adaptive density levels, weighted grid tiers and a shared zoom-derived snapping plan through 1/16384. Keep explicit fixed mode and migrate legacy snapshots to version 2 preferences.
- Use default cursors for timeline bodies and blank lanes, a grab cursor for opaque Clip titles, and translucent lower bodies. Restore Ctrl/Cmd+E Clip Split; Ctrl/Cmd+1 and +2 adjust grid density without moving the camera.
- Separate a precise row-local insertion cursor from the moving transport. Space starts, stops and replays from the insertion point; only playing draws the full-height line. Use Float64 prototype playhead positions for fine-grid accuracy at distant bars.
- Distinguish Arrangement and header focus. Lane clicks highlight only the row; header focus colors only the identity area, not routing or mixer controls. Remove selected borders and whole-card overlays, preserve insertion position, and clip row feedback below the rulers.
- Draw Group child summaries only when folded. Give identity, routing and mixer sections shared Padding and control Gap in expanded and collapsed states, fill only the name segment, and retain a 1px track-local insertion cursor.
- Resize the top MiniMap vertically through the shared panel separator while retaining the timeline's minimum height.
- Repaint resized Arrangement, playhead, and meter canvases before composition instead of leaving their cleared backing stores until the next frame.
- Serialize native MiniMap recenter and final cursor restoration. Keep the cursor hidden until restoration settles and prevent a previous gesture's pending warp from affecting the next drag.
- Anchor MiniMap body zoom at the pressed horizontal position instead of the frame center. Preserve independent edge resizing and the current vertical zoom direction.
- Replace the MiniMap debug column with a full-width overview capped at 90px. Retain Group and empty source rows through folding, and render solid Clip bands, track dividers, locators and the transport position.
- Reuse shared theme colors and their translucent overlay in MiniMap instead of a local palette. Keep dark-theme grid and track separators darker than their surface with the shared muted color, and retain the shared border color in light themes. Preserve Pattern backgrounds and grid density.
- Use shared grid colors inside Audio, MIDI and Pattern Clip bodies instead of inheriting their fill color. Preserve subdivision opacity, waveform and note colors.
- Restore complete outer track borders and continuous Group rails over child borders. Keep outer tracks free of Padding and apply shared Padding to each control section. Exclude Group rails from height-adjustment hover feedback and keep shared numeric-control fills square.
- Align audio fade endpoints with Clip body edges. Show curves and handles only on hover, while retaining fade masks on unhovered Clips and folded title bars.
- Replace selected Audio, MIDI and Pattern Clip outlines with a pale-blue body fill while retaining original title colors, content and grid visibility. Tint the remaining title when folded.
- Center shared numeric values and edit inputs. Use a centered solid-circle record-arm icon without extra horizontal padding on square track buttons.
- Reduce the default drag distance per step and discard overshoot at value boundaries so reverse movement responds immediately. Preserve range sensitivity, Shift fine adjustment and cursor restoration.
- Keep single clicks in highlighted pre-edit mode without a text cursor or input. Typing starts live editing; double-click reset remains available.
- Reduce MiniMap body panning to one quarter of its previous distance while preserving vertical zoom and edge resizing.
- Use a solid-circle transport record icon and a smaller centered CSS circle for track record-arm controls.
- Use the shared default size for numeric-control library examples instead of compact-only Number examples.
- Cover the parent-to-child Group rail seam and add a 1px right border without changing the rail width.
- Remove the track-height handle's hover color bar while preserving its resize cursor and keyboard focus indicator.
- Fill folded Clip cards to the inside of their track borders.
- Reserve the empty record-arm slot on Group tracks so activation buttons match ordinary track widths.
- Widen track meters to the shared compact-control width. Separate stereo channels, mark 0 dB, use a green-to-yellow gradient below unity and red above it, and hold independent peaks for 600ms before a 24 dB/s fall.
- Widen the track operation area to 304px. Give the identity column 100px and Mixer 32px more room while retaining the 74px routing column, compact stereo meters, and empty Group arm slots.
- Unify shared DAW controls at the 13px track-control height and 9px text size, including component-library examples. Remove Transport control borders.
- Align track activation with the half-width volume column and split the other half equally between Solo and record-arm controls, including the empty Group arm slot.
- Arrange sends in three-column rows and reveal three destinations per available control row.
- Use 20px Transport controls with 12px text and 14px icons without resizing track controls.
- Centralize track layout in `TRACK_LAYOUT`. Share one spacing value across identity, Routing, Mixer, monitor buttons and Send grids; derive scoped CSS tokens, collapsed/title heights, resize steps and exact control-row capacity. Remove the tighter Routing gap and the extra Mixer row reservation.
- Use a 50% theme-derived dark fade mask, with immediate Canvas refresh after stylesheet changes. Show fade curves only over the expanded Clip body, never on title hover.
- Smooth Fade curves through a circular, two-axis midpoint with four-sided inset limits. Persist midpoint positions and preserve live edits on capture interruption; Esc cancels.
- Align numbered grid lines with the ruler and let Ctrl+1/Ctrl+2 control the remaining cells. Use a shared translucent dark grid overlay inside Clip and Pattern bodies, including selected and hovered cards.
- Preview Clip movement with half-transparent active Ghost cards while source cards remain inactive. Invalid destinations retain the last valid preview; one undo restores the move.
- Allow card-title movement in Automation mode and transfer all automation breakpoints inside each selected Clip's half-open time interval. Keep preview and commit placement aligned, including cross-track moves and copies.
- Set the playback origin to the card start on title click or move; body clicks retain the row-local cursor origin.
- Draw a neutral alignment guide at the Ghost's left edge during movement and at the grabbed edge during left/right resizing. Keep it independent of the playing transport cursor; resizing retains the Clip's left start as the playback origin.
- Give MIDI tracks the same volume and pan controls as Audio tracks. Use the Mixer card background for the stereo-meter center and 0 dB cutouts.
- Claim Space for transport in capture phase, release focused controls without activating them, ignore held-key repeats, and retain text entry and Enter behavior.
- Replace playback-follow paging with frame-synchronized center locking in the visible timeline, excluding the operations column.
- Replace deep relative module imports with web @/ aliases and shared UI private aliases. Enforce the web convention for static and dynamic imports with ESLint.
- Pivot repository from ZoeyMind mind-map editor to zoeydaw DAW scaffold.
- Delete multi-tab shell, document portal, recovery snapshot, mind-map renderer, AI / MCP stack.
- Single-project route structure: `/` home + `/project/:id` left/right layout placeholder.
- Rust shell slimmed to atomic file write, log config, updater, tray, single-instance.
- Add an Ableton-style Web Browser prototype with demo categories, scoped search, content filters, expandable presets, favorites, and keyboard navigation. No file, plug-in, or audio integration.
- Add same-surface resizable Browser columns with clear separators and continuously clipped navigation labels. Keep resource selection empty until chosen and remember it per category.
- Centralize active-over-hover precedence in shared UI styles, balance global sizing, and replace variable hover messages with component-type help.
- Add a shared Motion-based `DragPreviewArea` for resource ghosts, animated cancellation, forbidden drop feedback, and reduced-motion support. Resource placement remains disabled in every Panel.
- Add an interactive arrangement prototype with an adaptive MiniMap, shared timeline scrolling, musical and BPM-aware time rulers, locators, and draggable loop regions.
- Compose project document, workspace, and transient session state behind one typed adapter API. Split track, clip, transport, automation, history, simulation, and snapshot responsibilities into domain modules.
- Add grouped and collapsible tracks with name, routing, monitor, mute, solo, record-arm, pan, volume, and simulated stereo level controls.
- Add audio, MIDI, and pattern clip actors with grid-based creation, selection, move/copy, resizing, duplication, splitting, deletion, and clip editors. Add editable automation points and Live-style A/B/M shortcut distinctions.
- Move reusable DAW controls into the UI package with shared sizing, measured fixed-width text, persistent icon slots, current-color states, and explicit gesture transactions. Add reusable pan, volume-fader, and calibrated stereo-meter controls.
- Add versioned per-project browser-local snapshots. Musical data and view preferences persist; playback, live meters, selections, keyboard notes, and undo history do not. Audio output, disk project files, and Rust integration remain disconnected.
- Preserve audio, MIDI, and pattern source data through clip trim/split/re-extension. Clamp source boundaries before applying gestures so edited projects remain serializable.
- Synchronize adjustable-control refs after commit, separate input refs from render-state bindings, and keep type-only help available during numeric editing.
- Grow the timeline from all project content and playback position. Keep hidden group clips in the adaptive MiniMap, fit long arrangements, and render ruler ticks only for the visible range with millisecond labels at high zoom.
- Register shared font and spacing tokens with the class merger so active colors cannot remove font sizing or change control dimensions. Keep transport emphasis in the shared button variant rather than caller-specific sizes.
- Keep numeric controls in pre-edit after keyboard activation, then focus live editing on the first typed character. Preserve icons and dimensions across idle, pre-edit, and edit states.
- Reject extra main outputs and incompatible clip owners before restoring snapshots. Reuse the same ownership policy for clip creation and cross-track moves.
- Align Header groups left, window-center, and right. Pack groups without overlap as the window narrows, then scroll horizontally without changing control dimensions or typography.
- Restore compact arrangement track columns and thin background/grid separators. Replace duplicate volume widgets with one filled numeric bar per expanded track and a separate read-only stereo meter.
- Add Ctrl/Cmd+1 and Ctrl/Cmd+2 grid steps from 1/4 through 16/1. Alternate backgrounds per numbered bar to match the ruler, and align ruler seeking, clip placement, and clip-local overlays to one snap origin.
- Lock clip and pattern gesture cursors across hovered elements, with release, cancellation, capture-loss, Escape, blur, and unmount cleanup.
- Add draggable Bézier audio fade length and curvature overlays with bounded, undoable, saved curve metadata. Update the detail preview to use the same geometry; no audio DSP is connected.
- Make the MiniMap frame resizable one-sided from either edge, like a clip. Body drag still pans horizontally and resizes both sides vertically; double-click still fits.
- Coordinate simultaneous clip/fade cursors so an earlier gesture cannot be restored after it ends. Close loop-ruler edit transactions on capture loss, blur, and unmount; let numeric-control wheel adjustments take precedence over narrow Header scrolling.
- Restore MiniMap body pan/zoom, independent edge resizing, cancellation and blur cleanup with stable listeners. Reuse native cursor positioning to keep and restore the drag origin; render overview clips on a canvas.
- Restore Canvas clip title movement, single-copy Alt dragging, multi-track time ranges, source-preserving trimming, relative fade lengths and separate curve handles. Preview gestures without mutating the document, then commit one undoable command.
- Restore clip creation, editing, duplication, splitting, deletion and token-based coloring through shared context menus. Keep Pattern painting and MIDI note edits cancellable on capture loss, blur and unmount.
- Share one track-row geometry between headers, canvas and hit testing. Pin return/main rows, virtualize offscreen headers, reserve space for the clip editor and retain compact gallery controls.
- Use the existing mock transport clock for playhead telemetry, including signature and loop timing. Grow and recycle prototype meter slots instead of failing after 128 tracks. Remove the superseded preview route and temporary window debug exports.
- Separate Timeline toolbar, viewport, painter lifecycle and virtual track headers. Split clip, ruler and automation gesture modules and Audio, MIDI and Pattern detail editors.
- Add versioned clip clipboard operations, relative multi-lane duplication and axis-specific edge autoscroll that recomputes previews without pointer movement.
- Add locator rename, deletion, navigation and snapped movement, independent loop edges and time-selection looping. Correct locator double-click playback and selected-locator arrow movement.
- Add automation multi-selection, segment movement, Alt curvature, B drawing and grouped numeric editing. Share envelope interpolation with simulated meters, including flat tails and empty-lane defaults.
- Add MIDI drawing, erasing, selection, clipboard and keyboard editing. Keep held B mode transient, protect hidden clip selections in Automation mode, and retain surviving clip editors through undo and redo.
- Fix Base UI context menu activation and StrictMode numeric-editor teardown. Keep editor focus through menu closure and remove the obsolete Escape callback.
- Keep normal Clip and Pattern activation, creation and rename inside the timeline. Retain prototype detail editors only behind an explicitly labeled temporary menu action.
- Restore distinct pastel card titles, lighter bodies, clipped MIDI notes and source-aligned single-lane Pattern marks. Fold ordinary tracks to title-only cards and dim content in Automation mode.
- Add smooth shaded audio fade transitions, four square endpoint controls and diamond curvature controls. Preserve inward boundary offsets through snapshots, clipboard, trims, splits and undo; keep zero-length endpoints usable and edge handles fully visible.
- Connect Group and child identities with nested ancestor-color rails. Folding a Group preserves its own height, descendant summary, routing and mixer controls while hiding children.
- Resolve CSS color expressions before Canvas painting so light-dark ink matches DOM contrast in both themes. Preserve caller opacity in waveform and note painters.
- Keep MIDI preview pitch rows stable while panning. Use outlined fade controls and continuously sloped curve midpoints; keep Automation curves below card titles and hide them on folded ordinary tracks.
