import { useLayoutEffect, useRef, useState } from "react"
import { ALL_PITCHES, KEY_WIDTH, RULER_HEIGHT } from "./geometry"
import type { MidiClipContent } from "@zoeydaw/project-core/types"

export function useMidiViewport(clip: MidiClipContent, totalBeats: number) {
  const viewport = useRef<HTMLDivElement>(null)
  const [fold, setFold] = useState(false)
  const [horizontalZoom, setHorizontalZoom] = useState(1)
  const [verticalZoom, setVerticalZoom] = useState(1)
  const [availableWidth, setAvailableWidth] = useState(600)
  const [availableHeight, setAvailableHeight] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const pitches = fold
    ? [...new Set(clip.notes.map(note => note.pitch))].sort((a, b) => b - a)
    : ALL_PITCHES
  if (pitches.length === 0) pitches.push(60)
  const rowHeight = Math.round(18 * verticalZoom)
  const width = Math.max(availableWidth - KEY_WIDTH, totalBeats * 96) * horizontalZoom
  const sourceOffsetBeats = ((clip.sourceOffsetBars ?? 0) / clip.lengthBars) * totalBeats
  const previous = useRef({ clipId: "", fold, rowHeight, width, sourceOffsetBeats, totalBeats })
  const pendingFit = useRef(true)
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const last = previous.current
    const changedWindow =
      last.clipId !== clip.id ||
      last.fold !== fold ||
      last.sourceOffsetBeats !== sourceOffsetBeats ||
      last.totalBeats !== totalBeats
    if (changedWindow) pendingFit.current = true
    const visibleHeight = Math.max(0, element.clientHeight - RULER_HEIGHT)
    if (pendingFit.current && (changedWindow || visibleHeight > 0)) {
      const rows = clip.notes
        .filter(
          note =>
            note.startBeat < sourceOffsetBeats + totalBeats &&
            note.startBeat + note.lengthBeats > sourceOffsetBeats
        )
        .map(note => pitches.indexOf(note.pitch))
        .filter(row => row >= 0)
      const firstRow = rows.length ? Math.min(...rows) : Math.max(0, pitches.indexOf(60))
      const lastRow = rows.length ? Math.max(...rows) : firstRow
      if (visibleHeight > 0) {
        const fittedRowHeight = Math.max(
          6,
          Math.min(18, Math.floor(visibleHeight / (lastRow - firstRow + 3)))
        )
        if (fittedRowHeight !== rowHeight) {
          setVerticalZoom(fittedRowHeight / 18)
          return
        }
        pendingFit.current = false
      }
      const center = ((firstRow + lastRow + 1) / 2) * rowHeight
      element.scrollTop = Math.max(0, center - visibleHeight / 2)
      if (last.clipId !== clip.id) element.scrollLeft = 0
    } else {
      if (last.rowHeight !== rowHeight)
        element.scrollTop =
          ((element.scrollTop + visibleHeight / 2) * rowHeight) / last.rowHeight - visibleHeight / 2
      if (last.width !== width)
        element.scrollLeft =
          ((element.scrollLeft + element.clientWidth / 2) * width) / last.width -
          element.clientWidth / 2
    }
    previous.current = { clipId: clip.id, fold, rowHeight, width, sourceOffsetBeats, totalBeats }
    setScrollLeft(element.scrollLeft)
  }, [
    availableHeight,
    clip.id,
    clip.notes,
    fold,
    pitches,
    rowHeight,
    sourceOffsetBeats,
    totalBeats,
    width,
  ])
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      setAvailableWidth(element.clientWidth)
      setAvailableHeight(element.clientHeight)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return {
    viewport,
    fold,
    setFold,
    horizontalZoom,
    setHorizontalZoom,
    verticalZoom,
    setVerticalZoom,
    pitches,
    rowHeight,
    width,
    scrollLeft,
    setScrollLeft,
  }
}
