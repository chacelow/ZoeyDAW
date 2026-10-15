import { Dialog, DialogBackdrop, DialogPopup, DialogPortal } from "@gpuix/react"
import { colorMix } from "@/shared/theme/color-mix"
import { useTheme } from "@/shared/theme/ThemeProvider"
import type { ReactNode } from "react"

export interface ModalDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly label: string
  readonly children: ReactNode
  /** Keep the dialog open when the dimmed backdrop is pressed. */
  readonly persistent?: boolean
  readonly testId?: string
}

/**
 * The application's only modal surface: a full-window layer, a light dim and a centered
 * popup. The dim mirrors the web dialog overlay `bg-black/10` (apps/web index.css turns its
 * blur off), mixed from the theme foreground so it darkens both appearances slightly.
 */
export function ModalDialog({
  open,
  onOpenChange,
  label,
  children,
  persistent = false,
  testId,
}: ModalDialogProps) {
  const theme = useTheme()
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal={persistent}>
      <DialogPortal>
        <DialogBackdrop
          testId={testId ? `${testId}-backdrop` : undefined}
          style={{ backgroundColor: colorMix(theme.colors.foreground, 10, "transparent") }}
        />
        <DialogPopup aria-label={label} testId={testId}>
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  )
}
