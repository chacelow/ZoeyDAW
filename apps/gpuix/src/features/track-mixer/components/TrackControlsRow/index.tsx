/**
 * Mute / Solo / Record-arm row. Record-arm only applies to tracks that can
 * actually record (`audio`/`midi`), matching
 * `apps/web/.../TrackMixer`'s `track.kind === "audio" || track.kind === "midi"` guard.
 */
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { ToggleButton } from "../ToggleButton"
import type { Track } from "@/shared/model/types"

export interface TrackControlsRowProps {
  readonly track: Track
  readonly onChange: (patch: Partial<Pick<Track, "mute" | "solo" | "armed">>) => void
}

export function TrackControlsRow({ track, onChange }: TrackControlsRowProps) {
  const theme = useTheme()
  const canArm = track.kind === "audio" || track.kind === "midi"
  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "row",
        gap: theme.control["--spacing-control-track-gap"],
      })}
    >
      <ToggleButton
        label="Mute"
        active={track.mute}
        onToggle={mute => onChange({ mute })}
        testId={`track-mixer-mute-${track.id}`}
      />
      <ToggleButton
        label="Solo"
        active={track.solo}
        onToggle={solo => onChange({ solo })}
        testId={`track-mixer-solo-${track.id}`}
      />
      {canArm ? (
        <ToggleButton
          label="Rec"
          active={track.armed}
          onToggle={armed => onChange({ armed })}
          activeColor={theme.colors.destructive}
          testId={`track-mixer-arm-${track.id}`}
        />
      ) : null}
    </div>
  )
}
