import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls"
import { ModalDialog } from "../dialog/ModalDialog"
import { useAppTranslation } from "../i18n"
import type { UnsavedCloseChoice } from "./unsaved-close"

export interface UnsavedCloseDialogProps {
  readonly open: boolean
  readonly onChoose: (choice: UnsavedCloseChoice) => void
}

/** Save / Don't save / Cancel before a dirty project window closes. */
export function UnsavedCloseDialog({ open, onChoose }: UnsavedCloseDialogProps) {
  const theme = useTheme()
  const { t } = useAppTranslation()
  const gap = theme.design.popover.gap
  return (
    <ModalDialog
      open={open}
      onOpenChange={next => {
        if (!next) onChoose("cancel")
      }}
      label={t("windowClose.title")}
      persistent
      testId="unsaved-close"
    >
      <div
        testId="unsaved-close-content"
        style={{
          display: "flex",
          flexDirection: "column",
          gap,
          width: theme.design.dialog.confirmationWidth,
          padding: theme.design.popover.inset,
          borderWidth: theme.design.popover.borderWidth,
          borderRadius: theme.design.popover.radius,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          color: theme.colors.foreground,
          fontSize: theme.control["--text-control-track"],
        }}
      >
        <div
          role="heading"
          aria-level={2}
          style={{ fontWeight: theme.design.typography.weights.semibold }}
        >
          {t("windowClose.title")}
        </div>
        <text style={{ color: theme.colors.mutedForeground, whiteSpace: "normal" }}>
          {t("windowClose.description")}
        </text>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", gap }}>
          <Button
            variant="ghost"
            testId="unsaved-cancel"
            label={t("common.cancel")}
            onClick={() => onChoose("cancel")}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="outline"
            testId="unsaved-discard"
            label={t("windowClose.discard")}
            onClick={() => onChoose("discard")}
          >
            {t("windowClose.discard")}
          </Button>
          <Button
            testId="unsaved-save"
            label={t("windowClose.save")}
            onClick={() => onChoose("save")}
          >
            {t("windowClose.save")}
          </Button>
        </div>
      </div>
    </ModalDialog>
  )
}
