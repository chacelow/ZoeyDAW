# Project state ownership

The single composed root is `useProjectState.ts`, initialized from `slices/document.ts`, `slices/workspace.ts` and `slices/session.ts`; these defaults are independent of adapters and contain no demo clips. On project entry the mock adapter replaces the empty root with its fixture. `../adapters/index.ts` exposes the selector hook and composes domain commands. Domain types and pure reducers live in `../model/`; adapter `context.ts` owns transactional history and `simulation.ts` owns the visual clock. See `../adapters/README.md` for serialization and the mock/no-audio boundary.

`useInfoHover.ts` and `useMappingMode.ts` remain separate UI interaction stores; neither contributes project data or persistence. Components should read project data only through `useProjectState` and dispatch through `projectActions`, not introduce a second transport, track or clip store.

Canvas Scene is a derived rendering projection plus transient gesture previews. Drag previews currently update Scene directly and commit the project root through the adapter on release. They are not another persisted document, but they also are not yet an engine-facing adapter preview stream. A future native adapter must cover temporary preview, commit and cancellation as well as authoritative playback telemetry; replacing final command bodies alone is insufficient for realtime audio edits.
