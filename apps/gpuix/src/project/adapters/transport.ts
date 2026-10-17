import { PROJECT_TEMPLATE } from "../defaults/template"
import { useProjectState } from "../stores/useProjectState"
import { reduceDocument, reduceWorkspace } from "../model/reducers"
import { reconcileGridForMeterChange } from "./grid"
import { document, get, session, workspace, setPreciseTransportBar } from "./context"
import type {
  DocumentState,
  LoopRegion,
  Position,
  SessionState,
  TimeSelection,
  WorkspaceState,
} from "../model/types"

export const transportActions = {
  setBpm(bpm: number) {
    if (Number.isFinite(bpm)) {
      document(
        reduceDocument(get().document, {
          type: "transport",
          patch: { bpm: Math.max(20, Math.min(999, bpm)) },
        })
      )
    }
  },
  setNumerator(numerator: number) {
    if (!Number.isFinite(numerator)) {
      return
    }
    const n = Math.max(1, Math.min(32, Math.round(numerator)))
    const previous = get().document.transport
    document(reduceDocument(get().document, { type: "transport", patch: { numerator: n } }))
    reconcileGridForMeterChange(previous.numerator, previous.denominator, n, previous.denominator)
    if (get().session.position.beat > n) {
      session({ position: { ...get().session.position, beat: n } })
    }
  },
  setDenominator(denominator: number) {
    if (!Number.isFinite(denominator)) {
      return
    }
    const next = Math.max(1, Math.min(32, Math.round(denominator)))
    const previous = get().document.transport
    document(reduceDocument(get().document, { type: "transport", patch: { denominator: next } }))
    reconcileGridForMeterChange(previous.numerator, previous.denominator, previous.numerator, next)
  },
  setBarLength(barLength: string) {
    document(reduceDocument(get().document, { type: "transport", patch: { barLength } }))
  },
  setLoop(patch: Partial<LoopRegion>) {
    const next = { ...get().document.transport.loop, ...patch }
    if (
      !Number.isFinite(next.startBar) ||
      !Number.isFinite(next.endBar) ||
      next.startBar < 1 ||
      next.endBar <= next.startBar
    ) {
      return
    }
    document(reduceDocument(get().document, { type: "loop", patch: structuredClone(patch) }))
  },
  setPosition(patch: Partial<Position>) {
    const next = { ...get().session.position, ...patch }
    if (![next.bar, next.beat, next.sixteenth].every(Number.isFinite)) {
      return
    }
    session({
      insertionPoint: null,
      position: {
        bar: Math.max(1, Math.floor(next.bar)),
        beat: Math.max(1, Math.min(get().document.transport.numerator, Math.floor(next.beat))),
        sixteenth: Math.max(1, Math.min(4, Math.floor(next.sixteenth))),
      },
    })
  },
  seekBar(bar: number) {
    if (!Number.isFinite(bar)) {
      return
    }
    setPreciseTransportBar(bar)
    session({ insertionPoint: null, position: positionAtBar(bar) })
  },
  restoreSeek(bar: number, insertionPoint: { trackId: string | null; bar: number } | null) {
    if (!Number.isFinite(bar)) {
      return
    }
    setPreciseTransportBar(bar)
    session({ position: positionAtBar(bar), insertionPoint })
  },
  setInsertionPoint(point: { trackId: string | null; bar: number } | null) {
    if (point && (!Number.isFinite(point.bar) || point.bar < 1)) {
      return
    }
    if (point?.trackId && get().document.tracks.every(track => track.id !== point.trackId)) {
      return
    }
    if (point && !get().session.playing) {
      setPreciseTransportBar(point.bar)
    }
    session({
      insertionPoint: point ? { ...point } : null,
      ...(!get().session.playing && point && { position: positionAtBar(point.bar) }),
    })
  },
  togglePlay() {
    const current = get().session
    if (current.insertionPoint) {
      setPreciseTransportBar(current.insertionPoint.bar)
    }
    session({
      playing: !current.playing,
      ...(current.insertionPoint && { position: positionAtBar(current.insertionPoint.bar) }),
    })
  },
  stop() {
    const point = get().session.insertionPoint
    if (point) {
      setPreciseTransportBar(point.bar)
    }
    session({
      playing: false,
      recording: false,
      levels: {},
      inputLevels: {},
      ...(point && { position: positionAtBar(point.bar) }),
    })
  },
  toggleRecording() {
    session({ recording: !get().session.recording })
  },
  rewindToStart() {
    session({ insertionPoint: null, position: { ...PROJECT_TEMPLATE.position } })
  },
  setFollow(follow: boolean) {
    workspace(reduceWorkspace(get().workspace, { follow }))
  },
  setLink(link: boolean) {
    workspace(reduceWorkspace(get().workspace, { link }))
  },
  setMetronome(metronome: boolean) {
    workspace(reduceWorkspace(get().workspace, { metronome }))
  },
  setProject(patch: Partial<Pick<DocumentState, "name" | "scaleRoot" | "scaleMode" | "groove">>) {
    document(reduceDocument(get().document, { type: "project", patch: structuredClone(patch) }))
  },
  setMode(mode: "drawMode" | "automationMode" | "computerKeyboard", enabled: boolean) {
    if (get().workspace[mode] === enabled) {
      return
    }
    workspace(reduceWorkspace(get().workspace, { [mode]: enabled }))
  },
  setDrawModeOverride(value: boolean | null) {
    if (get().session.drawModeOverride === value) {
      return
    }
    session({ drawModeOverride: value })
  },
  setViewport(patch: Partial<Pick<WorkspaceState, "pxPerBar" | "scrollX" | "scrollY">>) {
    const next = { ...get().workspace, ...patch }
    if (
      !Number.isFinite(next.pxPerBar) ||
      next.pxPerBar <= 0 ||
      !Number.isFinite(next.scrollX) ||
      next.scrollX < 0 ||
      !Number.isFinite(next.scrollY) ||
      next.scrollY < 0
    ) {
      return
    }
    useProjectState.setState({ workspace: reduceWorkspace(get().workspace, patch) })
  },
  selectTracks(ids: string[], surface: SessionState["trackSelectionSurface"]) {
    session({
      trackSelectionSurface: surface,
      selectedTrackIds: [...new Set(ids)].filter(id =>
        get().document.tracks.some(track => track.id === id)
      ),
    })
  },
  selectClips(ids: string[]) {
    const selectedClipIds = [...new Set(ids)].filter(id =>
      get().document.tracks.some(track => track.clips.some(clip => clip.id === id))
    )
    session({
      selectedClipIds,
      editingClipId: selectedClipIds.length === 1 ? selectedClipIds[0] : null,
    })
  },
  setTimeSelection(selection: TimeSelection | null) {
    session({ timeSelection: selection ? structuredClone(selection) : null })
  },
}

function positionAtBar(bar: number): Position {
  const { numerator } = get().document.transport
  const beats = (Math.max(1, bar) - 1) * numerator
  const wholeBeats = Math.floor(beats)
  return {
    bar: Math.floor(wholeBeats / numerator) + 1,
    beat: (wholeBeats % numerator) + 1,
    sixteenth: 1 + (beats - wholeBeats) * 4,
  }
}
