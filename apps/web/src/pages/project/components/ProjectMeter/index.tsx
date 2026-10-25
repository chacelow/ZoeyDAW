import { useEffect, useRef } from "react"
import { useProjectState } from "@/pages/project/adapters"
import {
  readProjectMeters,
  readProjectMeterLevels,
  watchProjectMeter,
  type ProjectMeterSource,
} from "@/pages/project/adapters/realtime"
import { arrangementScheduler } from "@/pages/project/sections/ArrangementPanel/canvas/scheduler"

export function ProjectMeter({
  source,
  className = "h-3 w-3",
  label,
}: {
  readonly source: ProjectMeterSource
  readonly className?: string
  readonly label?: string
}) {
  const container = useRef<HTMLSpanElement>(null)
  const kind = source.kind
  const trackId = source.kind === "track" ? source.trackId : ""
  const channel = source.kind === "input" ? source.channel : ""
  const deviceId = source.kind === "device" ? source.deviceId : ""
  const side = source.kind === "device" ? source.side : "in"
  useEffect(() => {
    const element = container.current
    if (!element) return
    const source: ProjectMeterSource =
      kind === "track"
        ? { kind, trackId }
        : kind === "input"
          ? { kind, channel }
          : kind === "device"
            ? { kind, deviceId, side }
            : { kind: "silent" }
    const bars = element.querySelectorAll<HTMLElement>("[data-meter-fill]")
    const id = `project-meter:${crypto.randomUUID()}`
    const paint = () => {
      const started = performance.now()
      const levels = readProjectMeterLevels(source)
      bars.forEach((bar, index) => {
        const value = levels[index] ?? -Infinity
        bar.style.clipPath = `inset(${100 - Math.max(0, Math.min(100, ((value + 60) / 66) * 100))}% 0 0 0)`
      })
      readProjectMeters()?.recordPaint(performance.now() - started)
    }
    const invalidate = () => {
      if (!readProjectMeters()) paint()
      arrangementScheduler.invalidate(id)
    }
    const detach = arrangementScheduler.register(id, paint)
    const detachMeter = watchProjectMeter(id, source, invalidate)
    const detachState = useProjectState.subscribe(invalidate)
    return () => {
      detach()
      detachMeter()
      detachState()
    }
  }, [kind, trackId, channel, deviceId, side])
  return (
    <span
      ref={container}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={`flex shrink-0 items-stretch gap-px ${className}`}
    >
      {[0, 1].map(index => (
        <span key={index} className="bg-muted relative h-full flex-1 overflow-hidden">
          <span
            data-meter-fill
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, var(--arrangement-meter-good) 0%, var(--arrangement-meter-good) 40.9091%, var(--arrangement-meter-warn) 68.1818%, color-mix(in srgb, var(--arrangement-meter-danger) 75%, var(--arrangement-meter-warn)) 90.9091%, var(--arrangement-meter-danger) 90.9091%)",
              clipPath: "inset(100% 0 0 0)",
            }}
          />
        </span>
      ))}
    </span>
  )
}
