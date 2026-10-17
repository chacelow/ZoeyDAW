import type { ReactNode } from "react"
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/ui/controls"
import { projectActions, useProjectState } from "@/project/adapters"
import { useAppTranslation } from "../i18n"
import { useProjectFiles } from "../project-file/ProjectFileProvider"

export function WorkstationMenus({
  view,
  isProject,
  onOpenSettings,
  onOpenGallery,
  onOpenHome,
  onClose,
}: {
  readonly view?: ReactNode
  readonly isProject: boolean
  readonly onOpenSettings: () => void
  readonly onOpenGallery: () => void
  readonly onOpenHome: () => void
  readonly onClose: () => void
}) {
  const { t } = useAppTranslation()
  const files = useProjectFiles()
  const canUndo = useProjectState(state => state.session.canUndo)
  const canRedo = useProjectState(state => state.session.canRedo)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost">{t("titlebar.file")}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={files.open}>{t("titlebar.open")}</DropdownMenuItem>
          <DropdownMenuItem disabled={!isProject} onSelect={() => void files.save()}>
            {t("titlebar.save")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onClose}>{t("titlebar.close")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost">{t("titlebar.edit")}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled={!isProject || !canUndo} onSelect={projectActions.undo}>
            {t("titlebar.undo")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!isProject || !canRedo} onSelect={projectActions.redo}>
            {t("titlebar.redo")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {view ?? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost">{t("titlebar.view")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onOpenSettings}>{t("titlebar.settings")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost">{t("titlebar.help")}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onOpenGallery}>{t("titlebar.gallery")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenHome}>{t("titlebar.home")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenSettings}>{t("titlebar.settings")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
