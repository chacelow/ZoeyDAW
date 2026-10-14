/**
 * Track header + mixer control slice: name row, Mute/Solo/Record-arm
 * toggles, and Volume/Pan drag controls for one `Track`. Mirrors the
 * behaviour of `apps/web/src/pages/project/sections/ArrangementPanel/
 * TrackHeader/{TrackIdentity,TrackMixer}` as native gpuix elements — layout
 * and styling are rebuilt from `useTheme()` tokens, not copied DOM/CSS.
 */
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { PanDrag } from "../PanDrag"
import { TrackControlsRow } from "../TrackControlsRow"
import { VolumeDrag } from "../VolumeDrag"
import type { Track } from "@/shared/model/types"

export interface TrackHeaderProps {
  readonly track: Track
  readonly onChange: (
    patch: Partial<Pick<Track, "mute" | "solo" | "armed" | "volumeDb" | "pan">>
  ) => void
  readonly testId?: string
}

export function TrackHeader({ track, onChange, testId }: TrackHeaderProps) {
  const theme = useTheme()
  return (
    <div
      role="group"
      aria-label={`Mixer ${track.name}`}
      testId={testId}
      style={sx({
        display: "flex",
        flexDirection: "column",
        gap: theme.control["--spacing-control-track-gap"],
        padding: theme.control["--spacing-control-track-pad"],
        borderRadius: theme.control["--spacing-control-track-gap"],
        backgroundColor: theme.colors.card,
        width: theme.project.identityWidth + theme.project.controlsWidth,
      })}
    >
      <div
        style={sx({
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: theme.control["--spacing-control-gap"],
        })}
      >
        <div
          style={sx({
            width: theme.control["--spacing-control-icon"],
            height: theme.control["--spacing-control-icon"],
            borderRadius: theme.control["--spacing-control-gap"],
            backgroundColor: theme.colors.chart1,
            flexShrink: 0,
          })}
        />
        <text
          style={{
            color: theme.colors.foreground,
            fontSize: theme.control["--text-control-track"],
            fontWeight: 500,
          }}
        >
          {track.name}
        </text>
      </div>
      <TrackControlsRow track={track} onChange={onChange} />
      <div
        style={sx({
          display: "flex",
          flexDirection: "row",
          gap: theme.control["--spacing-control-track-gap"],
        })}
      >
        <VolumeDrag
          label={`Volume ${track.name}`}
          value={track.volumeDb}
          onChange={volumeDb => onChange({ volumeDb })}
          testId={`track-mixer-volume-${track.id}`}
        />
        <PanDrag
          label={`Pan ${track.name}`}
          value={track.pan}
          onChange={pan => onChange({ pan })}
          testId={`track-mixer-pan-${track.id}`}
        />
      </div>
    </div>
  )
}
