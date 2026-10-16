import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { usePreference } from "@/platform/settings"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { clampScroll } from "./layout"
import { fitRows, rescaleScroll, rollPitches } from "./viewport"
import type { MidiClip } from "@/project/model/types"
import type { RollGeometry, SourceWindow } from "./layout"

/**
Local view state of one piano roll: fold, zoom and scroll never enter the project or its history.
The measured size arrives through `onLayout`; a fit runs when the clip, fold or source window changes
and once the first non-zero height is known.
*/
export function useMidiViewport(clip: MidiClip, window: SourceWindow) {
  const theme = useTheme()
  const midi = usePreference("midi")
  const viewport = usePreference("midiViewport")
  const limits = useMemo(
    () => ({
      minRowHeight: theme.project.midiRowMinHeight,
      maxRowHeight: theme.project.midiRowMaxHeight,
    }),
    [theme.project.midiRowMinHeight, theme.project.midiRowMaxHeight]
  )
  const [foldOverride, setFold] = useState<boolean | null>(null)
  const fold = foldOverride ?? midi.fold
  const [zoomOverride, setHorizontalZoom] = useState<number | null>(null)
  const horizontalZoom = zoomOverride ?? midi.zoom
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [rowHeight, setRowHeight] = useState<number>(limits.maxRowHeight)
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const pitches = useMemo(
    () => rollPitches(clip.notes, fold, midi.initialPitch),
    [clip.notes, fold, midi.initialPitch]
  )
  // Like Live, zoom 1 fits the whole source window to the editor width.
  const width = size.width * horizontalZoom
  const roll = useMemo<RollGeometry>(
    () => ({
      pitches,
      rowHeight,
      width,
      scrollX: scroll.x,
      scrollY: scroll.y,
      viewWidth: size.width,
      viewHeight: size.height,
      window,
    }),
    [pitches, rowHeight, width, scroll.x, scroll.y, size.width, size.height, window]
  )
  const fitKey = `${clip.id}|${fold}|${window.sourceOffsetBeats}|${window.totalBeats}`
  const fitted = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (fitted.current !== fitKey && size.height > 0) {
      const fit = fitRows(clip.notes, pitches, window, size.height, limits, midi.initialPitch)
      fitted.current = fitKey
      setRowHeight(fit.rowHeight)
      setScroll({ x: 0, y: fit.scrollY })
      return
    }
    setScroll(previous => {
      const next = clampScroll(previous.x, previous.y, roll)
      return previous.x === next.scrollX && previous.y === next.scrollY
        ? previous
        : { x: next.scrollX, y: next.scrollY }
    })
  }, [
    fitKey,
    size.width,
    size.height,
    width,
    rowHeight,
    clip.notes,
    pitches,
    window,
    limits,
    midi.initialPitch,
  ])

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
      viewport.horizontalMin,
      Math.min(viewport.horizontalMax, horizontalZoom * viewport.horizontalFactor ** direction)
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
        limits.maxRowHeight * viewport.pitchMin,
        Math.min(
          limits.maxRowHeight * viewport.pitchMax,
          rowHeight * viewport.pitchFactor ** direction
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
    toggleFold: () => setFold(!fold),
    horizontalZoom,
    canZoomTime: {
      in: horizontalZoom < viewport.horizontalMax,
      out: horizontalZoom > viewport.horizontalMin,
    },
    canZoomPitch: {
      in: rowHeight < Math.round(limits.maxRowHeight * viewport.pitchMax),
      out: rowHeight > Math.round(limits.maxRowHeight * viewport.pitchMin),
    },
    zoomTime,
    zoomPitch,
    scrollTo,
    measure: (next: { width: number; height: number }) => {
      if (size.width === next.width && size.height === next.height) return
      if (size.width !== next.width && size.width > 0) {
        setScroll(previous => ({ ...previous, x: (previous.x * next.width) / size.width }))
      }
      setSize(next)
    },
  }
}
