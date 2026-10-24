import { useCallback, useEffect, useRef, useState } from "react"
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
  Checkbox,
  Label,
} from "@zoeymind/ui"
import { nativeApplicationLifecycle } from "@/shared/native/application-lifecycle"
import { getCloseBehavior, setCloseBehavior } from "@/shared/native/close-behavior"
import { projectFiles, useProjectFilesState } from "../adapters"
import { ProjectDiscardDialog } from "./ProjectDiscardDialog"
import { createApplicationCloseController } from "./application-close"
import type { ApplicationClosePort } from "@/shared/native/application-lifecycle"
import type { CloseChoice } from "./application-close"

export function ApplicationLifecycle({
  isIsolatedPreview,
  native = nativeApplicationLifecycle,
}: {
  readonly isIsolatedPreview: () => boolean
  readonly native?: ApplicationClosePort
}) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choice = useRef<((value: CloseChoice) => void) | null>(null)
  const resolveChoice = useCallback((value: CloseChoice) => {
    const resolve = choice.current
    choice.current = null
    setAsking(false)
    resolve?.(value)
  }, [])
  const saveAllowed = useCallback(() => !isIsolatedPreview(), [isIsolatedPreview])

  useEffect(() => {
    if (!native.available()) return
    let disposed = false
    const onError = (value: unknown) => {
      if (!disposed)
        setError(value === null ? null : value instanceof Error ? value.message : String(value))
    }
    const controller = createApplicationCloseController({
      native,
      behavior: getCloseBehavior,
      isBusy: () => useProjectFilesState.getState().operation.kind === "busy",
      confirmDiscard: projectFiles.confirmDiscard,
      cancelDiscard: () => projectFiles.resolveDiscard("cancel"),
      chooseClose: () =>
        new Promise<CloseChoice>(resolve => {
          choice.current = resolve
          setRemember(false)
          setAsking(true)
        }),
      resolveChoice,
      onError,
    })
    const unsubscribe = native.subscribe(request => {
      void controller.receive(request)
    }, onError)
    return () => {
      disposed = true
      controller.dispose()
      unsubscribe()
    }
  }, [native, resolveChoice])

  function selectChoice(value: "hide" | "quit") {
    if (remember && !setCloseBehavior(value === "hide" ? "tray" : "quit")) {
      setError("preferenceUnavailable")
    }
    resolveChoice(value)
  }

  return (
    <>
      <ProjectDiscardDialog saveAllowed={saveAllowed} />
      <AlertDialog
        open={asking}
        onOpenChange={open => {
          if (!open) resolveChoice("cancel")
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("windowClose.askTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("windowClose.askDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox id="remember-window-close" checked={remember} onCheckedChange={setRemember} />
            <Label htmlFor="remember-window-close">{t("windowClose.rememberChoice")}</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveChoice("cancel")}>
              {t("project.files.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={() => selectChoice("hide")}>
              {t("windowClose.minimizeToTray")}
            </AlertDialogAction>
            <AlertDialogAction onClick={() => selectChoice("quit")}>
              {t("windowClose.quitApp")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={error !== null}
        onOpenChange={open => {
          if (!open) setError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("windowClose.blockedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {error === "fileOperationBusy"
                ? t("windowClose.fileOperationBusy")
                : error === "preferenceUnavailable"
                  ? t("windowClose.preferenceUnavailable")
                  : error}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setError(null)}>
              {t("project.files.dismiss")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
