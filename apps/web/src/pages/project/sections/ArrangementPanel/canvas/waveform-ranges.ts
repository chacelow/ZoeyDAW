import { useEffect } from "react"
import { findMediaSource } from "@zoeydaw/project-core/media"
import { nativeClipWaveform } from "@/pages/project/adapters/backend/clip-waveform"
import {
  releaseWaveformRangeDemand,
  setWaveformRangeDemand,
  waveformRangeRequests,
  waveformOverviewRequest,
} from "@/pages/project/adapters/backend/waveform-ranges"
import type { SourceWaveformRangeRequest } from "@/pages/project/adapters/backend/waveform-ranges"
import { arrangementScene } from "./scene"
import type { ArrangementScene } from "./scene"
import { arrangementBodyBottom, arrangementBodyTop, layoutTrackRows } from "./layout"

const WAVEFORM_OVERSCAN_VIEWPORTS = 1

export function arrangementWaveformRangeRequests(
  scene: ArrangementScene
): SourceWaveformRangeRequest[] {
  const { width, height, pxPerBar, scrollX } = scene.viewport
  if (width <= 0 || pxPerBar <= 0) return []
  const visible: SourceWaveformRangeRequest[] = []
  const overviews: SourceWaveformRangeRequest[] = []
  const buffered: SourceWaveformRangeRequest[] = []
  const top = arrangementBodyTop()
  const bottom = arrangementBodyBottom(height)
  const verticalBuffer = (bottom - top) * WAVEFORM_OVERSCAN_VIEWPORTS
  const horizontalBuffer = width * WAVEFORM_OVERSCAN_VIEWPORTS
  for (const row of layoutTrackRows(scene)) {
    if (row.top + row.height <= top - verticalBuffer || row.top >= bottom + verticalBuffer) continue
    const rowVisible = row.top + row.height > top && row.top < bottom
    for (const clip of row.track.clips) {
      if (clip.kind !== "audio") continue
      const left = (clip.startBar - 1) * pxPerBar - scrollX
      const clipWidth = clip.lengthBars * pxPerBar
      const bufferStart = Math.max(0, -horizontalBuffer - left)
      const bufferEnd = Math.min(clipWidth, width + horizontalBuffer - left)
      if (bufferEnd <= bufferStart) continue
      const source = findMediaSource(scene.media, clip.sourceId)
      const envelope = nativeClipWaveform(
        clip,
        scene.media,
        scene.transport.bpm,
        scene.transport.numerator,
        scene.transport.denominator
      )
      if (!source || !envelope) continue
      const requestWindow = (start: number, end: number) =>
        waveformRangeRequests(
          source,
          envelope,
          envelope.origin + (start / clipWidth) * clip.lengthBars * envelope.rate,
          envelope.origin + (end / clipWidth) * clip.lengthBars * envelope.rate,
          end - start,
          true
        )
      const visibleStart = Math.max(0, -left)
      const visibleEnd = Math.min(clipWidth, width - left)
      if (rowVisible && visibleEnd > visibleStart)
        visible.push(...requestWindow(visibleStart, visibleEnd))
      overviews.push(...waveformOverviewRequest(source))
      buffered.push(...requestWindow(bufferStart, bufferEnd))
    }
  }
  return [...visible, ...overviews, ...buffered]
}

export function useArrangementWaveformRanges(): void {
  useEffect(() => {
    let previous: ArrangementScene | null = null
    const refresh = (scene: ArrangementScene) => {
      if (
        previous &&
        previous.tracks === scene.tracks &&
        previous.previewTracks === scene.previewTracks &&
        previous.media === scene.media &&
        previous.transport === scene.transport &&
        previous.viewport === scene.viewport
      )
        return
      previous = scene
      setWaveformRangeDemand("arrangement", arrangementWaveformRangeRequests(scene))
    }
    refresh(arrangementScene.get())
    const unsubscribe = arrangementScene.subscribe(refresh)
    return () => {
      unsubscribe()
      releaseWaveformRangeDemand("arrangement")
    }
  }, [])
}
