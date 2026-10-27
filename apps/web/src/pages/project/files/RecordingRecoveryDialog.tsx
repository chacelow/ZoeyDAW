import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@zoeymind/ui"
import { listNativeRecordingRecovery, type RecordingRecoveryEntry } from "@/shared/native/audio"
import { recoverRecording, whenProjectBackendIdle, useProjectState } from "../adapters"

export function RecordingRecoveryDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean
  readonly onOpenChange: (value: boolean) => void
}) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<RecordingRecoveryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const epoch = useProjectState(state => state.session.editEpoch)
  const active = useRef<object | null>(null)
  useEffect(() => {
    if (!open) return
    const token = {}
    active.current = token
    setPending(true)
    setError(null)
    void listNativeRecordingRecovery()
      .then(result => {
        if (active.current === token) setEntries(result)
      })
      .catch(reason => {
        if (active.current === token) setError(String(reason))
      })
      .finally(() => {
        if (active.current === token) setPending(false)
      })
    return () => {
      active.current = null
    }
  }, [open, epoch])
  async function recover(id: string) {
    const token = active.current
    setPending(true)
    setError(null)
    try {
      if (!(await whenProjectBackendIdle())) throw new Error(t("project.files.recoveryUnavailable"))
      if (active.current !== token || token === null) return
      await recoverRecording(id)
      if (active.current === token)
        setEntries(previous => previous.filter(entry => entry.recordingId !== id))
    } catch (reason) {
      if (active.current === token) setError(String(reason))
    } finally {
      if (active.current === token) setPending(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (!pending) onOpenChange(value)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("project.files.recoverRecordings")}</DialogTitle>
          <DialogDescription>{t("project.files.recoveryDescription")}</DialogDescription>
        </DialogHeader>
        {pending && <p role="status">{t("project.files.recoveryWorking")}</p>}
        {error && (
          <p role="alert" className="text-destructive break-words">
            {error}
          </p>
        )}
        {!pending && entries.length === 0 && <p>{t("project.files.recoveryEmpty")}</p>}
        <ul className="flex max-h-80 flex-col gap-3 overflow-auto">
          {entries.map(entry => (
            <li key={entry.recordingId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate" title={entry.recordingId}>
                  {entry.recordingId}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("project.files.recoveryFiles", { count: entry.fileCount })}
                </p>
                {entry.error && (
                  <p className="text-destructive text-xs break-words">{entry.error}</p>
                )}
              </div>
              <Button
                disabled={pending || entry.state === "unreadable"}
                onClick={() => void recover(entry.recordingId)}
              >
                {t("project.files.recoverToProject")}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
