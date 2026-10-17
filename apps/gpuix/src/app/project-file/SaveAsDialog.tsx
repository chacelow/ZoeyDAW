import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button, Input, TruncatedText } from "@/ui/controls"
import { ModalDialog } from "../dialog/ModalDialog"
import { useAppTranslation } from "../i18n"
import type { ProjectLocations } from "@/platform/storage"

export interface SaveAsDialogProps {
  readonly initialName: string
  readonly initialDirectory: string
  readonly locations: ProjectLocations
  readonly chooseDirectory: (() => Promise<string | null>) | null
  readonly onSave: (path: string) => void
  readonly onCancel: () => void
}

export function SaveAsDialog({
  initialName,
  initialDirectory,
  locations,
  chooseDirectory,
  onSave,
  onCancel,
}: SaveAsDialogProps) {
  const theme = useTheme()
  const { t } = useAppTranslation()
  const [name, setName] = useState(initialName)
  const [directory, setDirectory] = useState(initialDirectory)
  const path = locations.filePath(directory, name)
  const exists = path !== null && locations.exists(path)
  const problem =
    path === null ? t("projectFile.invalidName") : exists ? t("projectFile.exists") : null
  const gap = theme.design.popover.gap
  const submit = () => {
    if (path !== null && !exists) onSave(path)
  }
  return (
    <ModalDialog
      open
      onOpenChange={open => {
        if (!open) onCancel()
      }}
      label={t("projectFile.saveAsTitle")}
      testId="save-as"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap,
          width: theme.design.dialog.formWidth,
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
          {t("projectFile.saveAsTitle")}
        </div>
        <text style={{ color: theme.colors.mutedForeground }}>{t("projectFile.name")}</text>
        <Input
          autoFocus
          selectAllOnFocus
          testId="save-as-name"
          aria-label={t("projectFile.name")}
          value={name}
          invalid={problem !== null}
          onValueChange={setName}
          onSubmit={submit}
        />
        <text style={{ color: theme.colors.mutedForeground }}>{t("projectFile.location")}</text>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap }}>
          <TruncatedText
            testId="save-as-directory"
            style={{
              flexGrow: 1,
              minWidth: 0,
            }}
          >
            {directory}
          </TruncatedText>
          {chooseDirectory ? (
            <Button
              variant="outline"
              testId="save-as-choose"
              label={t("projectFile.chooseLocation")}
              onClick={() =>
                void chooseDirectory().then(next => {
                  if (next !== null) setDirectory(next)
                })
              }
            >
              {t("projectFile.chooseLocation")}
            </Button>
          ) : null}
        </div>
        <text
          testId="save-as-status"
          style={{
            color: problem ? theme.colors.destructive : theme.colors.mutedForeground,
            whiteSpace: "normal",
          }}
        >
          {problem ?? t("projectFile.destination", { path })}
        </text>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", gap }}>
          <Button
            variant="ghost"
            testId="save-as-cancel"
            label={t("common.cancel")}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            testId="save-as-confirm"
            label={t("projectFile.save")}
            disabled={problem !== null}
            onClick={submit}
          >
            {t("projectFile.save")}
          </Button>
        </div>
      </div>
    </ModalDialog>
  )
}
