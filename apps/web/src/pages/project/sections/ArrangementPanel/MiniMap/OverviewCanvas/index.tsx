import { useEffect, useRef } from "react"
import type { DocumentState } from "@/pages/project/model/types"
import {
  readThemeStamp,
  readTokens,
  resolveColor,
} from "@/pages/project/sections/ArrangementPanel/canvas/tokens"

export function OverviewCanvas({
  tracks,
  markers,
  bars,
}: Pick<DocumentState, "tracks" | "markers"> & { bars: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext("2d")
    if (!ctx) return
    function paint() {
      if (!el || !ctx) return
      const rect = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(rect.width * dpr),
        h = Math.round(rect.height * dpr)
      if (el.width !== w) el.width = w
      if (el.height !== h) el.height = h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      const rows = tracks.filter(track => track.kind !== "return" && track.kind !== "main")
      const height = rect.height / Math.max(1, rows.length)
      const tokens = readTokens(el)
      rows.forEach((track, index) => {
        const top = Math.round(index * height * dpr) / dpr
        const bottom = Math.round((index + 1) * height * dpr) / dpr
        ctx.fillStyle = tokens["--arrangement-line"]
        ctx.fillRect(0, bottom - 1 / dpr, rect.width, 1 / dpr)
        for (const clip of track.clips) {
          ctx.fillStyle = resolveColor(clip.color ?? track.color, tokens, tokens["--primary"])
          const left = ((clip.startBar - 1) / bars) * rect.width
          const width = Math.max(1 / dpr, (clip.lengthBars / bars) * rect.width)
          ctx.fillRect(left, top, width, Math.max(1 / dpr, bottom - top - 1 / dpr))
        }
      })
      ctx.fillStyle = tokens["--muted-foreground"]
      for (const marker of markers) {
        const x = Math.round(((marker.bar - 1) / bars) * rect.width * dpr) / dpr
        ctx.fillRect(x, 0, 1 / dpr, rect.height)
      }
    }
    const resize = new ResizeObserver(paint)
    resize.observe(el)
    let themeStamp = readThemeStamp()
    const theme = new MutationObserver(() => {
      const next = readThemeStamp()
      if (next === themeStamp) return
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
  }, [tracks, markers, bars])
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-minimap-clips
      className="pointer-events-none absolute inset-0 size-full"
    />
  )
}
