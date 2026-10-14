/**
 * Renders an `AutomationLane`'s points as a smooth curve. gpuix's `<svg>` only accepts raw markup
 * as a `source` and paints it as a single-color tinted image (see
 * `docs/research/gpuix-rendering-alternatives.md`); that is a correct fit here since an automation
 * curve is one color per lane, tinted through `style.color` the same way every other gpuix icon is.
 * Path data comes from d3-shape and the markup from `serialiseSvg`: nothing is hand-written.
 */
import { sx } from "@/shared/theme/style"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { serialiseSvg } from "@/shared/svg/serialise"
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
  const source = serialiseSvg(
    [
      [
        "path",
        {
          d,
          fill: "none",
          stroke: "black",
          "stroke-width": STROKE_WIDTH_PX,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
      ],
      ...anchors.map(
        anchor =>
          [
            "circle",
            {
              cx: anchor.x.toFixed(2),
              cy: anchor.y.toFixed(2),
              r: ANCHOR_RADIUS_PX,
              fill: "black",
            },
          ] as const
      ),
    ],
    { viewBox: `0 0 ${width} ${height}` }
  )

  return (
    <svg
      source={source}
      aria-label={ariaLabel ?? "Automation curve"}
      style={sx(
        {
          width,
          height,
          borderRadius: 4,
          borderWidth: theme.project.trackBorder,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          color,
        },
        style
      )}
    />
  )
}
