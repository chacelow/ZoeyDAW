import { useLayoutEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { TruncatedText } from "../TruncatedText"
import { Input } from "."
import type { InputSize } from "."
import type { Props, PublicInstance } from "@gpuix/react"

export interface InlineEditProps extends Omit<Props, "children" | "onChange" | "onClick" | "onKeyDown"> {
  readonly value: string
  readonly onCommit: (value: string) => void
  readonly disabled?: boolean
  readonly readOnly?: boolean
  readonly size?: InputSize
}

export function InlineEdit({
  value,
  onCommit,
  disabled = false,
  readOnly = false,
  size = "default",
  style,
  onBlur,
  ref,
  ...props
}: InlineEditProps) {
  const theme = useTheme()
  const [draft, setDraft] = useState<string | null>(null)
  const [hovered, setHovered] = useState(false)
  const editing = useRef(false)
  const display = useRef<PublicInstance | null>(null)
  const returnFocus = useRef(false)
  const { renderer } = useGpuix()
  useLayoutEffect(() => {
    if (draft === null && returnFocus.current && display.current) {
      returnFocus.current = false
      renderer?.focusElement?.(display.current.id)
    }
  }, [draft, renderer])
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const begin = () => {
    if (disabled || readOnly) return
    editing.current = true
    setDraft(value)
  }
  const finish = (commit: boolean, restoreFocus = false) => {
    if (!editing.current || draft === null) return
    editing.current = false
    returnFocus.current = restoreFocus
    if (commit && draft !== value) onCommit(draft)
    setDraft(null)
  }
  if (draft !== null) {
    return (
      <Input
        {...props}
        ref={ref}
        variant="ghost"
        size={size}
        disabled={disabled}
        readOnly={readOnly}
        style={style}
        autoFocus
        selectAllOnFocus
        value={draft}
        onValueChange={setDraft}
        onSubmit={() => finish(true, true)}
        onBlur={event => {
          finish(true)
          onBlur?.(event)
        }}
        onKeyDown={event => {
          if (event.key !== "escape") return
          consumeKey(event, "handled")
          finish(false, true)
        }}
      />
    )
  }
  return (
    <div
      {...props}
      ref={node => {
        display.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      role="button"
      aria-label={props["aria-label"] ?? value}
      aria-disabled={disabled || readOnly}
      tabIndex={disabled ? -1 : (props.tabIndex ?? 0)}
      style={sx({
        height: metrics["--spacing-control-track"],
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        paddingLeft: size === "small" ? metrics["--spacing-control-track-pad"] : theme.design.input.paddingInline,
        paddingRight: size === "small" ? metrics["--spacing-control-track-pad"] : theme.design.input.paddingInline,
        borderRadius: theme.design.shape.controlRadius,
        color: theme.colors.foreground,
        fontSize: metrics["--text-control-track"],
        opacity: disabled ? theme.design.states.disabledOpacity : 1,
        cursor: disabled ? theme.design.cursors.disabled : readOnly ? theme.design.cursors.default : theme.design.cursors.action,
        userSelect: readOnly && !disabled ? "text" : "none",
        keyboardFocusDim: false,
        hover: disabled || readOnly ? undefined : { backgroundColor: theme.colors.muted },
        focusVisible: disabled ? undefined : {
          outlineWidth: theme.design.shape.focusRingWidth,
          outlineColor: theme.colors.ring,
          outlineOffset: -theme.design.shape.focusRingWidth,
        },
      }, style)}
      onClick={begin}
      onMouseEnter={event => {
        setHovered(!disabled)
        props.onMouseEnter?.(event)
      }}
      onMouseLeave={event => {
        setHovered(false)
        props.onMouseLeave?.(event)
      }}
      onKeyDown={event => {
        if ((event.key === "enter" || event.key === "f2") && !disabled && !readOnly) {
          consumeKey(event, "handled")
          begin()
        }
      }}
      onBlur={onBlur}
    >
      <TruncatedText hovered={hovered}>{value}</TruncatedText>
    </div>
  )
}
