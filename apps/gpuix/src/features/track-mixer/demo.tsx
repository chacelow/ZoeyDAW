/**
 * Run: bun --hot src/features/track-mixer/demo.tsx
 * Demo owns Track[]; TrackHeader emits patches without owning project state.
 * Mute/Solo/Rec highlight when engaged; Rec only exists for audio/MIDI tracks.
 * Drag right/up to increase volume (-60..6 dB) or pan (-1..1).
 * Gestures end at the pad boundary; infinite dragging belongs to DragPad.
 */
import { useState } from "react"
import { render } from "@gpuix/react"
import { ThemeProvider, useTheme } from "../../shared/theme/ThemeProvider"
import { sx } from "../../shared/theme/style"
import { TrackHeader } from "./components/TrackHeader"
import type { Track } from "../../shared/model/types"

function TrackMixerDemo() {
  const theme = useTheme()
  const [tracks, setTracks] = useState<Track[]>(() => [
    {
      id: "track-1",
      name: "Lead Synth",
      kind: "midi",
      color: theme.colors.chart1,
      solo: false,
      armed: true,
      mute: false,
      volumeDb: -3.2,
      pan: -0.3,
      heightPx: theme.project.defaultTrackHeight,
      clips: [],
      automation: [],
    },
    {
      id: "track-2",
      name: "Drum Bus",
      kind: "audio",
      color: theme.colors.chart2,
      solo: true,
      armed: false,
      mute: false,
      volumeDb: 0,
      pan: 0,
      heightPx: theme.project.defaultTrackHeight,
      clips: [],
      automation: [],
    },
    {
      id: "track-3",
      name: "FX Group",
      kind: "group",
      color: theme.colors.chart3,
      solo: false,
      armed: false,
      mute: true,
      volumeDb: -60,
      pan: 0.6,
      heightPx: theme.project.defaultTrackHeight,
      clips: [],
      automation: [],
    },
  ])

  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "column",
        gap: theme.control["--spacing-control-track-gap"],
        padding: theme.project.panelGap,
        width: "100%",
        height: "100%",
        backgroundColor: theme.colors.background,
      })}
    >
      {tracks.map(track => (
        <TrackHeader
          key={track.id}
          track={track}
          onChange={patch => {
            setTracks(current =>
              current.map(item => (item.id === track.id ? { ...item, ...patch } : item))
            )
          }}
          testId={`track-header-${track.id}`}
        />
      ))}
    </div>
  )
}

render(
  <ThemeProvider>
    <TrackMixerDemo />
  </ThemeProvider>,
  { title: "track-mixer demo", width: 460, height: 360 }
)
