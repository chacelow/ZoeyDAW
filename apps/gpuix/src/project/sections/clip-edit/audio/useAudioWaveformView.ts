import { useEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, KeyEvent, PublicInstance } from "@gpuix/react"
import { overviewExtent, panSource, sourceRange, zoomSource } from "./source-view"
import { useClipEditorEnvironment } from "../environment"
import type { AudioClip } from "@/project/model/types"
import type { AudioClipSettings } from "@/project/model/audio-editor"
import type { SourceView } from "./source-view"

export interface AudioOverviewHandlers {
  onKeyDown(event: KeyEvent): void
  onMouseDown(event: EventPayload): void
  onMouseMove(event: EventPayload): void
  onMouseUp(): void
}

export function useAudioWaveformView(clip: AudioClip, settings: AudioClipSettings) {
  const { renderer } = useGpuix()
  const environment = useClipEditorEnvironment()
  const range = sourceRange(clip, settings)
  const [view, setView] = useState<SourceView>(range)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [selection, setSelection] = useState<number | null>(null)
  const surface = useRef<PublicInstance | null>(null)
  const overview = useRef<PublicInstance | null>(null)
  const drag = useRef<{ kind: "pan" | "overview"; x: number; start: number; scale: number } | null>(
    null
  )
  useEffect(
    () =>
      environment.subscribeWindowActive(active => {
        if (!active) drag.current = null
      }),
    [environment]
  )

  const extent = overviewExtent(range, view)
  const width = size.width
  const pan = (fraction: number) =>
    setView(previous => panSource(previous, range, previous.span * fraction))
  const zoom = (factor: number) => setView(previous => zoomSource(previous, range, factor, 0.5))
  const fit = () => setView(range)
  const surfaceHandlers = {
    onLayout: (event: EventPayload) => {
      if (event.width !== undefined && event.height !== undefined)
        setSize(previous =>
          previous.width === event.width && previous.height === event.height
            ? previous
            : { width: event.width ?? 0, height: event.height ?? 0 }
        )
    },
    onScroll: (event: EventPayload) => {
      const dy = event.deltaY ?? 0
      const dx = event.deltaX ?? 0
      const bounds = surface.current && renderer?.getElementBounds?.(surface.current.id)
      if (event.modifiers?.cmd || event.modifiers?.ctrl) {
        const anchor = bounds ? ((event.x ?? bounds.x) - bounds.x) / Math.max(1, bounds.width) : 0.5
        setView(previous => zoomSource(previous, range, Math.exp(dy * 0.005), anchor))
      } else if (event.modifiers?.shift || dx) {
        setView(previous =>
          panSource(previous, range, (-(dx || dy) / Math.max(1, width)) * previous.span)
        )
      }
    },
    onMouseDown: (event: EventPayload) => {
      const bounds = surface.current && renderer?.getElementBounds?.(surface.current.id)
      if (!bounds) return
      if (event.button === 1 || ((event.button ?? 0) === 0 && event.modifiers?.alt)) {
        drag.current = {
          kind: "pan",
          x: event.x ?? 0,
          start: view.start,
          scale: view.span / Math.max(1, width),
        }
      } else if ((event.button ?? 0) === 0) {
        setSelection(
          view.start + (((event.x ?? bounds.x) - bounds.x) / Math.max(1, width)) * view.span
        )
      }
    },
    onMouseMove: (event: EventPayload) => {
      const active = drag.current
      if (active?.kind !== "pan") return
      setView(previous =>
        panSource(
          { ...previous, start: active.start },
          range,
          -((event.x ?? active.x) - active.x) * active.scale
        )
      )
    },
    onMouseUp: () => {
      drag.current = null
    },
  }
  const overviewHandlers: AudioOverviewHandlers = {
    onKeyDown: (event: KeyEvent) => {
      if (event.key !== "left" && event.key !== "right") return
      event.preventDefault()
      event.stopPropagation()
      pan(event.key === "left" ? -0.25 : 0.25)
    },
    onMouseDown: (event: EventPayload) => {
      if ((event.button ?? 0) !== 0) return
      if ((event.clickCount ?? 1) >= 2) {
        fit()
        return
      }
      const bounds = overview.current && renderer?.getElementBounds?.(overview.current.id)
      if (!bounds) return
      const scale = extent.span / Math.max(1, bounds.width)
      const clicked = extent.start + ((event.x ?? bounds.x) - bounds.x) * scale
      const start =
        clicked >= view.start && clicked <= view.start + view.span
          ? view.start
          : Math.max(
              extent.start,
              Math.min(extent.start + extent.span - view.span, clicked - view.span / 2)
            )
      setView(previous => ({ ...previous, start }))
      drag.current = { kind: "overview", x: event.x ?? 0, start, scale }
    },
    onMouseMove: (event: EventPayload) => {
      const active = drag.current
      if (active?.kind !== "overview") return
      setView(previous => ({
        ...previous,
        start: Math.max(
          extent.start,
          Math.min(
            extent.start + extent.span - previous.span,
            active.start + ((event.x ?? active.x) - active.x) * active.scale
          )
        ),
      }))
    },
    onMouseUp: () => {
      drag.current = null
    },
  }
  return {
    view,
    size,
    selection,
    extent,
    surface,
    overview,
    surfaceHandlers,
    overviewHandlers,
    pan,
    zoom,
    fit,
  }
}
