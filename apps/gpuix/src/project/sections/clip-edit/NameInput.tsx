import { useRef } from "react"
import { projectActions, useProjectEditGesture } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Input } from "@/ui/controls"

/**
Clip name, edited live as one transaction: the first keystroke opens it, Enter, blur or an outside
press commits, Escape restores. The text field owns its keys, so nothing reaches window shortcuts.
*/
export function ClipNameInput({
  clipId,
  value,
  label,
}: {
  readonly clipId: string
  readonly value: string
  readonly label: string
}) {
  const theme = useTheme()
  const gesture = useProjectEditGesture((value: string) =>
    projectActions.updateClip(clipId, { label: value })
  )
  const editing = useRef(false)
  const finish = (cancel: boolean) => {
    if (!editing.current) return
    editing.current = false
    if (cancel) gesture.onGestureCancel()
    else gesture.onGestureEnd()
  }
  return (
    <Input
      testId="clip-name"
      aria-label={label}
      value={value}
      onValueChange={value => {
        if (!editing.current) {
          editing.current = true
          gesture.onGestureStart()
        }
        gesture.onChange(value)
      }}
      onSubmit={() => finish(false)}
      onBlur={() => finish(false)}
      onMouseDownOutside={() => finish(false)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key !== "escape") return
        event.preventDefault()
        finish(true)
      }}
      style={{
        width: theme.project.identityWidth * 2,
        flexShrink: 1,
        fontWeight: 600,
        backgroundColor: "transparent",
        borderColor: "transparent",
      }}
    />
  )
}
