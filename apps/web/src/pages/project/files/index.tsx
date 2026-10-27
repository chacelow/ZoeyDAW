import { FolderOpen, Save } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "@zoeymind/i18n"
import { useState } from "react"
import { RecordingRecoveryDialog } from "./RecordingRecoveryDialog"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@zoeymind/ui"
import { projectFiles, useProjectFilesState, useProjectState } from "../adapters"
export { ProjectDiscardDialog } from "./ProjectDiscardDialog"

export function ProjectFileControls() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const busy = useProjectFilesState(state => state.operation.kind === "busy")
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="control"
        disabled={busy}
        onClick={() => void projectFiles.save()}
        aria-label={t("project.files.save")}
      >
        <Save />
        {t("project.files.save")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="control" disabled={busy} />}>
          <FolderOpen />
          {t("project.files.menu")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() =>
              void projectFiles.open().then(id => {
                if (id) navigate(`/project/${id}`)
              })
            }
          >
            {t("project.files.open")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void projectFiles.saveAs()}>
            {t("project.files.saveAs")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void projectFiles.collect()}>
            {t("project.files.collect")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void projectFiles.importAudio()}>
            {t("project.files.import")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRecoveryOpen(true)}>
            {t("project.files.recoverRecordings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RecordingRecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} />
    </>
  )
}

export function ProjectFileFeedback({
  showDependencies = false,
}: {
  readonly showDependencies?: boolean
}) {
  const { t } = useTranslation()
  const state = useProjectFilesState()
  const media = useProjectState(project => project.document.media)
  const external = projectFiles.externalDependencyCount()
  const issues = projectFiles.mediaIssues()
  return (
    <>
      <div
        className="text-muted-foreground flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-xs [&>span]:truncate"
        aria-live="polite"
      >
        {state.binding && <span title={state.binding.path}>{state.binding.path}</span>}
        {state.operation.kind === "busy" && (
          <>
            <span role="status">
              {t(`project.files.action.${state.operation.action}`)} ·{" "}
              {t(`project.files.stage.${state.operation.stage}`)}
            </span>
            <Button
              variant="ghost"
              size="control"
              disabled={state.operation.stage === "cancelling"}
              onClick={() => void projectFiles.cancel()}
            >
              {t("project.files.cancel")}
            </Button>
          </>
        )}
        {state.notice && <span role="status">{t(`project.files.notice.${state.notice}`)}</span>}
        {state.error && (
          <span role="alert" className="text-destructive">
            {state.error === "nativeUnavailable"
              ? t("project.files.nativeUnavailable")
              : `${t("project.files.failed")}: ${state.error}`}
          </span>
        )}
        {(state.error || state.notice) && (
          <Button variant="ghost" size="control" onClick={projectFiles.dismissError}>
            {t("project.files.dismiss")}
          </Button>
        )}
        {showDependencies && external > 0 && (
          <span>{t("project.files.external", { count: external })}</span>
        )}
      </div>
      {issues.length > 0 && (
        <ul
          className="flex min-w-0 shrink items-center gap-2 overflow-auto text-xs"
          aria-label={t("project.files.resolveMissing")}
        >
          {issues.map(issue => (
            <li key={issue.sourceId} className="flex items-center gap-2">
              <span>
                {media.find(source => source.id === issue.sourceId)?.name ?? issue.sourceId} ·{" "}
                {t(`project.files.issue.${issue.kind}`)}
              </span>
              <span className="text-muted-foreground truncate" title={issue.path}>
                {issue.path}
              </span>
              <Button
                variant="outline"
                size="control"
                disabled={state.operation.kind === "busy"}
                onClick={() => void projectFiles.relink(issue.sourceId)}
              >
                {t("project.files.relink")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
