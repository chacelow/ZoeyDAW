/**
 * Renders an `AutomationLane`'s points as a smooth curve. gpuix's `<svg>` only accepts raw markup
 * as a `source` and paints it as a single-color tinted image (see
 * `docs/research/gpuix-rendering-alternatives.md`); that is a correct fit here since an automation
 * curve is one color per lane, tinted through `style.color` the same way every other gpuix icon is.
 * Path data comes from `shared/svg/paths` (d3) and the markup from `Shape`: nothing is hand-written.
 */
import { sx } from "@/shared/theme/style"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Shape } from "@/shared/svg/Shape"
import { buildAutomationCurveGeometry } from "./model/automation-curve"
import type { StyleInput } from "@/shared/theme/style"
import type { AutomationPoint } from "@/shared/model/types"

export interface AutomationCurveViewProps {
  points: readonly AutomationPoint[]
  /** Curve color, typically the owning track's color. */
  color: string
  width: number
  height: number
  /** Accessible name for the curve, e.g. the lane's parameter ("Volume"). */
  ariaLabel?: string
  style?: StyleInput
}

const ANCHOR_RADIUS_PX = 3
const STROKE_WIDTH_PX = 2

export function AutomationCurveView({
  points,
  color,
  width,
  height,
  ariaLabel,
  style,
}: AutomationCurveViewProps) {
  const theme = useTheme()
  const { d, anchors } = buildAutomationCurveGeometry(points, width, height)
  return (
    <Shape
      width={width}
      height={height}
      paths={[{ d, strokeWidth: STROKE_WIDTH_PX }]}
      circles={anchors.map(anchor => ({ cx: anchor.x, cy: anchor.y, r: ANCHOR_RADIUS_PX }))}
      color={color}
      label={ariaLabel ?? "Automation curve"}
      style={sx(
        {
          borderRadius: 4,
          borderWidth: theme.project.trackBorder,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
        },
        style
      )}
    />
  )
}
