import { useEffect, useState } from "react"
import { render, useGpuix } from "@gpuix/react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Surface } from "./Surface"
import { VIEWPORT } from "./workload"

function Probe() {
  const { renderer } = useGpuix()
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [light, setLight] = useState(false)
  const [chinese, setChinese] = useState(false)
  useEffect(() => {
    renderer?.resetDebugFrameOverlayStats?.()
    process.stdout.write(
      "F4 quad probe ready; wheel scrolls; +/- zoom; T theme; L language; S stats\n"
    )
  }, [renderer])
  return (
    <ThemeProvider appearance={light ? "light" : "dark"}>
      <div
        role="application"
        aria-label={`${chinese ? "批量矩形" : "Quad batch"} x=${viewport.x} y=${viewport.y} zoom=${viewport.zoom}`}
        autoFocus
        onScroll={event =>
          setViewport(v => ({
            ...v,
            x: Math.max(0, v.x + (event.deltaX ?? 0)),
            y: Math.max(0, v.y + (event.deltaY ?? 0)),
          }))
        }
        onKeyDown={event => {
          if (event.key === "+" || event.key === "=")
            setViewport(v => ({ ...v, zoom: Math.min(4, v.zoom * 1.25) }))
          if (event.key === "-") setViewport(v => ({ ...v, zoom: Math.max(0.25, v.zoom / 1.25) }))
          if (event.key === "t") setLight(v => !v)
          if (event.key === "l") setChinese(v => !v)
          if (event.key === "s")
            process.stdout.write(
              `${JSON.stringify({ event: "quad-window-stats", viewport, native: renderer?.getDebugFrameOverlayStats?.() })}\n`
            )
        }}
        style={{ width: VIEWPORT.width, height: VIEWPORT.height }}
      >
        <Surface mode="quad" viewport={viewport} />
      </div>
    </ThemeProvider>
  )
}
render(<Probe />, { title: "F4 quad-batch 50 tracks x 50 clips", ...VIEWPORT, focus: false })
