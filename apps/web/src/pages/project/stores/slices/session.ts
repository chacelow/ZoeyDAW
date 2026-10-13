import type { SessionState } from "@/pages/project/model/types"

export function initialSession(): SessionState {
  return {
    playing: false,
    recording: false,
    position: { bar: 1, beat: 1, sixteenth: 1 },
    insertionPoint: null,
    selectedTrackIds: [],
    trackSelectionSurface: "arrangement",
    selectedClipIds: [],
    timeSelection: null,
    editingClipId: null,
    levels: {},
    dirty: false,
    canUndo: false,
    canRedo: false,
    snapshotError: null,
    activeMidiNotes: [],
    midiOctave: 4,
    midiVelocity: 100,
    drawModeOverride: null,
    automationParameters: {},
  }
}
