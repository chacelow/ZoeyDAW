import { AlertTriangle } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"
import { Button } from "./button"

interface ConfirmDialogProperties {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description: string
  readonly confirmText?: string
  readonly cancelText?: string
  readonly variant?: "default" | "destructive"
  readonly onConfirm: () => void | Promise<void>
  readonly loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  variant = "default",
  onConfirm,
  loading = false,
}: ConfirmDialogProperties) {
  const { t } = useTranslation()
  const confirmLabel = confirmText ?? t("common.confirm")
  const cancelLabel = cancelText ?? t("common.cancel")
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) {
      return
    }
    await onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {variant === "destructive" && (
            <div className="mb-2 flex items-center gap-3">
              <div className="bg-destructive/10 flex size-10 flex-shrink-0 items-center justify-center rounded-full">
                <AlertTriangle className="text-destructive size-5" />
              </div>
            </div>
          )}
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              autoFocus
              data-testid="confirm-dialog-confirm"
              variant={variant === "destructive" ? "destructive" : "default"}
              disabled={loading}
            >
              {loading ? t("ui.confirmDialog.processing") : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
