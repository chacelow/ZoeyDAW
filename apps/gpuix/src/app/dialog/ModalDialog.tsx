import { useLayoutEffect, useRef } from "react"
import { Dialog, DialogBackdrop, DialogPopup, DialogPortal, useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { useAppInteraction } from "../interaction"
import type { ReactNode } from "react"
import type { PublicInstance } from "@gpuix/react"

export interface ModalDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly label: string
  readonly children: ReactNode
  readonly persistent?: boolean
  readonly testId?: string
}

export function ModalDialog({
  open,
  onOpenChange,
  label,
  children,
  persistent = false,
  testId,
}: ModalDialogProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const popup = useRef<PublicInstance | null>(null)
  const interaction = useAppInteraction()
  useLayoutEffect(() => (open ? interaction.enterModal() : undefined), [open, interaction])
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal={persistent}>
      <DialogPortal>
        <DialogBackdrop
          testId={testId ? `${testId}-backdrop` : undefined}
          style={{ backgroundColor: theme.colors.dialogBackdrop }}
        />
        <DialogPopup
          ref={popup}
          aria-label={label}
          testId={testId}
          onKeyDown={event => {
            if (event.key !== "tab" || event.defaultPrevented || !popup.current) return
            event.preventDefault()
            if (event.modifiers?.shift) renderer?.focusPreviousWithin?.(popup.current.id)
            else renderer?.focusNextWithin?.(popup.current.id)
            const focused = renderer?.getFocusedElementId?.()
            if (focused !== null && focused !== undefined) renderer?.scrollIntoView?.(focused)
          }}
        >
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  )
}
