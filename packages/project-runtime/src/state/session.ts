import type { SessionState } from "@zoeydaw/project-core/types"

export function initialSession(): SessionState {
  return {
    editEpoch: crypto.randomUUID(),
    playing: false,
    recording: false,
    position: { bar: 1, beat: 1, sixteenth: 1 },
    insertionPoint: null,
    selectedTrackIds: [],
    trackSelectionSurface: "arrangement",
    selectedClipIds: [],
    timeSelection: null,
    editingClipId: null,
    clipEditorRequest: 0,
    dirty: false,
    canUndo: false,
    canRedo: false,
    snapshotError: null,
    preview: null,
    backend: { phase: "idle", sessionId: "", pending: 0, acceptedRevision: 0, error: null },
    activeMidiNotes: [],
    midiOctave: 4,
    midiVelocity: 100,
    drawModeOverride: null,
    automationTargets: {},
  }
}
