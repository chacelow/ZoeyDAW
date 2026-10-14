/**
 * Pan drag control: -1..1, centre-origin fill, mirrors
 * `packages/ui/src/controls/PanControl`'s range and `L/C/R` formatting.
 */
import { useTheme } from "../../../../shared/theme/ThemeProvider"
import { useRelativeDrag } from "../../hooks/useRelativeDrag"
import { formatPan, PAN_MAX, PAN_MIN } from "../../model/formatters"
import { DragControlShell } from "../DragControlShell"

export interface PanDragProps {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
  readonly testId?: string
}

export function PanDrag({ label, value, onChange, disabled = false, testId }: PanDragProps) {
  const theme = useTheme()
  const drag = useRelativeDrag({
    value,
    min: PAN_MIN,
    max: PAN_MAX,
    onChange,
    disabled,
    step: 0.01,
    sensitivity: (PAN_MAX - PAN_MIN) / 150,
  })
  return (
    <DragControlShell
      label={label}
      display={formatPan(value)}
      normalized={value}
      bipolar
      color={theme.colors.chart2}
      disabled={disabled}
      drag={drag}
      testId={testId}
    />
  )
}
