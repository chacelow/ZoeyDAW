/** Numeric pad with one-sided volume fill or a centre-origin pan fill. */
import { useTheme } from "../../../../shared/theme/ThemeProvider"
import { sx } from "../../../../shared/theme/style"
import type { RelativeDragHandlers } from "../../hooks/useRelativeDrag"

export interface DragControlShellProps {
  readonly label: string
  readonly display: string
  /** 0..1 volume fill; -1..1 centre-origin pan fill. */
  readonly normalized: number
  readonly bipolar?: boolean
  readonly color?: string
  readonly disabled?: boolean
  readonly drag: RelativeDragHandlers
  readonly testId?: string
}

export function DragControlShell({
  label,
  display,
  normalized,
  bipolar = false,
  color,
  disabled = false,
  drag,
  testId,
}: DragControlShellProps) {
  const theme = useTheme()
  const fillColor = color ?? theme.colors.primary
  const containerStyle = sx({
    position: "relative",
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    height: theme.control["--spacing-control-track"],
    display: "flex",
    flexDirection: "row",
    borderRadius: theme.control["--spacing-control-gap"],
    overflow: "hidden",
    backgroundColor: theme.colors.muted,
    cursor: disabled ? "not-allowed" : "ew-resize",
    userSelect: "none",
    hover: disabled ? undefined : { backgroundColor: theme.colors.arrangementSurfaceSelected },
    opacity: disabled ? 0.5 : 1,
  })
  const fill = (widthPercent: number, justifyContent: "flex-start" | "flex-end") => (
    <div
      style={sx({
        pointerEvents: "none",
        flexGrow: 1,
        flexBasis: 0,
        display: "flex",
        justifyContent,
        overflow: "hidden",
      })}
    >
      <div
        style={sx({
          pointerEvents: "none",
          width: `${widthPercent}%`,
          height: "100%",
          backgroundColor: fillColor,
          opacity: 0.3,
        })}
      />
    </div>
  )
  const textOverlay = (
    <div
      style={sx({
        pointerEvents: "none",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <text
        style={{
          pointerEvents: "none",
          color: theme.colors.foreground,
          fontSize: theme.control["--text-control-track"],
          fontWeight: 600,
        }}
      >
        {display}
      </text>
    </div>
  )
  return (
    <div
      role="slider"
      aria-valuetext={display}
      aria-valuenow={normalized}
      aria-valuemin={bipolar ? -1 : 0}
      aria-valuemax={1}
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={0}
      testId={testId}
      style={containerStyle}
      onMouseDown={drag.onMouseDown}
      onMouseMove={drag.onMouseMove}
      onMouseUp={drag.onMouseUp}
    >
      {bipolar ? (
        <>
          {fill(Math.max(0, -normalized) * 100, "flex-end")}
          <div
            style={sx({
              width: theme.project.trackBorder / 2,
              flexShrink: 0,
              pointerEvents: "none",
              backgroundColor: theme.colors.border,
            })}
          />
          {fill(Math.max(0, normalized) * 100, "flex-start")}
        </>
      ) : (
        fill(normalized * 100, "flex-start")
      )}
      {textOverlay}
    </div>
  )
}
