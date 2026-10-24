import { useEffect } from "react"
import { findMediaSource } from "@zoeydaw/project-core/media"
import { nativeClipWaveform } from "@/pages/project/adapters/backend/clip-waveform"
import {
  releaseWaveformRangeDemand,
  setWaveformRangeDemand,
  waveformRangeRequests,
} from "@/pages/project/adapters/backend/waveform-ranges"
import type { SourceWaveformRangeRequest } from "@/pages/project/adapters/backend/waveform-ranges"
import { arrangementScene } from "./scene"
import type { ArrangementScene } from "./scene"
import { arrangementBodyBottom, arrangementBodyTop, layoutTrackRows } from "./layout"

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
      const { width, height, pxPerBar, scrollX } = scene.viewport
      const requests: SourceWaveformRangeRequest[] = []
      if (width > 0 && pxPerBar > 0) {
        for (const row of layoutTrackRows(scene)) {
          if (
            row.top + row.height <= arrangementBodyTop() ||
            row.top >= arrangementBodyBottom(height)
          )
            continue
          for (const clip of row.track.clips) {
            if (clip.kind !== "audio") continue
            const left = (clip.startBar - 1) * pxPerBar - scrollX
            const clipWidth = clip.lengthBars * pxPerBar
            const visibleStart = Math.max(0, -left)
            const visibleEnd = Math.min(clipWidth, width - left)
            if (visibleEnd <= visibleStart) continue
            const source = findMediaSource(scene.media, clip.sourceId)
            const envelope = nativeClipWaveform(
              clip,
              scene.media,
              scene.transport.bpm,
              scene.transport.numerator,
              scene.transport.denominator
            )
            if (!source || !envelope) continue
            requests.push(
              ...waveformRangeRequests(
                source,
                envelope,
                envelope.origin + (visibleStart / clipWidth) * clip.lengthBars * envelope.rate,
                envelope.origin + (visibleEnd / clipWidth) * clip.lengthBars * envelope.rate,
                visibleEnd - visibleStart
              )
            )
          }
        }
      }
      setWaveformRangeDemand("arrangement", requests)
    }
    refresh(arrangementScene.get())
    const unsubscribe = arrangementScene.subscribe(refresh)
    return () => {
      unsubscribe()
      releaseWaveformRangeDemand("arrangement")
    }
  }, [])
}
