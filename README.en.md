# zoeydaw

Web-UI DAW. Rust audio core, plugin host, and mixer; React + Tauri 2 shell.

Status: **Web interaction prototype**. The app includes a home page, a single-project panel layout, an Ableton-style Browser, and an interactive arrangement timeline. A mock adapter supplies tracks, waveform previews, MIDI clips, patterns, playback position, and level meters. Local snapshots use browser localStorage, not audio project files. File access, plug-in scanning, and the audio engine are not connected.

## Develop

```bash
pnpm install
pnpm --filter @zoeydaw/web dev     # web only
pnpm tauri:dev                     # with native shell
```

Needs Node ≥22, pnpm 10, Rust ≥1.77, Tauri 2 platform prerequisites.

## Layout

```
apps/web/           React frontend (Vite + Tailwind v4)
packages/ui         Shared UI library (shadcn-style + Storybook)
packages/i18n       zh-CN / en-US translations
packages/logger     Browser / Node colour logger
packages/shared     Cross-package zod schemas / types
src-tauri/          Tauri 2 Rust shell (atomic file write + logging + updater + tray)
```

## Arrangement and state

- `apps/web/src/pages/project/sections/ArrangementPanel` composes Toolbar, Viewport, TrackHeaderViewport, and painter lifecycle modules through Timeline. `canvas/interactions` separates clip, ruler, and automation input. `Clip/Detail` separates Audio, MIDI, and Pattern editors.
- `apps/web/src/pages/project/model` owns domain types, operations, and versioned snapshot validation.
- `apps/web/src/pages/project/stores` composes document, workspace, and session slices into one project store.
- `apps/web/src/pages/project/adapters` exposes state selectors and commands to the UI. Mock data, playback simulation, and snapshot storage stay behind this boundary so Rust integration does not scatter native calls across pages.
- `packages/ui/src/controls` owns shared numeric editing, drag adjustment, dropdowns, toggles, icon slots, and sizing tokens. The UI package also exports volume faders, level meters, and pan controls.

Snapshots retain musical data, routing and workspace preferences. Adaptive grids save mode and density, not a zoom-derived cell. Playback, recording, insertion/playhead positions, selections, live meters, held notes and undo history remain transient. See the [store architecture](apps/web/src/pages/project/stores/README.md) and [adapter architecture](apps/web/src/pages/project/adapters/README.md).

`A` toggles Automation. Tapping `B` latches Draw Mode; holding it during a gesture temporarily switches mode. Drawing edits automation and MIDI notes, not Arrangement cards. `M` toggles the computer MIDI keyboard. Ctrl/Cmd+1 and +2 adjust adaptive grid density; zoom keeps cells legible down to `1/16384`. Ctrl/Cmd+E splits selected Clips. Space starts or stops playback from the insertion point; the full-height line appears only while playing. Home rewinds. Text fields and Clip editors retain their editing keys.

Timeline bodies and blank lanes use the default arrow. Clip titles are opaque and show a grab cursor; translucent lower bodies preserve the grid. Clicking a body or lane places an insertion cursor and dragging selects time, without highlighting the right-side operations. Header focus colors only the name/identity area, with no selection border or changes to routing/mixer controls. Card operations do not open an editor; rename stays in the title and temporary editors remain explicit prototype actions. Folded ordinary tracks omit bodies and fades. Folding a Group collapses itself and descendants while retaining its summary and first-row controls.

## Next

Audio engine, CLAP + VST3 host, project persistence, and Ableton `.als` import land in follow-up iterations, scoped from UI interactions.

License: Apache-2.0.
