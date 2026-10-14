/**
 * Volume drag control: -60..6 dB, mirrors `DragPadBar` defaults from
 * `apps/web/.../TrackMixer`'s `MixerLevel`.
 */
import { useRelativeDrag } from "../../hooks/useRelativeDrag"
import {
  formatVolumeDb,
  normalizeVolume,
  VOLUME_MAX_DB,
  VOLUME_MIN_DB,
} from "../../model/formatters"
import { DragControlShell } from "../DragControlShell"

export interface VolumeDragProps {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
  readonly testId?: string
}

export function VolumeDrag({ label, value, onChange, disabled = false, testId }: VolumeDragProps) {
  const drag = useRelativeDrag({
    value,
    min: VOLUME_MIN_DB,
    max: VOLUME_MAX_DB,
    onChange,
    disabled,
  })
  return (
    <DragControlShell
      label={label}
      display={formatVolumeDb(value)}
      normalized={normalizeVolume(value)}
      disabled={disabled}
      drag={drag}
      testId={testId}
    />
  )
}
