import type { NativeRecordingPreview } from "@/shared/native/audio"
import { cachedWaveformRanges } from "@/pages/project/adapters/backend/waveform-ranges"
import { TRACK_TITLE_HEIGHT } from "@/pages/project/layout"
import { arrangementBodyTop, arrangementBodyBottom, layoutTrackRows, pinnedTopFor } from "../layout"
import { resolveColor } from "../tokens"
import type { ArrangementScene } from "../scene"
import type { TokenSet } from "../tokens"

export function paintRecording(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: TokenSet,
  preview: NativeRecordingPreview | null
): void {
  if (!preview) return
  const { width, height, dpr, pxPerBar, scrollX } = scene.viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) return
  const rows = layoutTrackRows(scene)
  const bottom = Math.min(
    arrangementBodyBottom(height),
    pinnedTopFor(scene.tracks, height, { mode: scene.automationMode, lanes: scene.automationLanes })
  )
  context.save()
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.beginPath()
  context.rect(0, arrangementBodyTop(), width, Math.max(0, bottom - arrangementBodyTop()))
  context.clip()
  for (const take of preview.tracks) {
    const row = rows.find(item => item.track.id === take.trackId)
    if (!row || take.durationBars <= 0) continue
    const clip = row.track.clips.find(clip => clip.id === take.clipId)
    const source =
      clip?.kind === "audio" ? scene.media.find(source => source.id === clip.sourceId) : undefined
    if (source && cachedWaveformRanges(source).length > 0) continue
    const left = (take.startBar - 1) * pxPerBar - scrollX
    const clipWidth = take.durationBars * pxPerBar
    if (
      left + clipWidth <= 0 ||
      left >= width ||
      row.top >= bottom ||
      row.top + row.contentHeight <= arrangementBodyTop()
    )
      continue
    const top = Math.round(row.top + 1)
    const contentHeight = Math.max(4, row.contentHeight - 3)
    const titleHeight = row.track.collapsed
      ? contentHeight
      : Math.min(TRACK_TITLE_HEIGHT, contentHeight)
    context.save()
    context.beginPath()
    context.rect(
      Math.max(0, left),
      top,
      Math.max(0, Math.min(width, left + clipWidth) - Math.max(0, left)),
      contentHeight
    )
    context.clip()
    context.fillStyle = tokens["--arrangement-automation"]
    context.globalAlpha = 0.18
    context.fillRect(left, top, clipWidth, contentHeight)
    context.globalAlpha = 1
    context.fillStyle = resolveColor(row.track.color, tokens, tokens["--primary"])
    context.fillRect(left, top, clipWidth, titleHeight)
    context.fillStyle = tokens["--arrangement-clip-ink"]
    context.font = "10px ui-sans-serif, system-ui, sans-serif"
    context.textBaseline = "middle"
    context.fillText(row.track.name, left + 4, top + titleHeight / 2)
    const bodyHeight = contentHeight - titleHeight
    if (bodyHeight > 0 && take.channels.length > 0) {
      const channelHeight = bodyHeight / take.channels.length
      for (const [index, channel] of take.channels.entries()) {
        const count = channel.min.length
        if (count === 0) continue
        const center = top + titleHeight + channelHeight * (index + 0.5)
        const scale = channelHeight * 0.48
        const first = Math.max(0, Math.floor((-left * count) / clipWidth))
        const last = Math.min(count, Math.ceil(((width - left) * count) / clipWidth))
        if (last <= first) continue
        context.beginPath()
        context.moveTo(
          left + ((first + 0.5) * clipWidth) / count,
          center - Math.max(-1, Math.min(1, channel.max[first])) * scale
        )
        for (let bin = first + 1; bin < last; bin++) {
          context.lineTo(
            left + ((bin + 0.5) * clipWidth) / count,
            center - Math.max(-1, Math.min(1, channel.max[bin])) * scale
          )
        }
        for (let bin = last - 1; bin >= first; bin--) {
          context.lineTo(
            left + ((bin + 0.5) * clipWidth) / count,
            center - Math.max(-1, Math.min(1, channel.min[bin])) * scale
          )
        }
        context.closePath()
        context.fill()
      }
    }
    context.restore()
  }
  context.restore()
}
