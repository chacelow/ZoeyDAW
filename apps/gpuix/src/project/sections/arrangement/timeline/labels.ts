import type { GridDensity } from "@/project/model/grid"
import type { BackendFailureCode } from "@/project/model/backend"

export interface TimelineLabels {
  readonly timeline: string
  readonly backendOpening: string
  readonly backendPending: string
  readonly backendErrors: Readonly<Record<BackendFailureCode, string>>
  readonly minimap: string
  readonly musicRuler: string
  readonly timeRuler: string
  readonly horizontalScroll: string
  readonly resizeOverview: string
  readonly snap: string
  readonly grid: string
  readonly adaptiveGrid: string
  readonly fixedGrid: string
  readonly density: Readonly<Record<GridDensity, string>>
  readonly bar: string
  readonly bars: string
  readonly automation: string
  readonly draw: string
  readonly zoomOut: string
  readonly zoomIn: string
  readonly pixelsPerBar: string
  readonly save: string
  readonly restore: string
  readonly midiKeyboard: string
  readonly octave: string
  readonly velocity: string
  readonly addMarker: string
  readonly renameMarker: string
  readonly markerName: string
  readonly seekMarker: string
  readonly deleteMarker: string
  readonly previousMarker: string
  readonly nextMarker: string
  readonly loop: string
  readonly enableLoop: string
  readonly disableLoop: string
  readonly loopSelection: string
}
