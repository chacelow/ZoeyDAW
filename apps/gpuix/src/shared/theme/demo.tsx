/**
 * Run: bun --hot apps/gpuix/src/shared/theme/demo.tsx
 * Switches the controlled preset and appearance in place. The "Taps" counter
 * lives inside the themed subtree: it survives every switch because the
 * provider only swaps its context value. Plain divs only (`shared` sits below
 * `ui`), painted with the roles Arrangement consumes.
 */
import { useState } from "react"
import { render, useGpuix } from "@gpuix/react"
import { THEME_PRESETS, getThemePreset } from "./presets"
import { ThemeProvider, useTheme } from "./ThemeProvider"
import type { ReactNode } from "react"
import type { Appearance } from "./ThemeProvider"
import type { DerivedThemeColors } from "./colors"
import type { ThemePresetId } from "./presets"

/** Neutral baseline, chromatic preset (light grid line brighter than lane), and the dark outlier. */
const SHOWN: readonly ThemePresetId[] = ["default", "catppuccin", "retro-arcade"]

const SWATCHES: readonly (keyof DerivedThemeColors)[] = [
  "background",
  "card",
  "muted",
  "primary",
  "accent",
  "destructive",
  "border",
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
]

function Choice({
  label,
  selected,
  onSelect,
}: {
  readonly label: string
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  const { colors, control } = useTheme()
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onMouseDown={onSelect}
      onKeyDown={event => {
        if (event.key === "enter") onSelect()
      }}
      style={{
        height: control["--spacing-control-track"] + control["--spacing-control-track-pad"] * 4,
        paddingLeft: control["--spacing-control-track-gap"] * 2,
        paddingRight: control["--spacing-control-track-gap"] * 2,
        display: "flex",
        justifyContent: "center",
        backgroundColor: selected ? colors.primary : colors.secondary,
        color: selected ? colors.primaryForeground : colors.secondaryForeground,
        fontSize: control["--text-control-track"],
        hover: { backgroundColor: selected ? colors.primary : colors.accent },
      }}
    >
      <text>{label}</text>
    </div>
  )
}

function Row({ children }: { readonly children: ReactNode }) {
  const { control } = useTheme()
  return (
    <div
      style={{ display: "flex", flexDirection: "row", gap: control["--spacing-control-track-gap"] }}
    >
      {children}
    </div>
  )
}

function Arrangement() {
  const { colors, project, control, layout } = useTheme()
  const text = { fontSize: control["--text-control-track"], color: colors.foreground }
  const lane = (label: string, selected: boolean) => (
    <div
      role="group"
      aria-label={label}
      style={{
        display: "flex",
        flexDirection: "row",
        height: project.defaultTrackHeight,
        borderBottomWidth: 1,
        borderColor: colors.arrangementLine,
      }}
    >
      <div
        style={{
          width: layout.track.controlsWidth,
          display: "flex",
          flexDirection: "column",
          padding: control["--spacing-control-track-gap"],
          backgroundColor: selected
            ? colors.arrangementSurfaceSelected
            : colors.arrangementSurfaceAlt,
          borderRightWidth: 1,
          borderColor: colors.arrangementLine,
        }}
      >
        <text style={text}>{label}</text>
        <text style={{ ...text, color: colors.mutedForeground }}>Muted label</text>
      </div>
      <div
        style={{
          flexGrow: 1,
          backgroundColor: colors.arrangementSurface,
          display: "flex",
          padding: project.panelGap,
        }}
      >
        <div
          style={{
            width: layout.track.controlsWidth,
            flexGrow: 1,
            backgroundColor: selected
              ? colors.arrangementClipSelected
              : colors.arrangementClipPaper,
            padding: control["--spacing-control-track-gap"],
          }}
        >
          <text style={{ ...text, color: colors.arrangementClipInk }}>Clip ink on paper</text>
        </div>
      </div>
    </div>
  )
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderWidth: 1,
        borderColor: colors.arrangementLine,
      }}
    >
      <div
        style={{
          height: project.minimapMinHeight,
          backgroundColor: colors.arrangementSurfaceAlt,
          borderBottomWidth: 1,
          borderColor: colors.arrangementLine,
          display: "flex",
          alignItems: "center",
          paddingLeft: control["--spacing-control-track-gap"],
        }}
      >
        <text style={{ ...text, color: colors.mutedForeground }}>Ruler · surfaceAlt</text>
      </div>
      {lane("Track 1 · selected", true)}
      {lane("Track 2", false)}
    </div>
  )
}

function Showcase({
  preset,
  appearance,
  onPreset,
  onAppearance,
}: {
  readonly preset: ThemePresetId
  readonly appearance: Appearance
  readonly onPreset: (id: ThemePresetId) => void
  readonly onAppearance: (appearance: Appearance) => void
}) {
  const { colors, project, control } = useTheme()
  const [taps, setTaps] = useState(0)
  const [frames, setFrames] = useState("frames: not read")
  const { renderer } = useGpuix()
  const text = { fontSize: control["--text-control-track"], color: colors.foreground }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: colors.background,
        padding: project.panelGap,
        display: "flex",
        flexDirection: "column",
        gap: project.panelGap,
      }}
    >
      <Row>
        {SHOWN.map(id => (
          <Choice
            key={id}
            label={getThemePreset(id).label}
            selected={preset === id}
            onSelect={() => onPreset(id)}
          />
        ))}
        <Choice
          label="Light"
          selected={appearance === "light"}
          onSelect={() => onAppearance("light")}
        />
        <Choice
          label="Dark"
          selected={appearance === "dark"}
          onSelect={() => onAppearance("dark")}
        />
        <Choice
          label={`Taps ${taps}`}
          selected={false}
          onSelect={() => setTaps(count => count + 1)}
        />
        <Choice
          label="Frames"
          selected={false}
          onSelect={() => {
            const stats = renderer?.getDebugFrameOverlayStats?.()
            setFrames(
              stats
                ? `frames ${stats.frames}, p90 ${stats.p90Ms ?? "-"} ms, max ${stats.maxMs ?? "-"} ms`
                : "frames: unavailable"
            )
          }}
        />
      </Row>
      <text role="status" aria-label="Theme state" style={text}>
        {`${preset} · ${appearance} · ${THEME_PRESETS.length} presets · ${frames}`}
      </text>
      <Row>
        {SWATCHES.map(key => (
          <div
            key={key}
            role="group"
            aria-label={key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: control["--spacing-control-gap"],
            }}
          >
            <div
              style={{
                width: project.identityWidth / 2,
                height: project.minimapMinHeight,
                backgroundColor: colors[key],
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <text style={{ ...text, color: colors.mutedForeground }}>{key}</text>
          </div>
        ))}
      </Row>
      <Arrangement />
    </div>
  )
}

function Demo() {
  const [preset, setPreset] = useState<ThemePresetId>("default")
  const [appearance, setAppearance] = useState<Appearance>("dark")
  return (
    <ThemeProvider preset={preset} appearance={appearance}>
      <Showcase
        preset={preset}
        appearance={appearance}
        onPreset={setPreset}
        onAppearance={setAppearance}
      />
    </ThemeProvider>
  )
}

// Same contract as platform/window/launch.ts; shared cannot import platform.
render(<Demo />, {
  title: "zoeydaw · theme presets",
  width: 960,
  height: 420,
  focus: process.env.GPUIX_BACKGROUND !== "1",
})
