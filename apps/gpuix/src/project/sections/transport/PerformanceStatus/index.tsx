import { useEffect, useState } from "react"
import { flushSync } from "@gpuix/react"
import { useAnimationFrame, useResumeFrame } from "@/platform/frame"
import type { BackendTelemetry } from "@/project/model/backend"
import { PopupButton } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { readProjectTelemetry, useProjectState } from "@/project/adapters"
import type { TransportLabels } from "../labels"

export function PerformanceStatus({ labels }: { readonly labels: TransportLabels }) {
  const theme = useTheme()
  const phase = useProjectState(state => state.session.backend.phase)
  const playing = useProjectState(state => state.session.playing)
  const levels = useProjectState(state => state.session.levels)
  const hasTelemetry = levels.main !== undefined
  const [telemetry, setTelemetry] = useState<BackendTelemetry | null>(readProjectTelemetry)
  const [popupOpen, setPopupOpen] = useState(false)
  const refreshTelemetry = () => {
    const next = readProjectTelemetry()
    if (!next) return
    setTelemetry(previous => {
      if (popupOpen || previous === null) return next
      const previousRate = previous.clock.kind === "sample" ? previous.clock.sampleRate : null
      const nextRate = next.clock.kind === "sample" ? next.clock.sampleRate : null
      return previousRate === nextRate ? previous : next
    })
  }
  useEffect(refreshTelemetry, [levels, phase, playing, popupOpen])
  const needsFrames = playing || (popupOpen && hasTelemetry)
  useAnimationFrame(refreshTelemetry, needsFrames)
  useResumeFrame(() => flushSync(refreshTelemetry), needsFrames)
  const clock = telemetry?.clock
  const sampleRate = clock?.kind === "sample" ? clock.sampleRate : null
  const rate = sampleRate === null ? labels.unavailable : labels.formats.sampleRate(sampleRate)
  const latency =
    sampleRate !== null && telemetry?.outputLatencyFrames != null
      ? labels.formats.latency((telemetry.outputLatencyFrames / sampleRate) * 1000)
      : labels.unavailable
  return (
    <PopupButton
      testId="transport-engine"
      open={popupOpen}
      onOpenChange={setPopupOpen}
      label={labels.engine}
      side="bottom"
      align="end"
      size="transport"
      trigger={<text>{rate}</text>}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: theme.control["--spacing-control-track-gap"],
        }}
      >
        <text>{`${labels.engine}: ${labels.enginePhases[phase]}`}</text>
        <text>{`${labels.latency}: ${latency}`}</text>
        <text>{`${labels.buffer}: ${labels.unavailable}`}</text>
        <text>{`${labels.cpu}: ${labels.unavailable}`}</text>
        <text>{`${labels.time}: ${clock?.kind === "sample" ? labels.formats.duration(clock.frame / clock.sampleRate, "transport") : labels.unavailable}`}</text>
      </div>
    </PopupButton>
  )
}
