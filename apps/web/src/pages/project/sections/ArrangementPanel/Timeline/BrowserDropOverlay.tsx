import { useLayoutEffect, useRef } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { defaultAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { createTrack } from "@zoeydaw/project-core/reducers"
import type { AudioClip } from "@zoeydaw/project-core/types"
import { DEFAULT_TRACK_HEIGHT, TRACK_TITLE_HEIGHT } from "@/pages/project/layout"
import { arrangementScene } from "../canvas/scene"
import { clipVisualGeometry } from "../canvas/clip-geometry"
import { arrangementBodyTop, layoutTrackRows } from "../canvas/layout"
import { paintClip } from "../canvas/painters/clip"
import { readTokens, resolveColor } from "../canvas/tokens"
import { useBrowserDropWaveform } from "./useBrowserDropWaveform"
import type { useBrowserAudioDrop } from "./useBrowserAudioDrop"

type BrowserDrop = Pick<
  ReturnType<typeof useBrowserAudioDrop>,
  "target" | "source" | "importing" | "clip"
>

export function BrowserDropOverlay({ browserDrop }: { readonly browserDrop: BrowserDrop }) {
  const { t } = useTranslation()
  const canvas = useRef<HTMLCanvasElement>(null)
  const { source, target } = browserDrop
  const waveform = useBrowserDropWaveform(source, target)
  useLayoutEffect(() => {
    const element = canvas.current
    if (!element) return
    const context = element.getContext("2d")
    if (!context) return
    const scene = arrangementScene.get()
    const { width, height, dpr, pxPerBar, scrollX } = scene.viewport
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)
    if (element.width !== pixelWidth) element.width = pixelWidth
    if (element.height !== pixelHeight) element.height = pixelHeight
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    if (!source || !target || width <= 0 || height <= 0) return
    const tokens = readTokens(element.parentElement ?? element)
    const color = resolveColor(target.color, tokens, tokens["--primary"])
    const row = layoutTrackRows(scene).find(row => row.track.id === target.trackId)
    const track =
      row?.track ?? createTrack("audio", [...scene.tracks], undefined, DEFAULT_TRACK_HEIGHT)
    const duration = waveform.media
      ? waveform.media.frames / waveform.media.sampleRate
      : source.durationSeconds
    const secondsPerBar =
      (60 * scene.transport.numerator * 4) / (scene.transport.bpm * scene.transport.denominator)
    const lengthBars =
      browserDrop.clip?.lengthBars ?? (duration === null ? 0 : duration / secondsPerBar)
    context.font = "10px ui-sans-serif, system-ui, sans-serif"
    context.textBaseline = "middle"
    if (lengthBars <= 0) {
      context.globalAlpha = 0.5
      context.fillStyle = color
      const labelWidth = context.measureText(source.name).width + 8
      context.fillRect(target.left, target.top + 1, labelWidth, TRACK_TITLE_HEIGHT)
      context.fillStyle = tokens["--arrangement-clip-ink"]
      context.fillText(source.name, target.left + 4, target.top + 1 + TRACK_TITLE_HEIGHT / 2)
      context.globalAlpha = 1
      return
    }
    const clip: AudioClip = browserDrop.clip ?? {
      id: `browser-preview-${source.token}`,
      kind: "audio",
      label: source.name,
      startBar: target.startBar,
      lengthBars,
      sourceId: waveform.media?.id ?? null,
      gainDb: 0,
      audioSettings: {
        ...defaultAudioClipSettings(scene.transport.bpm, { lengthBars }),
        warp: false,
        loop: false,
      },
    }
    const geometry = clipVisualGeometry(
      {
        clip,
        track,
        left: (clip.startBar - 1) * pxPerBar - scrollX,
        top: row?.top ?? target.top,
        width: lengthBars * pxPerBar,
        height: row?.contentHeight ?? target.height,
      },
      clip,
      track,
      false
    )
    context.save()
    context.beginPath()
    context.rect(0, Math.max(arrangementBodyTop(), target.top), width, target.height)
    context.clip()
    paintClip(
      context,
      clip,
      geometry,
      color,
      tokens,
      { selected: false, hovered: false, automationMode: false, ghost: true },
      width,
      { ...scene, media: browserDrop.clip ? scene.media : waveform.media ? [waveform.media] : [] },
      waveform.ranges
    )
    context.restore()
  }, [source, target, browserDrop.clip, waveform.media, waveform.ranges])

  return (
    <>
      <canvas
        ref={canvas}
        data-browser-audio-ghost={target && source ? "true" : undefined}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 size-full"
      />
      {browserDrop.importing && (
        <div
          role="status"
          className="bg-background text-muted-foreground pointer-events-none absolute top-1 right-1 z-30 px-2 py-1 text-xs"
        >
          {t("settings.import.importing")}
        </div>
      )}
    </>
  )
}
