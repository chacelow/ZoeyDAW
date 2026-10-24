import { useTranslation } from "@zoeymind/i18n"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@zoeymind/ui"
import { projectFiles, useProjectFilesState } from "../adapters"

export function ProjectDiscardDialog({
  saveAllowed,
}: { readonly saveAllowed?: () => boolean } = {}) {
  const { t } = useTranslation()
  const open = useProjectFilesState(state => state.confirmDiscard)
  const canSave = saveAllowed?.() ?? true
  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (!next) projectFiles.resolveDiscard("cancel")
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(canSave ? "project.files.unsavedTitle" : "project.files.previewUnsavedTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              canSave
                ? "project.files.unsavedDescription"
                : "project.files.previewUnsavedDescription"
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => projectFiles.resolveDiscard("cancel")}>
            {t("project.files.keepEditing")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => projectFiles.resolveDiscard("discard")}
          >
            {t("project.files.discard")}
          </AlertDialogAction>
          {canSave && (
            <AlertDialogAction onClick={() => projectFiles.resolveDiscard("save")}>
              {t("project.files.save")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
