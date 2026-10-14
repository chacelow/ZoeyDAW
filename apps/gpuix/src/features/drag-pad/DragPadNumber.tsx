/**
 * DragPadNumber — relative-drag numeric control.
 *
 * Interaction contract (see `README.md` for the full rationale and the one
 * known gap):
 *
 * - Drag maps vertical distance from the press point to a value delta
 *   (`distance × step`), never absolute pointer position. One shared,
 *   range-independent pixel scale (`DRAG_PIXELS_PER_STEP`) drives every
 *   instance.
 * - Hovering accepts wheel adjustment; gpuix only delivers `onScroll` while
 *   the pointer is over the element, so no extra hover-gating is needed.
 *   Wheel never touches the cursor.
 * - A plain click (no drag) enters `preEdit`: border highlight, text-beam
 *   cursor hint, no background swap. The icon stays mounted throughout.
 * - Typing a digit/`.`/`-`/Backspace while in `preEdit` upgrades to
 *   `editing`, mounting a live-updating `<input>`.
 * - Double-click (`event.clickCount >= 2`) resets to `defaultValue`.
 * - Width is reserved once from `format(min)`/`format(max)`/`format(defaultValue)`
 *   and held fixed across idle/preEdit/editing so typing never resizes the
 *   control.
 */
import { useMemo } from "react"
import { useTheme } from "../../shared/theme/ThemeProvider"
import { sx } from "../../shared/theme/style"
import { DragPadIcon } from "./icon"
import { formatNumericValue } from "./numberModel"
import { useDragPad } from "./useDragPad"
import { estimateControlWidth } from "./width"
import type { ReactNode } from "react"

export interface DragPadNumberProps {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
  readonly min: number
  readonly max: number
  readonly step: number
  readonly defaultValue?: number
  readonly format?: (value: number) => string
  readonly parse?: (raw: string) => number
  readonly disabled?: boolean
  /** Which theme control-metrics token set sizes this instance. */
  readonly variant?: "default" | "transport"
  readonly icon?: ReactNode
  readonly testId?: string
}

export function DragPadNumber({
  label,
  value,
  onChange,
  min,
  max,
  step,
  defaultValue,
  format,
  parse,
  disabled = false,
  variant = "default",
  icon,
  testId,
}: DragPadNumberProps) {
  const theme = useTheme()
  const metrics = variant === "transport" ? theme.transportControl : theme.control

  const toText = useMemo(
    () => format ?? formatNumericValue(min, max, step),
    [format, min, max, step]
  )

  const pad = useDragPad({
    value,
    onChange,
    min,
    max,
    step,
    defaultValue,
    disabled,
    format: toText,
    parse,
  })

  const samples = useMemo(() => {
    const widest = [toText(min), toText(max)]
    if (defaultValue !== undefined) {
      widest.push(toText(defaultValue))
    }
    return widest
  }, [toText, min, max, defaultValue])

  const fontSize = metrics["--text-control-track"]
  const iconSize = metrics["--spacing-control-icon"]
  const iconGap = metrics["--spacing-control-gap"]
  const trackPad = metrics["--spacing-control-track-pad"]
  const height = metrics["--spacing-control-track"]

  const width = useMemo(
    () => estimateControlWidth({ samples, fontSize, iconSize, iconGap, paddingX: trackPad }),
    [samples, fontSize, iconSize, iconGap, trackPad]
  )

  const shellStyle = sx({
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: iconGap,
    width,
    height,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingLeft: trackPad,
    paddingRight: trackPad,
    opacity: disabled ? 0.5 : 1,
  })

  const iconNode = icon ?? <DragPadIcon size={iconSize} color={theme.colors.mutedForeground} />

  if (pad.mode === "editing") {
    return (
      <div testId={testId} style={sx(shellStyle, { cursor: "text" })}>
        {iconNode}
        <input
          autoFocus
          aria-label={label}
          value={pad.draft}
          onChange={event => pad.handleEditChange(event.value ?? "")}
          onSubmit={pad.commitEditing}
          onBlur={pad.commitEditing}
          onKeyDown={pad.handleEditKeyDown}
          style={{
            flexGrow: 1,
            fontSize,
            fontFamily: "Menlo",
            color: theme.colors.foreground,
            textAlign: "center",
            cursor: "text",
          }}
        />
      </div>
    )
  }

  const isPreEdit = pad.mode === "preEdit"

  return (
    <div
      testId={testId}
      role="spinbutton"
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={0}
      style={sx(shellStyle, {
        cursor: disabled ? "not-allowed" : isPreEdit ? "text" : "ns-resize",
        borderColor: isPreEdit ? theme.colors.ring : theme.colors.border,
      })}
      onMouseDown={pad.handleMouseDown}
      onMouseMove={pad.handleMouseMove}
      onMouseUp={pad.handleMouseUp}
      onScroll={pad.handleScroll}
      onKeyDown={pad.handlePreEditKeyDown}
      onBlur={pad.handleBlur}
    >
      {iconNode}
      <text style={{ fontSize, fontFamily: "Menlo", color: theme.colors.foreground }}>
        {pad.display}
      </text>
    </div>
  )
}
