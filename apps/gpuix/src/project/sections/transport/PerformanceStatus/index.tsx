import { useState } from "react"
import { useAnimationFrame } from "@/platform/frame"
import type { BackendTelemetry } from "@/project/model/backend"
import { PopupButton } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { readProjectTelemetry, useProjectState } from "@/project/adapters"
import type { TransportLabels } from "../labels"
import { formatSampleTime } from "../metronome"

export function PerformanceStatus({ labels }: { readonly labels: TransportLabels }) {
  const theme = useTheme()
  const phase = useProjectState(state => state.session.backend.phase)
  const playing = useProjectState(state => state.session.playing)
  const hasTelemetry = useProjectState(state => state.session.levels.main !== undefined)
  const [telemetry, setTelemetry] = useState<BackendTelemetry | null>(readProjectTelemetry)
  useAnimationFrame(
    () => {
      const next = readProjectTelemetry()
      setTelemetry(previous => (previous === next ? previous : next))
    },
    playing || hasTelemetry || telemetry !== null
  )
  const clock = telemetry?.clock
  const sampleRate = clock?.kind === "sample" ? clock.sampleRate : null
  const rate = sampleRate === null ? labels.unavailable : `${sampleRate / 1000} kHz`
  const latency =
    sampleRate !== null && telemetry?.outputLatencyFrames != null
      ? `${((telemetry.outputLatencyFrames / sampleRate) * 1000).toFixed(2)} ms`
      : labels.unavailable
  return (
    <PopupButton
      testId="transport-engine"
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
        <text>{`${labels.engine}: ${phase}`}</text>
        <text>{`${labels.latency}: ${latency}`}</text>
        <text>{`${labels.buffer}: ${labels.unavailable}`}</text>
        <text>{`${labels.cpu}: ${labels.unavailable}`}</text>
        <text>{`${labels.time}: ${clock?.kind === "sample" ? formatSampleTime(clock.frame, clock.sampleRate) : labels.unavailable}`}</text>
      </div>
    </PopupButton>
  )
}
