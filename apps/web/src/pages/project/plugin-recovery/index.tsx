import { CircleAlert } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, cn } from "@zoeymind/ui"
import { usePluginRecovery, useProjectFilesState, useProjectState } from "@/pages/project/adapters"
import type { PluginFaultStatus } from "@/shared/native/plugins"

export function PluginFaultFeedback({
  fault,
  className,
}: {
  readonly fault: PluginFaultStatus
  readonly className?: string
}) {
  const { t } = useTranslation()
  const recovery = usePluginRecovery(fault)
  const fileBusy = useProjectFilesState(state => state.operation.kind !== "idle")
  const name = useProjectState(state => {
    for (const track of state.document.tracks) {
      const device = track.devices?.find(device => device.id === fault.deviceId)
      if (device?.kind === "external") return device.plugin.name || device.id
    }
    return null
  })
  if (!name) return null
  const message = recovery.error ?? fault.message
  return (
    <div
      role="alert"
      className={cn("text-destructive flex min-w-0 items-center gap-2 text-xs", className)}
    >
      <CircleAlert className="size-4 shrink-0" />
      <span className="min-w-0 truncate" title={message}>
        {name} · {message}
      </span>
      <Button
        size="control"
        variant="outline"
        disabled={fileBusy || recovery.busy || !fault.recoverable}
        title={t("detailDevices.recoverPluginHint")}
        onClick={() => {
          void recovery.recover()
        }}
      >
        {t(recovery.busy ? "detailDevices.recoveringPlugin" : "detailDevices.recoverPlugin")}
      </Button>
    </div>
  )
}
