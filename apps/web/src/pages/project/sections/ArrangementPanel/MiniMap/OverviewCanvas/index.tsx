import { useEffect, useRef } from "react"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import { paintMidiNotes } from "@/pages/project/sections/ArrangementPanel/canvas/painters/clip-previews"
import {
  readThemeStamp,
  readTokens,
  resolveColor,
} from "@/pages/project/sections/ArrangementPanel/canvas/tokens"
import type { DocumentState } from "@zoeydaw/project-core/types"

export function OverviewCanvas({
  tracks,
  markers,
  patterns,
  numerator,
  bars,
  dividers = true,
}: Pick<DocumentState, "tracks" | "markers" | "patterns"> & {
  readonly numerator: number
  readonly bars: number
  /**
  Row separators belong to the expanded summary. At the collapsed strip they
  would be the brightest thing left, so the summary drops them and keeps only
  the clip blocks.
  */
  readonly dividers?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) {
      return
    }
    const context = element.getContext("2d")
    if (!context) {
      return
    }
    function paint() {
      if (!element || !context) {
        return
      }
      const rect = element.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      if (element.width !== w) {
        element.width = w
      }
      if (element.height !== h) {
        element.height = h
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, rect.width, rect.height)
      const rows = tracks.filter(track => track.kind !== "return" && track.kind !== "main")
      const height = rect.height / Math.max(1, rows.length)
      const tokens = readTokens(element)
      rows.forEach((track, index) => {
        const top = Math.round(index * height * dpr) / dpr
        const bottom = Math.round((index + 1) * height * dpr) / dpr
        if (dividers) {
          context.fillStyle = tokens["--arrangement-line"]
          context.fillRect(0, bottom - 1 / dpr, rect.width, 1 / dpr)
        }
        for (const clip of track.clips) {
          context.fillStyle = clip.mute
            ? tokens["--arrangement-muted-clip-title"]
            : resolveColor(clip.color ?? track.color, tokens, tokens["--primary"])
          const left = ((clip.startBar - 1) / bars) * rect.width
          const width = Math.max(1 / dpr, (clip.lengthBars / bars) * rect.width)
          context.fillRect(left, top, width, Math.max(1 / dpr, bottom - top - 1 / dpr))
          if (clip.kind !== "audio") {
            paintMidiNotes(
              context,
              resolveMidiClip(clip, patterns),
              left,
              top,
              width,
              Math.max(0, bottom - top - 1 / dpr),
              clip.mute ? tokens["--muted-foreground"] : tokens["--arrangement-clip-ink"],
              numerator,
              rect.width
            )
          }
        }
      })
      context.fillStyle = tokens["--muted-foreground"]
      for (const marker of markers) {
        const x = Math.round(((marker.bar - 1) / bars) * rect.width * dpr) / dpr
        context.fillRect(x, 0, 1 / dpr, rect.height)
      }
    }
    const resize = new ResizeObserver(paint)
    resize.observe(element)
    let themeStamp = readThemeStamp()
    const theme = new MutationObserver(() => {
      const next = readThemeStamp()
      if (next === themeStamp) {
        return
      }
      themeStamp = next
      paint()
    })
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    })
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", paint)
    window.addEventListener("resize", paint)
    paint()
    return () => {
      resize.disconnect()
      theme.disconnect()
      media.removeEventListener("change", paint)
      window.removeEventListener("resize", paint)
    }
  }, [tracks, markers, patterns, numerator, bars, dividers])
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-minimap-clips
      className="pointer-events-none absolute inset-0 size-full"
    />
  )
}
