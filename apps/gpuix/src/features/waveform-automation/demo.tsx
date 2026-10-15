/**
 * Manual verification entry for this feature only. Run with:
 *   bun --hot src/features/waveform-automation/demo.tsx
 * (from apps/gpuix). Not part of the app's public surface and not wired
 * into `main.tsx`, so it never competes with other slices for that file.
 */
import { render } from "@gpuix/react"
import { sx } from "../../shared/theme/style"
import { ThemeProvider, useTheme } from "../../shared/theme/ThemeProvider"
import { AutomationCurveView } from "./AutomationCurveView"
import type { AutomationPoint } from "../../shared/model/types"

const demoAutomationPoints: AutomationPoint[] = [
  { id: "p0", bar: 1, value: 0.2, curve: 0 },
  { id: "p1", bar: 5, value: 0.85, curve: 0.6 },
  { id: "p2", bar: 9, value: 0.35, curve: -0.6 },
  { id: "p3", bar: 13, value: 0.7, curve: 0.3 },
  { id: "p4", bar: 17, value: 0.5, curve: 0 },
]

function WaveformAutomationDemo() {
  const theme = useTheme()
  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "column",
        gap: theme.project.panelGap * 2,
        padding: 20,
        width: "100%",
        height: "100%",
        backgroundColor: theme.colors.background,
      })}
    >
      <text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: 600 }}>
        waveform-automation demo
      </text>
      <div style={sx({ display: "flex", flexDirection: "column", gap: 8 })}>
        <text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
          Automation curve — AutomationPoint[], eased segments
        </text>
        <AutomationCurveView
          points={demoAutomationPoints}
          color={theme.colors.chart2}
          width={480}
          height={120}
        />
      </div>
    </div>
  )
}

render(
  <ThemeProvider>
    <WaveformAutomationDemo />
  </ThemeProvider>,
  { title: "waveform-automation demo", width: 560, height: 420 }
)
