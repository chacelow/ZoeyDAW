import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { clampScroll } from "./layout"
import { HORIZONTAL_ZOOM, fitRows, rescaleScroll, rollPitches } from "./viewport"
import type { MidiClip } from "@/project/model/types"
import type { RollGeometry, SourceWindow } from "./layout"

/** Pitch zoom relative to the largest fitted row height; the ratios are the Web editor's. */
const VERTICAL_ZOOM = { min: 1 / 3, max: 2.5, factor: 1.5 } as const

/**
Local view state of one piano roll: fold, zoom and scroll never enter the project or its history.
The measured size arrives through `onLayout`; a fit runs when the clip, fold or source window changes
and once the first non-zero height is known.
*/
export function useMidiViewport(clip: MidiClip, window: SourceWindow) {
  const theme = useTheme()
  const limits = useMemo(
    () => ({
      minRowHeight: theme.project.midiRowMinHeight,
      maxRowHeight: theme.project.midiRowMaxHeight,
    }),
    [theme.project.midiRowMinHeight, theme.project.midiRowMaxHeight]
  )
  const [fold, setFold] = useState(false)
  const [horizontalZoom, setHorizontalZoom] = useState(1)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [rowHeight, setRowHeight] = useState<number>(limits.maxRowHeight)
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const pitches = useMemo(() => rollPitches(clip.notes, fold), [clip.notes, fold])
  // Like Live, zoom 1 fits the whole source window to the editor width.
  const width = size.width * horizontalZoom
  const roll: RollGeometry = {
    pitches,
    rowHeight,
    width,
    scrollX: scroll.x,
    scrollY: scroll.y,
    viewWidth: size.width,
    viewHeight: size.height,
    window,
  }
  const fitKey = `${clip.id}|${fold}|${window.sourceOffsetBeats}|${window.totalBeats}`
  const fitted = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (fitted.current === fitKey || size.height <= 0) return
    const fit = fitRows(clip.notes, pitches, window, size.height, limits)
    fitted.current = fitKey
    setRowHeight(fit.rowHeight)
    setScroll({ x: 0, y: fit.scrollY })
  }, [fitKey, size.height, clip.notes, pitches, window, limits])

  const scrollTo = useCallback(
    (x: number, y: number) => {
      const next = clampScroll(x, y, {
        width,
        viewWidth: size.width,
        viewHeight: size.height,
        rowHeight,
        pitches,
      })
      setScroll(previous =>
        previous.x === next.scrollX && previous.y === next.scrollY
          ? previous
          : { x: next.scrollX, y: next.scrollY }
      )
    },
    [width, size.width, size.height, rowHeight, pitches]
  )
  const zoomTime = (direction: 1 | -1) => {
    const next = Math.max(
      HORIZONTAL_ZOOM.min,
      Math.min(HORIZONTAL_ZOOM.max, horizontalZoom * HORIZONTAL_ZOOM.factor ** direction)
    )
    if (next === horizontalZoom) return
    const nextWidth = size.width * next
    setHorizontalZoom(next)
    setScroll(previous => ({
      ...previous,
      x: Math.min(
        Math.max(0, nextWidth - size.width),
        rescaleScroll(previous.x, size.width, width, nextWidth)
      ),
    }))
  }
  const zoomPitch = (direction: 1 | -1) => {
    const next = Math.round(
      Math.max(
        limits.maxRowHeight * VERTICAL_ZOOM.min,
        Math.min(
          limits.maxRowHeight * VERTICAL_ZOOM.max,
          rowHeight * VERTICAL_ZOOM.factor ** direction
        )
      )
    )
    if (next === rowHeight) return
    setRowHeight(next)
    setScroll(previous => ({
      ...previous,
      y: Math.min(
        Math.max(0, pitches.length * next - size.height),
        rescaleScroll(previous.y, size.height, pitches.length * rowHeight, pitches.length * next)
      ),
    }))
  }
  return {
    roll,
    fold,
    toggleFold: () => setFold(value => !value),
    horizontalZoom,
    canZoomTime: {
      in: horizontalZoom < HORIZONTAL_ZOOM.max,
      out: horizontalZoom > HORIZONTAL_ZOOM.min,
    },
    canZoomPitch: {
      in: rowHeight < Math.round(limits.maxRowHeight * VERTICAL_ZOOM.max),
      out: rowHeight > Math.round(limits.maxRowHeight * VERTICAL_ZOOM.min),
    },
    zoomTime,
    zoomPitch,
    scrollTo,
    measure: (next: { width: number; height: number }) =>
      setSize(previous =>
        previous.width === next.width && previous.height === next.height ? previous : next
      ),
  }
}
